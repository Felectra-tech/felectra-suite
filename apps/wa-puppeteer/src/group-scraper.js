// src/group-scraper.js — Extract group metadata (Puppeteer)
import { logger } from './logger.js';
import { sleep } from './auth.js';
import { downloadAllMedia } from './media-downloader.js';

export async function extractGroupMessages(page, groupName, source = 'puppeteer') {
  logger.debug('Extracting group messages: %s', groupName);

  const attachmentsPromise = downloadAllMedia(page, groupName).catch(e => {
    logger.warn('Group media download error: %s', e.message);
    return [];
  });

  let textMessages = [];
  try {
    textMessages = await page.evaluate(
      ({ group, src }) => {
        const containers = document.querySelectorAll('[data-testid="msg-container"]');
        const messages   = [];
        containers.forEach(el => {
          const prePlain = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const senderEl = el.querySelector('._ahxt span, [class*="author"]');
          const textEl   = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
          const timeEl   = el.querySelector('._ao3e');
          const isOut    = el.closest('[class*="message-out"]') !== null;

          let parsedSender = '', parsedTime = '';
          if (prePlain) {
            const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
            if (m) { parsedTime = m[1]; parsedSender = m[2].trim(); }
          }
          if (!parsedSender && senderEl) parsedSender = senderEl.innerText?.trim() || '';

          const text = textEl?.innerText?.trim() || '';
          if (!text) return;
          messages.push({
            source:    src,
            contact:   group,
            sender:    isOut ? 'Me' : (parsedSender || 'Unknown'),
            receiver:  'Me',
            text,
            timestamp: parsedTime || timeEl?.innerText?.trim() || new Date().toISOString(),
            direction: isOut ? 'outgoing' : 'incoming',
            category:  'group',
            tags:      ['whatsapp', 'group'],
            priority:  'normal',
          });
        });
        return messages;
      },
      { group: groupName, src: source }
    );
  } catch (err) {
    logger.error('extractGroupMessages error: %s', err.message);
  }

  const attachments = await attachmentsPromise;
  if (attachments.length > 0) {
    if (textMessages.length > 0) {
      textMessages[textMessages.length - 1].attachments = attachments;
    } else {
      textMessages.push({
        source:      source,
        contact:     groupName,
        sender:      'Unknown',
        receiver:    'Me',
        text:        attachments.map(a => `[${a.type}: ${a.filename}]`).join(', '),
        timestamp:   new Date().toISOString(),
        direction:   'incoming',
        category:    'group',
        tags:        ['whatsapp', 'group', 'media'],
        priority:    'normal',
        attachments,
      });
    }
  }

  return textMessages;
}

export async function extractGroupInfo(page, groupName, source = 'puppeteer') {
  logger.info('Extracting group info: %s', groupName);
  try {
    const header = await page.$('[data-testid="conversation-header"]');
    if (!header) return null;
    await header.click();
    await sleep(1_500);

    const info = await page.evaluate(({ group, src }) => {
      const descEl = document.querySelector('[data-testid="section-description"] span');
      const description = descEl?.innerText?.trim() || '';
      const participantEls = document.querySelectorAll('._ak8q span[title], [aria-label="Participants"] span[title]');
      const participants = [], admins = [];
      participantEls.forEach(el => {
        const name  = el.getAttribute('title') || el.innerText?.trim() || '';
        const row   = el.closest('[data-testid="cell-frame-container"]');
        const badge = row?.querySelector('[data-testid="group-participant-admin-badge"]');
        const phone = row?.querySelector('span[title*="+"]')?.getAttribute('title') || '';
        if (name) {
          const p = { name, phone };
          participants.push(p);
          if (badge) admins.push(p);
        }
      });
      return { group_name: group, description, participants, admins, source: src };
    }, { group: groupName, src: source });

    const closeBtn = await page.$('[data-testid="btn-close-drawer"]');
    if (closeBtn) await closeBtn.click();

    logger.info('Group info: %s — %d participants, %d admins',
      groupName, info.participants.length, info.admins.length);
    return info;
  } catch (err) {
    logger.error('extractGroupInfo error: %s', err.message);
    return null;
  }
}

export async function isGroupChat(page) {
  try {
    const subtitle = await page.$eval(
      '[data-testid="conversation-header-subtitle"]',
      el => el.innerText || ''
    ).catch(() => '');
    return subtitle.toLowerCase().includes('member') ||
           subtitle.toLowerCase().includes('participants');
  } catch { return false; }
}
