// src/scraper.js — Read chats and personal messages (Playwright)
import { logger } from './logger.js';
import { downloadAllMedia } from './media-downloader.js';
 
export async function listChats(page, limit = 20) {
  logger.info('Listing chats (limit=%d)...', limit);
  try {
    await page.waitForSelector('[data-testid="chat-list"]', { timeout: 30000 });
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
    logger.error('listChats failed: %s', err.message);
    return [];
  }
}
 
export async function openChatByIndex(page, index) {
  await page.waitForSelector('[data-testid="cell-frame-container"]', { timeout: 15000 });
  const rows = await page.$$('[data-testid="cell-frame-container"]');
  if (!rows[index]) {
    logger.warn('openChatByIndex: no row at index %d', index);
    return false;
  }
  await rows[index].click();
  await page.waitForSelector('[data-testid="conversation-panel-messages"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  return true;
}
 
export async function openChatByName(page, name) {
  logger.debug('Opening chat: %s', name);
  try {
    const searchBox = await page.waitForSelector(
      '[data-testid="chat-list-search"]',
      { timeout: 10000 }
    );
    await searchBox.click();
    await searchBox.fill('');
    await searchBox.type(name, { delay: 40 });
    await page.waitForTimeout(1200);
    const item = await page.waitForSelector(`[title="${name}"]`, { timeout: 8000 });
    await item.click();
    await page.waitForSelector('[data-testid="conversation-panel-messages"]', { timeout: 15000 });
    await page.waitForTimeout(600);
    return true;
  } catch (err) {
    logger.warn('openChatByName failed for "%s": %s', name, err.message);
    return false;
  }
}
 
export async function extractMessages(page, contactName, source = 'playwright') {
  logger.debug('Extracting messages from: %s', contactName);
 
  const attachmentsPromise = downloadAllMedia(page, contactName).catch(e => {
    logger.warn('Media download error: %s', e.message);
    return [];
  });
 
  let textMessages = [];
  try {
    textMessages = await page.evaluate(
      ({ contact, src }) => {
        const containers = document.querySelectorAll(
          '[data-testid="msg-container"], [class*="message-in"], [class*="message-out"]'
        );
        const messages = [];
        containers.forEach((el) => {
          const isOutgoing =
            el.classList.toString().includes('message-out') ||
            el.closest('[class*="message-out"]') != null;
 
          const textEl      = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
          const timestampEl = el.querySelector('._ao3e');
          const prePlain    = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
 
          let parsedSender = '', parsedTime = '';
          if (prePlain) {
            const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
            if (m) { parsedTime = m[1]; parsedSender = m[2]; }
          }
 
          const text = textEl?.innerText?.trim() || '';
          if (!text) return;
 
          messages.push({
            source,
            contact,
            sender:    parsedSender || (isOutgoing ? 'Me' : contact),
            receiver:  isOutgoing ? contact : 'Me',
            text,
            timestamp: parsedTime || timestampEl?.innerText?.trim() || new Date().toISOString(),
            direction: isOutgoing ? 'outgoing' : 'incoming',
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
    logger.error('extractMessages failed: %s', err.message);
  }
 
  const attachments = await attachmentsPromise;
  if (attachments.length > 0) {
    if (textMessages.length > 0) {
      textMessages[textMessages.length - 1].attachments = attachments;
    } else {
      textMessages.push({
        source,
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
 
// Fixed: tries multiple selectors for contact name
export async function getCurrentChatName(page) {
  try {
    // Try span[title] inside header first (most reliable)
    const el = await page.$('[data-testid="conversation-header"] span[title]');
    if (el) {
      const title = await el.getAttribute('title');
      if (title && !title.toLowerCase().includes('click here')) return title;
    }
    // Fallback: header title text content
    const el2 = await page.$('[data-testid="conversation-header"] [data-testid="conversation-info-header-chat-title"] span');
    if (el2) {
      const text = await el2.innerText();
      if (text && !text.toLowerCase().includes('click here')) return text.trim();
    }
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}
 
export async function scrollConversationToTop(page, times = 5) {
  const panel = await page.$('[data-testid="conversation-panel-messages"]');
  if (!panel) return;
  for (let i = 0; i < times; i++) {
    await panel.evaluate(el => el.scrollTop = 0);
    await page.waitForTimeout(600);
  }
}
 