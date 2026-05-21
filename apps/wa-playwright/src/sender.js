// src/sender.js — Send messages via WhatsApp Web (Playwright)
import { logger } from './logger.js';

/**
 * Send a text message to a contact or group by name.
 * @param {import('playwright').Page} page
 * @param {string} contactName  - The exact display name shown in WhatsApp
 * @param {string} text         - Message text to send
 * @param {number} retries      - Retry attempts on failure
 */
export async function sendMessage(page, contactName, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info('[attempt %d/%d] Sending message to "%s"', attempt, retries, contactName);

      // Search for contact
      const searchBox = await page.waitForSelector(
        '[data-testid="chat-list-search"]',
        { timeout: 10_000 }
      );
      await searchBox.click();
      await searchBox.fill('');
      await searchBox.type(contactName, { delay: 40 });
      await page.waitForTimeout(1_000);

      // Click matching result
      const result = await page.waitForSelector(`[title="${contactName}"]`, { timeout: 8_000 });
      await result.click();
      await page.waitForTimeout(600);

      // Type and send
      const input = await page.waitForSelector(
        '[data-testid="conversation-compose-box-input"]',
        { timeout: 10_000 }
      );
      await input.click();
      await input.fill(text);
      await page.keyboard.press('Enter');

      logger.info('Message sent to "%s": %s', contactName, text.substring(0, 60));
      return true;
    } catch (err) {
      logger.warn('sendMessage attempt %d failed: %s', attempt, err.message);
      if (attempt === retries) {
        logger.error('sendMessage: all retries exhausted for "%s"', contactName);
        return false;
      }
      await page.waitForTimeout(2_000 * attempt);
    }
  }
  return false;
}

/**
 * Send a message and return a payload suitable for pushing to the backend.
 */
export async function sendAndRecord(page, contactName, text, source = 'playwright') {
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
