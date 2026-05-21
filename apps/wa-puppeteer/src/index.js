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

async function scanAllChats(page) {
  logger.info('=== Starting full chat scan ===');
  const chats = await listChats(page, CHAT_SCAN_LIMIT);
  logger.info('Found %d chats to scan', chats.length);

  for (let i = 0; i < chats.length; i++) {
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
      logger.error('Error scanning chat %d: %s', i, err.message);
    }

    await sleep(500);
  }
  logger.info('=== Full chat scan complete ===');
}

async function pollForNewMessages(page) {
  logger.info('Polling for new messages every %dms…', POLL_INTERVAL);
  while (true) {
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
      logger.warn('Poll error: %s', err.message);
    }
    await sleep(POLL_INTERVAL);
  }
}

async function main() {
  logger.info('WhatsApp Puppeteer Automation starting…');

  // 1. Backend auth
  await registerUser();
  await authenticate();

  // 2. Browser + WhatsApp login
  const { browser, page } = await launchBrowser();
  await ensureLoggedIn(page);
  await waitForReady(page);

  // 3. Full initial scan
  await scanAllChats(page);

  // 4. Optional test message
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

  // 5. Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async (signal) => {
    logger.info('Received %s — closing browser…', signal);
    await browser.close();
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 6. Polling loop
  await pollForNewMessages(page);
}

main().catch(err => {
  logger.error('Fatal error: %s\n%s', err.message, err.stack);
  process.exit(1);
});
