import 'dotenv/config';

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || 'http://localhost:4000';

/**
 * Publish an AgentPayload to a topic on the event bus.
 * @param {string} topic - One of the TOPICS constants
 * @param {import('./types/AgentPayload.js').AgentPayload} agentPayload
 * @returns {Promise<void>}
 */
export async function publish(topic, agentPayload) {
  try {
    const res = await fetch(`${EVENT_BUS_URL}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, payload: agentPayload }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`EventBus publish failed: ${err.error}`);
    }

    console.log(`[EventBusClient] Published to ${topic} | traceId: ${agentPayload.traceId}`);
  } catch (err) {
    console.error('[EventBusClient] publish() error:', err.message);
    throw err;
  }
}

/**
 * Subscribe to a topic on the event bus via SSE (Server-Sent Events).
 * This function connects to the event bus and calls onMessage for each event received.
 * It also receives replayed messages from the last 50 events immediately on connect.
 *
 * NOTE: This uses the native EventSource from Node.js 18+. If running Node < 18,
 * install the `eventsource` npm package and import it here.
 *
 * @param {string} topic - One of the TOPICS constants
 * @param {function(object): void} onMessage - Callback called with each parsed message
 * @returns {EventSource} - The EventSource instance (call .close() to unsubscribe)
 */
export function subscribe(topic, onMessage) {
  const url = `${EVENT_BUS_URL}/subscribe/${topic}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (err) {
      console.error(`[EventBusClient] Failed to parse message from ${topic}:`, err.message);
    }
  };

  es.onerror = (err) => {
    console.error(`[EventBusClient] SSE error on topic ${topic}:`, err);
  };

  es.onopen = () => {
    console.log(`[EventBusClient] Subscribed to topic: ${topic}`);
  };

  return es;
}
