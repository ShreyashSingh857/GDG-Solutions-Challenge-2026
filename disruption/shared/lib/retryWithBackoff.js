export async function retryWithBackoff(fn, { maxRetries = 3, baseDelayMs = 1000 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt += 1;
      if (attempt >= maxRetries) throw err;

      const delay = baseDelayMs * (2 ** attempt) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('retryWithBackoff exhausted unexpectedly');
}
