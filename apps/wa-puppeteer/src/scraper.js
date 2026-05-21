// src/scraper.js — Read chats and personal messages (Puppeteer)
import { logger } from './logger.js';
import { sleep } from './auth.js';
import { downloadAllMedia } from './media-downloader.js';

export async function listChats(page, limit = 20) {
  logger.info('Listing chats (limit=%d)…', limit);
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 30_000 });
    return await page.evaluate((lim) => {
      const rows = document.querySelectorAll('[data-testid="cell-frame-container"]');
      const results = [];
      for (let i = 0; i < Math.min(rows.length, lim); i++) {
        const row = rows[i];
        const titleEl  = row.querySelector('[data-testid="cell-frame-title"] span');
        const unreadEl = row.querySelector('[data-testid="icon-unread-count"]');
        results.push({
          title:  titleEl?.innerText?.trim() || '',
          unread: parseInt(unreadEl?.innerText || '0', 10),
          index:  i,
        });
      }
      return results;
    }, limit);
  } catch (err) {
    logger.error('listChats error: %s', err.message);
    return [];
  }
}

export async function openChatByIndex(page, index) {
  await page.waitForSelector('[data-testid="cell-frame-container"]', { timeout: 15_000 });
  const rows = await page.$$('[data-testid="cell-frame-container"]');
  if (!rows[index]) return false;
  await rows[index].click();
  await page.waitForSelector('[data-testid="conversation-panel-messages"]', { timeout: 15_000 });
  await sleep(800);
  return true;
}

export async function openChatByName(page, name) {
  logger.debug('Opening chat: %s', name);
  try {
    const searchBox = await page.waitForSelector('[data-testid="chat-list-search"]', { timeout: 10_000 });
    await searchBox.click();
    await searchBox.evaluate(el => el.value = '');
    await searchBox.type(name, { delay: 40 });
    await sleep(1_200);
    await page.waitForSelector(`[title="${name}"]`, { timeout: 8_000 });
    await page.click(`[title="${name}"]`);
    await page.waitForSelector('[data-testid="conversation-panel-messages"]', { timeout: 15_000 });
    await sleep(600);
    return true;
  } catch (err) {
    logger.warn('openChatByName failed for "%s": %s', name, err.message);
    return false;
  }
}

export async function extractMessages(page, contactName, source = 'puppeteer') {
  logger.debug('Extracting messages: %s', contactName);

  const attachmentsPromise = downloadAllMedia(page, contactName).catch(e => {
    logger.warn('Media download error: %s', e.message);
    return [];
  });

  let textMessages = [];
  try {
    textMessages = await page.evaluate(
      ({ contact, src }) => {
        const containers = document.querySelectorAll('[data-testid="msg-container"]');
        const messages   = [];
        containers.forEach(el => {
          const prePlain = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const textEl   = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
          const timeEl   = el.querySelector('._ao3e');
          const isOut    = el.closest('[class*="message-out"]') !== null;

          let parsedSender = '', parsedTime = '';
          if (prePlain) {
            const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
            if (m) { parsedTime = m[1]; parsedSender = m[2].trim(); }
          }
          const text = textEl?.innerText?.trim() || '';
          if (!text) return;
          messages.push({
            source:    src,
            contact,
            sender:    isOut ? 'Me' : (parsedSender || contact),
            receiver:  isOut ? contact : 'Me',
            text,
            timestamp: parsedTime || timeEl?.innerText?.trim() || new Date().toISOString(),
            direction: isOut ? 'outgoing' : 'incoming',
            category:  'personal',
            tags:      ['whatsapp'],
            priority:  'normal',
          });
        });
        return messages;
      },
      { contact: contactName, src: source }
    );
  } catch (err) {
    logger.error('extractMessages error: %s', err.message);
  }

  const attachments = await attachmentsPromise;
  if (attachments.length > 0) {
    if (textMessages.length > 0) {
      textMessages[textMessages.length - 1].attachments = attachments;
    } else {
      textMessages.push({
        source:      source,
        contact:     contactName,
        sender:      contactName,
        receiver:    'Me',
        text:        attachments.map(a => `[${a.type}: ${a.filename}]`).join(', '),
        timestamp:   new Date().toISOString(),
        direction:   'incoming',
        category:    'personal',
        tags:        ['whatsapp', 'media'],
        priority:    'normal',
        attachments,
      });
    }
  }

  return textMessages;
}

export async function getCurrentChatName(page) {
  try {
    const el = await page.$('[data-testid="conversation-header"] span[title]');
    return await page.evaluate(e => e?.getAttribute('title') || 'Unknown', el);
  } catch { return 'Unknown'; }
}

export async function scrollConversationToTop(page, times = 5) {
  const panel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!panel) return;
  for (let i = 0; i < times; i++) {
    await page.evaluate(el => { el.scrollTop = 0; }, panel);
    await sleep(600);
  }
}
