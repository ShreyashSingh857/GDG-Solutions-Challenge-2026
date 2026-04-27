import { EventEmitter } from 'events';
import { TOPICS } from './topics.js';

const MESSAGE_LOG_LIMIT = Number.parseInt(process.env.EVENT_BUS_REPLAY_LIMIT ?? '120', 10); // per-topic replay depth
const MESSAGE_LOG_BYTES_LIMIT = Number.parseInt(process.env.EVENT_BUS_REPLAY_BYTES_LIMIT ?? String(5 * 1024 * 1024), 10); // per-topic byte cap
const MAX_RETRIES = 5;

function estimateSizeBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

class EventBroker extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    // In-memory message log per topic for replay on reconnect
    this.messageLog = {};
    this.messageLogBytes = {};
    Object.values(TOPICS).forEach((topic) => {
      this.messageLog[topic] = [];
      this.messageLogBytes[topic] = 0;
    });
  }

  /**
   * Publish a message to a topic.
   * @param {string} topic - One of the TOPICS constants
   * @param {object} payload - AgentPayload object
   * @param {number} retryCount - Internal retry counter
   */
  publish(topic, payload, retryCount = 0) {
    if (!Object.values(TOPICS).includes(topic)) {
      console.error(`[EventBroker] Unknown topic: ${topic}`);
      return;
    }

    const message = {
      ...payload,
      _topic: topic,
      _publishedAt: new Date().toISOString(),
      _retry: retryCount,
    };

    try {
      // Store in message log for replay
      if (!this.messageLog[topic]) this.messageLog[topic] = [];
      if (typeof this.messageLogBytes[topic] !== 'number') this.messageLogBytes[topic] = 0;

      const sizeBytes = estimateSizeBytes(message);
      this.messageLog[topic].push({ ...message, _sizeBytes: sizeBytes });
      this.messageLogBytes[topic] += sizeBytes;

      while (
        this.messageLog[topic].length > MESSAGE_LOG_LIMIT ||
        this.messageLogBytes[topic] > MESSAGE_LOG_BYTES_LIMIT
      ) {
        const removed = this.messageLog[topic].shift();
        this.messageLogBytes[topic] -= Number(removed?._sizeBytes || 0);
      }

      if (this.messageLogBytes[topic] < 0) {
        this.messageLogBytes[topic] = 0;
      }

      this.emit(topic, message);
      console.log(`[EventBroker] Published to ${topic} | traceId: ${payload.traceId}`);
    } catch (err) {
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 100;
        console.warn(`[EventBroker] Retry ${retryCount + 1}/${MAX_RETRIES} for topic ${topic} in ${delay}ms`);
        setTimeout(() => this.publish(topic, payload, retryCount + 1), delay);
      } else {
        console.error(`[EventBroker] Failed to publish to ${topic} after ${MAX_RETRIES} retries`, err);
        // Dead-letter: emit to a special error topic for logging
        this.emit('dead-letter', { topic, payload, error: err.message });
      }
    }
  }

  /**
   * Get the last N messages for a topic (for replay on subscriber reconnect).
   * @param {string} topic
   * @returns {object[]}
   */
  getReplay(topic) {
    const messages = this.messageLog[topic] || [];
    return messages.map(({ _sizeBytes, ...message }) => message);
  }

  getReplaySince(topic, since = 0) {
    return this.getReplay(topic).filter((message) => {
      const publishedAt = message._publishedAt ? new Date(message._publishedAt).getTime() : 0;
      return publishedAt > since;
    });
  }
}

// Singleton broker instance shared across the entire event-bus service
export const broker = new EventBroker();
