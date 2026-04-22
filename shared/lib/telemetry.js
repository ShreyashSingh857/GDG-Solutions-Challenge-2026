import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk = null;

export function startTelemetry(serviceName) {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;
  if (sdk) return sdk;

  sdk = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  const shutdown = () => sdk?.shutdown().catch(() => null);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return sdk;
}