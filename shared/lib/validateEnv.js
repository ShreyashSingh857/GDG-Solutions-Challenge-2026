export function validateEnv(service, requiredVars = []) {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`[${service}] Missing required env vars: ${missing.join(', ')}`);
  }
}
