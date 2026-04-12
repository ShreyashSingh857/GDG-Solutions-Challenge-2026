import { EventEmitter } from 'events';
import { TOPICS } from './topics.js';

const MESSAGE_LOG_LIMIT = 50; // keep last 50 messages per topic for replay
const MAX_RETRIES = 5;

class EventBroker extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    // In-memory message log per topic for replay on reconnect
    this.messageLog = {};
    Object.values(TOPICS).forEach((topic) => {
      this.messageLog[topic] = [];
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
      this.messageLog[topic].push(message);
      if (this.messageLog[topic].length > MESSAGE_LOG_LIMIT) {
        this.messageLog[topic].shift();
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
    return this.messageLog[topic] || [];
  }
}

// Singleton broker instance shared across the entire event-bus service
export const broker = new EventBroker();
