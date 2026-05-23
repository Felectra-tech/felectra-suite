// src/auth.js — QR login + session persistence (Puppeteer)
import puppeteer from 'puppeteer';
import qrcode from 'qrcode-terminal';
import { logger } from './logger.js';
 
const WA_URL   = process.env.WA_URL    || 'https://web.whatsapp.com';
const SESSION  = process.env.SESSION_DIR || './session';
const HEADLESS = process.env.HEADLESS === 'true';
 
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
    // Increase protocol timeout to prevent mid-scan disconnects
    protocolTimeout: 120_000,
  });
  const pages = await browser.pages();
  const page  = pages[0] || await browser.newPage();
 
  // Increase default navigation + JS timeouts
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(60_000);
 
  return { browser, page };
}
 
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
    '[data-ref], [data-testid="chat-list"]',
    { timeout: 120_000 }
  );
 
  const qrEl = await page.$('[data-ref]');
  if (qrEl) {
    // ✅ FIX: use data-ref attribute directly (the actual QR string), not canvas dataURL
    const qrData = await page.evaluate(() => {
      const el = document.querySelector('[data-ref]');
      return el?.getAttribute('data-ref') || null;
    });
 
    if (qrData) {
      logger.info('QR code detected — scan with WhatsApp:');
      qrcode.generate(qrData, { small: true });
    } else {
      logger.warn('QR element found but data-ref is empty — waiting for WhatsApp to populate it…');
      // Poll for data-ref to be populated
      for (let i = 0; i < 20; i++) {
        await sleep(1_000);
        const ref = await page.evaluate(() => document.querySelector('[data-ref]')?.getAttribute('data-ref'));
        if (ref) {
          logger.info('QR code ready — scan with WhatsApp:');
          qrcode.generate(ref, { small: true });
          break;
        }
      }
    }
 
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 120_000 });
  }
 
  logger.info('Login successful!');
}
 
export async function waitForReady(page) {
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 60_000 });
  await sleep(2_000);
  logger.info('WhatsApp Web is ready.');
}
 
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
 