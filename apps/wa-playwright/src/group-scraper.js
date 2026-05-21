// src/group-scraper.js — Extract group metadata (Playwright)
import { logger } from './logger.js';
import { downloadAllMedia } from './media-downloader.js';

/**
 * Extract group messages from the currently open group chat.
 * Also downloads any media attachments found.
 */
export async function extractGroupMessages(page, groupName, source = 'playwright') {
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

        containers.forEach((el) => {
          const prePlain = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const senderEl = el.querySelector('._ahxt span, [class*="author"]');
          const textEl   = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
          const timeEl   = el.querySelector('._ao3e');

          let parsedSender = '', parsedTime = '';
          if (prePlain) {
            const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
            if (m) { parsedTime = m[1]; parsedSender = m[2].trim(); }
          }
          if (!parsedSender && senderEl) parsedSender = senderEl.innerText?.trim() || '';

          const isOutgoing = el.closest('[class*="message-out"]') !== null;
          const text = textEl?.innerText?.trim() || '';
          if (!text) return;

          messages.push({
            source:    src,
            contact:   group,
            sender:    isOutgoing ? 'Me' : (parsedSender || 'Unknown'),
            receiver:  'Me',
            text,
            timestamp: parsedTime || timeEl?.innerText?.trim() || new Date().toISOString(),
            direction: isOutgoing ? 'outgoing' : 'incoming',
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
    logger.error('extractGroupMessages failed: %s', err.message);
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

/**
 * Open the group info panel and extract participants + admins.
 * Returns { group_name, description, participants, admins }
 */
export async function extractGroupInfo(page, groupName, source = 'playwright') {
  logger.info('Extracting group info: %s', groupName);
  try {
    // Click the header to open group info
    const header = await page.$('[data-testid="conversation-header"]');
    if (!header) return null;
    await header.click();
    await page.waitForTimeout(1_500);

    const info = await page.evaluate(({ group, src }) => {
      const descEl = document.querySelector('[data-testid="section-description"] span');
      const description = descEl?.innerText?.trim() || '';

      const participantEls = document.querySelectorAll(
        '[data-testid="participant-common-groups"] [data-testid="cell-frame-title"] span, ' +
        '[aria-label="Participants"] [data-testid="cell-frame-title"] span, ' +
        '._ak8q span[title]'
      );

      const participants = [];
      const admins = [];

      participantEls.forEach((el) => {
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

    // Close group info panel
    const closeBtn = await page.$('[data-testid="btn-close-drawer"], [data-testid="x-btn"]');
    if (closeBtn) await closeBtn.click();

    logger.info('Group info extracted: %s (%d participants, %d admins)',
      groupName, info.participants.length, info.admins.length);
    return info;
  } catch (err) {
    logger.error('extractGroupInfo failed: %s', err.message);
    return null;
  }
}

/**
 * Determine if the currently open chat is a group (not a personal chat).
 */
export async function isGroupChat(page) {
  try {
    const el = await page.$('[data-testid="conversation-header-subtitle"]');
    const subtitle = await el?.innerText().catch(() => '');
    // Group chats show member count or "Group · N members"
    return (subtitle || '').toLowerCase().includes('member') ||
           (subtitle || '').toLowerCase().includes('participants');
  } catch {
    return false;
  }
}
