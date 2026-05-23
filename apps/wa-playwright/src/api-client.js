// src/api-client.js — HTTP client for the FastAPI backend
import { logger } from './logger.js';
 
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
const USERNAME = process.env.API_USERNAME || 'admin';
const PASSWORD = process.env.API_PASSWORD || 'changeme';
 
let _token = null;
 
export function getToken() { return _token; }
 
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
 
/**
 * Attempt to register a new user (useful on first run).
 */
export async function registerUser() {
  try {
    await fetchJSON(`${BASE_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: USERNAME, email: `${USERNAME}@example.com`, password: PASSWORD }),
    });
    logger.info('User "%s" registered.', USERNAME);
  } catch (err) {
    // 400 = already exists (fine), anything else = backend offline (also fine, warn only)
    if (!err.message.includes('400')) {
      logger.warn('Register attempt skipped: %s', err.message);
    }
  }
}
 
/**
 * Authenticate and cache JWT token.
 * Does NOT throw — runs offline if backend is unavailable.
 */
export async function authenticate() {
  logger.info('Authenticating with backend as "%s"…', USERNAME);
  try {
    const data = await fetchJSON(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    _token = data.access_token;
    logger.info('Backend authentication successful.');
  } catch (err) {
    logger.warn('Backend offline — running without API push: %s', err.message);
    // No throw — WhatsApp scraping continues without backend
  }
}
 
/**
 * Re-authenticate if token has expired (call on 401 responses).
 */
async function reauthenticate() {
  logger.info('Token expired — re-authenticating…');
  _token = null;
  await authenticate();
}
 
function authHeaders() {
  if (!_token) throw new Error('No token — backend is offline.');
  return { Authorization: `Bearer ${_token}` };
}
 
/**
 * Push a single message to the backend.
 * Retries once on 401 (token expiry).
 */
export async function pushMessage(message) {
  if (!_token) return null; // backend offline, skip silently
  try {
    const result = await fetchJSON(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(message),
    });
    logger.debug('Message pushed id=%s contact=%s', result.id, result.contact);
    return result;
  } catch (err) {
    // Retry once on token expiry
    if (err.message.includes('401')) {
      await reauthenticate();
      if (!_token) return null;
      try {
        return await fetchJSON(`${BASE_URL}/messages`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(message),
        });
      } catch (err2) {
        logger.error('pushMessage retry failed: %s', err2.message);
        return null;
      }
    }
    logger.error('Failed to push message: %s', err.message);
    return null;
  }
}
 
/**
 * Push a batch of messages — continues on individual failures.
 */
export async function pushMessages(messages) {
  if (!_token) return [];
  const results = [];
  let failed = 0;
  for (const msg of messages) {
    const result = await pushMessage(msg);
    if (result) results.push(result);
    else failed++;
  }
  if (failed > 0) logger.warn('pushMessages: %d/%d failed', failed, messages.length);
  return results;
}
 
/**
 * Push group metadata to the backend.
 */
export async function pushGroup(group) {
  if (!_token) return null;
  try {
    const result = await fetchJSON(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(group),
    });
    logger.debug('Group pushed id=%s name=%s', result.id, result.group_name);
    return result;
  } catch (err) {
    if (err.message.includes('401')) {
      await reauthenticate();
    }
    logger.error('Failed to push group: %s', err.message);
    return null;
  }
}
 