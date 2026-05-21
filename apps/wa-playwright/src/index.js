import 'dotenv/config';
import { launchBrowser, ensureLoggedIn, waitForReady } from './auth.js';
import { listChats, openChatByIndex, extractMessages, getCurrentChatName, scrollConversationToTop } from './scraper.js';
import { extractGroupMessages, extractGroupInfo, isGroupChat } from './group-scraper.js';
import { sendAndRecord } from './sender.js';
import { registerUser, authenticate, pushMessages, pushGroup } from './api-client.js';
import { logger } from './logger.js';
 
const CHAT_SCAN_LIMIT = parseInt(process.env.CHAT_SCAN_LIMIT || '20', 10);
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL   || '5000', 10);
 
const seenMessages = new Set();
 
// Check if browser/page is still alive
function isPageAlive(page) {
  try {
    return !page.isClosed();
  } catch {
    return false;
  }
}
 
function dedupeMessages(messages) {
  const fresh = messages.filter(m => {
    const key = `${m.contact}::${m.sender}::${m.text}::${m.timestamp}`;
    if (seenMessages.has(key)) return false;
    seenMessages.add(key);
    return true;
  });
  // Prevent Set growing too large — keep last 5000 keys
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
    // Stop scanning if browser was closed
    if (!isPageAlive(page)) {
      logger.warn('Browser was closed — stopping scan at chat %d', i);
      break;
    }
 
    try {
      const opened = await openChatByIndex(page, i);
      if (!opened) continue;
 
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
 
      // Skip if name is a WhatsApp UI placeholder (selector mismatch)
      if (!name || name === 'Unknown' || name.toLowerCase().includes('click here')) {
        logger.warn('[%d/%d] Skipping — could not read chat name', i + 1, chats.length);
        continue;
      }
 
      await scrollConversationToTop(page, 3);
 
      let messages;
      if (group) {
        logger.info('[%d/%d] Group chat: %s', i + 1, chats.length, name);
        messages = await extractGroupMessages(page, name, 'playwright');
        const groupInfo = await extractGroupInfo(page, name, 'playwright');
        if (groupInfo) {
          await pushGroup(groupInfo).catch(e => logger.warn('pushGroup: %s', e.message));
        }
      } else {
        logger.info('[%d/%d] Personal chat: %s', i + 1, chats.length, name);
        messages = await extractMessages(page, name, 'playwright');
      }
 
      const fresh = dedupeMessages(messages);
      if (fresh.length > 0) {
        logger.info('Pushing %d new messages for "%s"', fresh.length, name);
        await pushMessages(fresh);
      } else {
        logger.debug('No new messages for "%s"', name);
      }
    } catch (err) {
      // If browser closed mid-scan, stop gracefully
      if (err.message.includes('closed') || err.message.includes('Target page')) {
        logger.warn('Browser closed during scan — stopping.');
        break;
      }
      logger.error('Error scanning chat %d: %s', i + 1, err.message);
    }
 
    // Small delay between chats
    if (isPageAlive(page)) {
      await page.waitForTimeout(500).catch(() => {});
    }
  }
  logger.info('=== Full chat scan complete ===');
}
 
async function pollForNewMessages(page) {
  logger.info('Polling for new messages every %dms...', POLL_INTERVAL);
  while (true) {
    if (!isPageAlive(page)) {
      logger.warn('Browser closed — stopping poll loop.');
      break;
    }
    try {
      const name  = await getCurrentChatName(page);
      const group = await isGroupChat(page);
 
      if (name && name !== 'Unknown' && !name.toLowerCase().includes('click here')) {
        const messages = group
          ? await extractGroupMessages(page, name, 'playwright')
          : await extractMessages(page, name, 'playwright');
 
        const fresh = dedupeMessages(messages);
        if (fresh.length > 0) {
          logger.info('Pushing %d new messages (poll) for "%s"', fresh.length, name);
          await pushMessages(fresh);
        }
      }
    } catch (err) {
      if (err.message.includes('closed') || err.message.includes('Target page')) {
        logger.warn('Browser closed — stopping poll loop.');
        break;
      }
      logger.warn('Poll error: %s', err.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  logger.info('Session ended. Run npm start to reconnect.');
  process.exit(0);
}
 
async function main() {
  logger.info('WhatsApp Playwright Automation starting...');
 
  // 1. Backend auth (won't crash if offline)
  await registerUser();
  await authenticate();
 
  // 2. Browser + WhatsApp login
  const { context, page } = await launchBrowser();
 
  // Handle browser close gracefully
  context.on('close', () => {
    logger.warn('Browser context closed.');
  });
 
  await ensureLoggedIn(page);
  await waitForReady(page);
 
  // 3. Full initial scan
  await scanAllChats(page);
 
  // 4. Optional test message
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
 
  // 5. Poll loop
  await pollForNewMessages(page);
}
 
main().catch(err => {
  logger.error('Fatal error: %s\n%s', err.message, err.stack);
  process.exit(1);
});
 