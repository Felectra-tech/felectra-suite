// src/auth.js — QR login + session persistence (Playwright)
import { chromium } from 'playwright';
import qrcode from 'qrcode-terminal';
import { logger } from './logger.js';
 
const WA_URL  = process.env.WA_URL      || 'https://web.whatsapp.com';
const SESSION = process.env.SESSION_DIR  || './session';
const HEADLESS = process.env.HEADLESS   === 'true';
 
/**
 * Launch a persistent Chromium context (session saved to SESSION_DIR).
 * Returns { context, page }.
 */
export async function launchBrowser() {
  logger.info('Launching Chromium (persistent session: %s)', SESSION);
  const context = await chromium.launchPersistentContext(SESSION, {
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--disable-extensions',
    ],
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}
 
/**
 * Navigate to WhatsApp Web and handle QR / already-logged-in states.
 * Resolves when the chat list is visible.
 */
export async function ensureLoggedIn(page) {
  logger.info('Navigating to %s', WA_URL);
  await page.goto(WA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
 
  // Fast-path: already logged in
  const chatList = await page.$('[data-testid="chat-list"]').catch(() => null);
  if (chatList) {
    logger.info('Session restored — already logged in.');
    return;
  }
 
  // Wait for QR canvas OR chat-list
  logger.info('Waiting for QR code or login confirmation...');
  await page.waitForSelector(
    'canvas[aria-label="Scan this QR code to link a device"], [data-testid="chat-list"]',
    { timeout: 120000 }
  );
 
  const qrCanvas = await page.$('canvas[aria-label="Scan this QR code to link a device"]');
  if (qrCanvas) {
    logger.info('QR code detected — please open WhatsApp on your phone:');
    logger.info('Phone → Linked Devices → Link a Device → scan the browser screen');
    logger.info('Waiting for scan (up to 2 minutes)...');
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 120000 });
  }
 
  logger.info('Login successful!');
}
 
/**
 * Wait for WhatsApp Web to finish loading after login.
 */
export async function waitForReady(page) {
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 60000 });
  await page.waitForTimeout(2000);
  logger.info('WhatsApp Web is ready.');
}
 