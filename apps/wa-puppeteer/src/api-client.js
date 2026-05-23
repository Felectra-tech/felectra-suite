// src/api-client.js — HTTP client for the FastAPI backend (Puppeteer)
import { logger } from './logger.js';
import { parseWATimestamp } from './utils.js';
 
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
const USERNAME = process.env.API_USERNAME || 'admin';
const PASSWORD = process.env.API_PASSWORD || 'changeme';
 
let _token = null;
 
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}
 
export async function registerUser() {
  try {
    await fetchJSON(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: USERNAME, email: `${USERNAME}@example.com`, password: PASSWORD }),
    });
    logger.info('User "%s" registered.', USERNAME);
  } catch (err) {
    if (!err.message.includes('400')) logger.warn('Register: %s', err.message);
  }
}
 
export async function authenticate() {
  logger.info('Authenticating with backend as "%s"…', USERNAME);
  const data = await fetchJSON(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  _token = data.access_token;
  logger.info('Backend authentication successful.');
}
 
function authHeaders() {
  if (!_token) throw new Error('Not authenticated.');
  return { Authorization: `Bearer ${_token}` };
}
 
/** Normalise a message before sending — fixes timestamp format. */
function normalise(message) {
  return {
    ...message,
    timestamp: parseWATimestamp(message.timestamp),
  };
}
 
export async function pushMessage(message) {
  try {
    const result = await fetchJSON(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(normalise(message)),
    });
    logger.debug('Message pushed id=%s', result.id);
    return result;
  } catch (err) {
    logger.error('pushMessage failed: %s', err.message);
    throw err;
  }
}
 
export async function pushMessages(messages) {
  const results = [];
  for (const msg of messages) {
    try { results.push(await pushMessage(msg)); } catch { /* already logged */ }
  }
  return results;
}
 
export async function pushGroup(group) {
  try {
    const result = await fetchJSON(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(group),
    });
    logger.debug('Group pushed id=%s', result.id);
    return result;
  } catch (err) {
    logger.error('pushGroup failed: %s', err.message);
    throw err;
  }
}
 