// src/sender.js — Send messages via WhatsApp Web (Puppeteer)
import { logger } from './logger.js';
import { sleep } from './auth.js';

/**
 * Send a text message to a contact or group by name.
 * @param {import('puppeteer').Page} page
 * @param {string} contactName
 * @param {string} text
 * @param {number} retries
 */
export async function sendMessage(page, contactName, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info('[attempt %d/%d] Sending to "%s"', attempt, retries, contactName);

      const searchBox = await page.waitForSelector('[data-testid="chat-list-search"]', { timeout: 10_000 });
      await searchBox.click();
      await page.evaluate(el => { el.value = ''; }, searchBox);
      await searchBox.type(contactName, { delay: 40 });
      await sleep(1_000);

      await page.waitForSelector(`[title="${contactName}"]`, { timeout: 8_000 });
      await page.click(`[title="${contactName}"]`);
      await sleep(600);

      const input = await page.waitForSelector(
        '[data-testid="conversation-compose-box-input"]',
        { timeout: 10_000 }
      );
      await input.click();
      await input.type(text, { delay: 20 });
      await page.keyboard.press('Enter');

      logger.info('Message sent to "%s": %s', contactName, text.substring(0, 60));
      return true;
    } catch (err) {
      logger.warn('sendMessage attempt %d failed: %s', attempt, err.message);
      if (attempt === retries) {
        logger.error('sendMessage: all retries exhausted for "%s"', contactName);
        return false;
      }
      await sleep(2_000 * attempt);
    }
  }
  return false;
}

/**
 * Send and return a payload for pushing to the backend.
 */
export async function sendAndRecord(page, contactName, text, source = 'puppeteer') {
  const success = await sendMessage(page, contactName, text);
  return {
    source,
    contact:   contactName,
    sender:    'Me',
    receiver:  contactName,
    text,
    timestamp: new Date().toISOString(),
    direction: 'outgoing',
    category:  'personal',
    tags:      ['whatsapp'],
    priority:  'normal',
    _sent:     success,
  };
}
