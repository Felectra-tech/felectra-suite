// src/auth.js — QR login + session persistence (Puppeteer)
import puppeteer from 'puppeteer';
import qrcode from 'qrcode-terminal';
import { logger } from './logger.js';

const WA_URL   = process.env.WA_URL    || 'https://web.whatsapp.com';
const SESSION  = process.env.SESSION_DIR || './session';
const HEADLESS = process.env.HEADLESS === 'true';

/**
 * Launch Puppeteer with a persistent user data directory.
 * Returns { browser, page }.
 */
export async function launchBrowser() {
  logger.info('Launching Puppeteer (session dir: %s)', SESSION);
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: SESSION,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
  const pages = await browser.pages();
  const page  = pages[0] || await browser.newPage();
  return { browser, page };
}

/**
 * Navigate to WhatsApp Web and handle QR / already-logged-in states.
 */
export async function ensureLoggedIn(page) {
  logger.info('Navigating to %s', WA_URL);
  await page.goto(WA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Fast path: already logged in
  const chatList = await page.$('[data-testid="chat-list"]').catch(() => null);
  if (chatList) {
    logger.info('Session restored — already logged in.');
    return;
  }

  logger.info('Waiting for QR code or login…');
  await page.waitForSelector(
    'canvas[aria-label="Scan this QR code to link a device"], [data-testid="chat-list"]',
    { timeout: 120_000 }
  );

  const qrCanvas = await page.$('canvas[aria-label="Scan this QR code to link a device"]');
  if (qrCanvas) {
    const dataUrl = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-label="Scan this QR code to link a device"]');
      return c?.toDataURL('image/png');
    });
    logger.info('QR code detected — scan with WhatsApp:');
    if (dataUrl) qrcode.generate(dataUrl, { small: true });

    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 120_000 });
  }

  logger.info('Login successful!');
}

/**
 * Wait for WhatsApp Web to fully load.
 */
export async function waitForReady(page) {
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 60_000 });
  await sleep(2_000);
  logger.info('WhatsApp Web is ready.');
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
