export function createLogger(service) {
  const write = (level, message, fields = {}) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...fields,
    };
    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    debug: (message, fields) => write('debug', message, fields),
  };
}
