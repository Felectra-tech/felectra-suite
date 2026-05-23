// src/index.js — WhatsApp Web Puppeteer Automation — Entry Point
import 'dotenv/config';
import { launchBrowser, ensureLoggedIn, waitForReady, sleep } from './auth.js';
import { listChats, openChatByIndex, extractMessages, getCurrentChatName, scrollConversationToTop } from './scraper.js';
import { extractGroupMessages, extractGroupInfo, isGroupChat } from './group-scraper.js';
import { sendAndRecord } from './sender.js';
import { registerUser, authenticate, pushMessages, pushGroup } from './api-client.js';
import { logger } from './logger.js';
 
const CHAT_SCAN_LIMIT = parseInt(process.env.CHAT_SCAN_LIMIT || '20', 10);
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL   || '5000', 10);
const MAX_RETRIES     = parseInt(process.env.MAX_RETRIES     || '5', 10);
const RESTART_DELAY   = parseInt(process.env.RESTART_DELAY   || '8000', 10);
 
// Deduplication: track seen messages across polls
const seenMessages = new Set();
 
function dedupeMessages(messages) {
  return messages.filter(m => {
    const key = `${m.contact}::${m.sender}::${m.text}::${m.timestamp}`;
    if (seenMessages.has(key)) return false;
    seenMessages.add(key);
    return true;
  });
}
 
// ── Browser alive check ───────────────────────────────────────────────────────
async function isBrowserAlive(browser, page) {
  try {
    if (!browser.connected) return false;
    await page.evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}
 
// ── Safe page.evaluate — returns null if browser died ─────────────────────────
async function safeEval(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args);
  } catch (err) {
    if (err.message.includes('detached') || err.message.includes('closed') || err.message.includes('destroyed')) {
      return null;
    }
    throw err;
  }
}
 
// ── Scan all chats, abort early if browser dies ───────────────────────────────
async function scanAllChats(browser, page) {
  logger.info('=== Starting full chat scan ===');
  const chats = await listChats(page, CHAT_SCAN_LIMIT);
  logger.info('Found %d chats to scan', chats.length);
 
  for (let i = 0; i < chats.length; i++) {
    // Check browser health before each chat
    if (!(await isBrowserAlive(browser, page))) {
      logger.warn('Browser died during scan — stopping at chat %d', i);
      return false; // signal: need restart
    }
 
    try {
      const opened = await openChatByIndex(page, i);
      if (!opened) continue;
 
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
 
      await scrollConversationToTop(page, 3);
 
      let messages;
      if (group) {
        logger.info('[%d/%d] Group chat: %s', i + 1, chats.length, name);
        messages = await extractGroupMessages(page, name, 'puppeteer');
 
        const groupInfo = await extractGroupInfo(page, name, 'puppeteer');
        if (groupInfo) {
          await pushGroup(groupInfo).catch(e => logger.warn('pushGroup: %s', e.message));
        }
      } else {
        logger.info('[%d/%d] Personal chat: %s', i + 1, chats.length, name);
        messages = await extractMessages(page, name, 'puppeteer');
      }
 
      const fresh = dedupeMessages(messages);
      if (fresh.length > 0) {
        logger.info('Pushing %d new messages for "%s"', fresh.length, name);
        await pushMessages(fresh);
      } else {
        logger.debug('No new messages for "%s"', name);
      }
    } catch (err) {
      // Detached frame / closed errors = browser died
      if (
        err.message.includes('detached') ||
        err.message.includes('closed') ||
        err.message.includes('destroyed') ||
        err.message.includes('Target closed')
      ) {
        logger.warn('Browser closed mid-scan at chat %d — stopping.', i);
        return false;
      }
      logger.error('Error scanning chat %d: %s', i, err.message);
    }
 
    await sleep(500);
  }
 
  logger.info('=== Full chat scan complete ===');
  return true; // success
}
 
// ── Polling loop — reconnects on browser death ────────────────────────────────
async function pollForNewMessages(browser, page) {
  logger.info('Polling for new messages every %dms…', POLL_INTERVAL);
  while (true) {
    if (!(await isBrowserAlive(browser, page))) {
      logger.warn('Browser disconnected — stopping poll.');
      return; // trigger restart
    }
    try {
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
      const messages = group
        ? await extractGroupMessages(page, name, 'puppeteer')
        : await extractMessages(page, name, 'puppeteer');
 
      const fresh = dedupeMessages(messages);
      if (fresh.length > 0) {
        logger.info('Pushing %d new messages (poll)', fresh.length);
        await pushMessages(fresh);
      }
    } catch (err) {
      if (
        err.message.includes('detached') ||
        err.message.includes('closed') ||
        err.message.includes('destroyed') ||
        err.message.includes('Target closed')
      ) {
        logger.warn('Browser disconnected during poll — stopping.');
        return;
      }
      logger.warn('Poll error: %s', err.message);
    }
    await sleep(POLL_INTERVAL);
  }
}
 
// ── Launch one session (browser + scan + poll) ────────────────────────────────
async function runSession() {
  let browser, page;
  try {
    const session = await launchBrowser();
    browser = session.browser;
    page    = session.page;
 
    // Reconnect/crash handler
    browser.on('disconnected', () => {
      logger.warn('Browser disconnected event fired.');
    });
 
    await ensureLoggedIn(page);
    await waitForReady(page);
 
    // Full scan
    await scanAllChats(browser, page);
 
    // Optional test message
    const TEST_CONTACT = process.env.TEST_SEND_CONTACT;
    const TEST_MESSAGE = process.env.TEST_SEND_MESSAGE;
    if (TEST_CONTACT && TEST_MESSAGE) {
      logger.info('Sending test message to "%s"', TEST_CONTACT);
      const record = await sendAndRecord(page, TEST_CONTACT, TEST_MESSAGE, 'puppeteer');
      if (record._sent) {
        delete record._sent;
        await pushMessages([record]);
      }
    }
 
    // Poll until browser dies
    await pollForNewMessages(browser, page);
 
  } catch (err) {
    logger.error('Session error: %s', err.message);
  } finally {
    // Clean up browser if still open
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
    }
  }
}
 
// ── Main: auth once, then restart sessions forever ────────────────────────────
async function main() {
  logger.info('WhatsApp Puppeteer Automation starting…');
 
  await registerUser();
  await authenticate();
 
  // Graceful shutdown
  let shuttingDown = false;
  process.on('SIGINT',  () => { shuttingDown = true; logger.info('Shutting down…'); process.exit(0); });
  process.on('SIGTERM', () => { shuttingDown = true; logger.info('Shutting down…'); process.exit(0); });
 
  let attempts = 0;
  while (!shuttingDown) {
    attempts++;
    logger.info('Starting session (attempt %d)…', attempts);
    await runSession();
 
    if (shuttingDown) break;
 
    logger.info('Session ended. Restarting in %ds…', RESTART_DELAY / 1000);
    await sleep(RESTART_DELAY);
  }
}
 
main().catch(err => {
  logger.error('Fatal error: %s\n%s', err.message, err.stack);
  process.exit(1);
});
 