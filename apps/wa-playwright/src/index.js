// src/index.js — WhatsApp Playwright Automation
import 'dotenv/config';
import { launchBrowser, ensureLoggedIn, waitForReady } from './auth.js';
import { listChats, openChatByIndex, extractMessages, getCurrentChatName, scrollConversationToTop } from './scraper.js';
import { extractGroupMessages, extractGroupInfo, isGroupChat } from './group-scraper.js';
import { sendAndRecord } from './sender.js';
import { registerUser, authenticate, pushMessages, pushGroup } from './api-client.js';
import { logger } from './logger.js';
 
const CHAT_SCAN_LIMIT = parseInt(process.env.CHAT_SCAN_LIMIT || '20', 10);
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL   || '5000', 10);
const RESTART_DELAY   = parseInt(process.env.RESTART_DELAY   || '8000', 10);
 
const seenMessages = new Set();
 
function isPageAlive(page) {
  try { return !page.isClosed(); } catch { return false; }
}
 
function dedupeMessages(messages) {
  const fresh = messages.filter(m => {
    const key = `${m.contact}::${m.sender}::${m.text}::${m.timestamp}`;
    if (seenMessages.has(key)) return false;
    seenMessages.add(key);
    return true;
  });
  if (seenMessages.size > 5000) {
    const arr = [...seenMessages];
    arr.slice(0, 1000).forEach(k => seenMessages.delete(k));
  }
  return fresh;
}
 
async function scanAllChats(page) {
  logger.info('=== Starting full chat scan ===');
  const chats = await listChats(page, CHAT_SCAN_LIMIT);
  logger.info('Found %d chats to scan', chats.length);
 
  for (let i = 0; i < chats.length; i++) {
    if (!isPageAlive(page)) {
      logger.warn('Browser closed — stopping scan at chat %d', i);
      return false;
    }
 
    try {
      const opened = await openChatByIndex(page, i);
      if (!opened) continue;
 
      // Wait a moment for header to render
      await page.waitForTimeout(600);
 
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
 
      // Use index-based name fallback if selector fails
      const chatName = (name && name !== 'Unknown') ? name : (chats[i]?.title || `Chat_${i}`);
 
      await scrollConversationToTop(page, 3);
 
      let messages;
      if (group) {
        logger.info('[%d/%d] Group chat: %s', i + 1, chats.length, chatName);
        messages = await extractGroupMessages(page, chatName, 'playwright');
        const groupInfo = await extractGroupInfo(page, chatName, 'playwright');
        if (groupInfo) {
          await pushGroup(groupInfo).catch(e => logger.warn('pushGroup: %s', e.message));
        }
      } else {
        logger.info('[%d/%d] Personal chat: %s', i + 1, chats.length, chatName);
        messages = await extractMessages(page, chatName, 'playwright');
      }
 
      const fresh = dedupeMessages(messages);
      if (fresh.length > 0) {
        logger.info('Pushing %d new messages for "%s"', fresh.length, chatName);
        await pushMessages(fresh);
      } else {
        logger.debug('No new messages for "%s"', chatName);
      }
    } catch (err) {
      if (err.message.includes('closed') || err.message.includes('Target page') || err.message.includes('destroyed')) {
        logger.warn('Browser closed during scan — stopping.');
        return false;
      }
      logger.error('Error scanning chat %d: %s', i + 1, err.message);
    }
 
    if (isPageAlive(page)) {
      await page.waitForTimeout(500).catch(() => {});
    }
  }
 
  logger.info('=== Full chat scan complete ===');
  return true;
}
 
async function pollForNewMessages(page) {
  logger.info('Polling for new messages every %dms...', POLL_INTERVAL);
  while (true) {
    if (!isPageAlive(page)) {
      logger.warn('Browser closed — stopping poll loop.');
      return;
    }
    try {
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
      const chatName = (name && name !== 'Unknown') ? name : null;
 
      if (chatName) {
        const messages = group
          ? await extractGroupMessages(page, chatName, 'playwright')
          : await extractMessages(page, chatName, 'playwright');
 
        const fresh = dedupeMessages(messages);
        if (fresh.length > 0) {
          logger.info('Pushing %d new messages (poll) for "%s"', fresh.length, chatName);
          await pushMessages(fresh);
        }
      }
    } catch (err) {
      if (err.message.includes('closed') || err.message.includes('Target page') || err.message.includes('destroyed')) {
        logger.warn('Browser closed — stopping poll loop.');
        return;
      }
      logger.warn('Poll error: %s', err.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}
 
async function runSession() {
  let context;
  try {
    const session = await launchBrowser();
    context = session.context;
    const page = session.page;
 
    context.on('close', () => logger.warn('Browser context closed.'));
 
    await ensureLoggedIn(page);
    await waitForReady(page);
    await scanAllChats(page);
 
    const TEST_CONTACT = process.env.TEST_SEND_CONTACT;
    const TEST_MESSAGE = process.env.TEST_SEND_MESSAGE;
    if (TEST_CONTACT && TEST_MESSAGE && isPageAlive(page)) {
      logger.info('Sending test message to "%s"', TEST_CONTACT);
      const record = await sendAndRecord(page, TEST_CONTACT, TEST_MESSAGE, 'playwright');
      if (record._sent) {
        delete record._sent;
        await pushMessages([record]);
      }
    }
 
    await pollForNewMessages(page);
 
  } catch (err) {
    logger.error('Session error: %s', err.message);
  } finally {
    if (context) {
      try { await context.close(); } catch { /* already closed */ }
    }
  }
}
 
async function main() {
  logger.info('WhatsApp Playwright Automation starting...');
 
  await registerUser();
  await authenticate();
 
  let shuttingDown = false;
  process.on('SIGINT',  () => { shuttingDown = true; logger.info('Shutting down...'); process.exit(0); });
  process.on('SIGTERM', () => { shuttingDown = true; logger.info('Shutting down...'); process.exit(0); });
 
  let attempt = 0;
  while (!shuttingDown) {
    attempt++;
    logger.info('Starting session (attempt %d)...', attempt);
    await runSession();
    if (shuttingDown) break;
    logger.info('Session ended. Restarting in %ds...', RESTART_DELAY / 1000);
    await new Promise(r => setTimeout(r, RESTART_DELAY));
  }
}
 
main().catch(err => {
  logger.error('Fatal error: %s\n%s', err.message, err.stack);
  process.exit(1);
});
 