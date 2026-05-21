// src/logger.js
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase() || 'info'] ?? 1;

function log(level, ...args) {
  if (LEVELS[level] >= currentLevel) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] [puppeteer]`;
    if (level === 'error') {
      console.error(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info:  (...args) => log('info',  ...args),
  warn:  (...args) => log('warn',  ...args),
  error: (...args) => log('error', ...args),
};
