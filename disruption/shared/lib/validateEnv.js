export function validateEnv(service, requiredVars = []) {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[${service}] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}
