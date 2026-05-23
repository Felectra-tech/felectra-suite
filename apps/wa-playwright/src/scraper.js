// src/scraper.js — Read chats and personal messages (Playwright)

import { logger } from './logger.js';
import { downloadAllMedia } from './media-downloader.js';

// ✅ Convert WhatsApp timestamps to ISO format
function convertWhatsAppTimestamp(input) {
  try {
    if (!input) {
      return new Date().toISOString();
    }

    // Already ISO
    if (input.includes('T')) {
      return new Date(input).toISOString();
    }

    const match = input.match(
      /(\d+):(\d+)\s*(am|pm),\s*(\d+)\/(\d+)\/(\d+)/i
    );

    if (!match) {
      logger.warn('Unknown timestamp format: %s', input);
      return new Date().toISOString();
    }

    let [, hour, minute, meridian, day, month, year] = match;

    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);

    if (meridian.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12;
    }

    if (meridian.toLowerCase() === 'am' && hour === 12) {
      hour = 0;
    }

    const isoDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour,
      minute
    );

    return isoDate.toISOString();

  } catch (err) {
    logger.error('Timestamp conversion failed: %s', err.message);
    return new Date().toISOString();
  }
}

export async function listChats(page, limit = 20) {
  logger.info('Listing chats (limit=%d)...', limit);

  try {
    await page.waitForSelector('[data-testid="chat-list"]', {
      timeout: 30000,
    });

    return await page.evaluate((lim) => {
      const rows = document.querySelectorAll(
        '[data-testid="cell-frame-container"]'
      );

      const results = [];

      for (let i = 0; i < Math.min(rows.length, lim); i++) {
        const row = rows[i];

        const titleEl = row.querySelector(
          '[data-testid="cell-frame-title"] span'
        );

        const unreadEl = row.querySelector(
          '[data-testid="icon-unread-count"]'
        );

        results.push({
          title: titleEl?.innerText?.trim() || '',
          unread: parseInt(unreadEl?.innerText || '0', 10),
          index: i,
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
  await page.waitForSelector(
    '[data-testid="cell-frame-container"]',
    {
      timeout: 15000,
    }
  );

  const rows = await page.$$(
    '[data-testid="cell-frame-container"]'
  );

  if (!rows[index]) {
    logger.warn('openChatByIndex: no row at index %d', index);
    return false;
  }

  await rows[index].click();

  await page.waitForSelector(
    '[data-testid="conversation-panel-messages"]',
    {
      timeout: 15000,
    }
  );

  await page.waitForTimeout(800);

  return true;
}

export async function openChatByName(page, name) {
  logger.debug('Opening chat: %s', name);

  try {
    const searchBox = await page.waitForSelector(
      '[data-testid="chat-list-search"]',
      {
        timeout: 10000,
      }
    );

    await searchBox.click();
    await searchBox.fill('');

    await searchBox.type(name, {
      delay: 40,
    });

    await page.waitForTimeout(1200);

    const item = await page.waitForSelector(
      `[title="${name}"]`,
      {
        timeout: 8000,
      }
    );

    await item.click();

    await page.waitForSelector(
      '[data-testid="conversation-panel-messages"]',
      {
        timeout: 15000,
      }
    );

    await page.waitForTimeout(600);

    return true;

  } catch (err) {
    logger.warn(
      'openChatByName failed for "%s": %s',
      name,
      err.message
    );

    return false;
  }
}

export async function extractMessages(
  page,
  contactName,
  source = 'playwright'
) {
  logger.debug('Extracting messages from: %s', contactName);

  // ✅ Start media download in parallel
  const attachmentsPromise = downloadAllMedia(
    page,
    contactName
  ).catch((e) => {
    logger.warn('Media download error: %s', e.message);
    return [];
  });

  let textMessages = [];

  try {
    const rawMessages = await page.evaluate(
      ({ contact, src }) => {
        const containers = document.querySelectorAll(
          '[data-testid="msg-container"], [class*="message-in"], [class*="message-out"]'
        );

        const messages = [];

        containers.forEach((el) => {
          const isOutgoing =
            el.classList.toString().includes('message-out') ||
            el.closest('[class*="message-out"]') != null;

          const textEl = el.querySelector(
            '[data-testid="msg-txt"] span, .copyable-text span'
          );

          const timestampEl = el.querySelector('._ao3e');

          const prePlain =
            el
              .querySelector('[data-pre-plain-text]')
              ?.getAttribute('data-pre-plain-text') || '';

          let parsedSender = '';
          let parsedTime = '';

          // Example:
          // [9:49 pm, 04/05/2026] John:
          if (prePlain) {
            const m = prePlain.match(
              /\[(.+?)\]\s*(.*?):/
            );

            if (m) {
              parsedTime = m[1];
              parsedSender = m[2];
            }
          }

          const text =
            textEl?.innerText?.trim() || '';

          if (!text) {
            return;
          }

          messages.push({
            source: src,
            contact,

            sender:
              parsedSender ||
              (isOutgoing ? 'Me' : contact),

            receiver:
              isOutgoing ? contact : 'Me',

            text,

            rawTimestamp:
              parsedTime ||
              timestampEl?.innerText?.trim() ||
              '',

            direction:
              isOutgoing
                ? 'outgoing'
                : 'incoming',

            category: 'personal',

            tags: ['whatsapp'],

            priority: 'normal',
          });
        });

        return messages;
      },
      {
        contact: contactName,
        src: source,
      }
    );

    // ✅ Convert timestamps OUTSIDE browser context
    textMessages = rawMessages.map((msg) => {
      const convertedTimestamp =
        convertWhatsAppTimestamp(
          msg.rawTimestamp
        );

      logger.info(
        'Timestamp converted: %s -> %s',
        msg.rawTimestamp,
        convertedTimestamp
      );

      return {
        ...msg,
        timestamp: convertedTimestamp,
      };
    });

  } catch (err) {
    logger.error(
      'extractMessages failed: %s',
      err.message
    );
  }

  // ✅ Attach media
  const attachments = await attachmentsPromise;

  if (attachments.length > 0) {
    if (textMessages.length > 0) {
      textMessages[textMessages.length - 1].attachments =
        attachments;

    } else {
      textMessages.push({
        source,

        contact: contactName,

        sender: contactName,

        receiver: 'Me',

        text: attachments
          .map(
            (a) =>
              `[${a.type}: ${a.filename}]`
          )
          .join(', '),

        timestamp: new Date().toISOString(),

        direction: 'incoming',

        category: 'personal',

        tags: ['whatsapp', 'media'],

        priority: 'normal',

        attachments,
      });
    }
  }

  return textMessages;
}

// ✅ Detect current chat/group name
export async function getCurrentChatName(page) {
  try {
    // Selector 1
    const el1 = await page.$(
      '[data-testid="conversation-header"] span[title]'
    );

    if (el1) {
      const title = await el1.getAttribute(
        'title'
      );

      if (title && title.trim()) {
        return title.trim();
      }
    }

    // Selector 2
    const el2 = await page.$(
      '[data-testid="conversation-info-header-chat-title"] span'
    );

    if (el2) {
      const text = await el2.innerText();

      if (text && text.trim()) {
        return text.trim();
      }
    }

    // Selector 3
    const el3 = await page.$(
      'header span[title]'
    );

    if (el3) {
      const title = await el3.getAttribute(
        'title'
      );

      if (title && title.trim()) {
        return title.trim();
      }
    }

    // Selector 4
    const el4 = await page.$(
      '[data-testid="conversation-header"] [data-testid="conversation-info-header"] span'
    );

    if (el4) {
      const text = await el4.innerText();

      if (text && text.trim()) {
        return text.trim();
      }
    }

    return 'Unknown';

  } catch {
    return 'Unknown';
  }
}

// ✅ Scroll chat upward to load older messages
export async function scrollConversationToTop(
  page,
  times = 5
) {
  const panel = await page.$(
    '[data-testid="conversation-panel-messages"]'
  );

  if (!panel) {
    return;
  }

  for (let i = 0; i < times; i++) {
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });

    await page.waitForTimeout(600);
  }
}