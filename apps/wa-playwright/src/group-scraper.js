// src/group-scraper.js — Extract group metadata (Playwright)

import { logger } from './logger.js';
import { downloadAllMedia } from './media-downloader.js';

// ✅ Convert WhatsApp timestamp → ISO format
function parseWhatsAppTimestamp(raw) {
  if (!raw) {
    return new Date().toISOString();
  }

  try {
    // Already ISO
    if (raw.includes('T') && raw.includes('-')) {
      return raw;
    }

    // Example:
    // "1:42 pm, 19/05/2026"
    const match = raw.match(
      /(\d+):(\d+)\s*(am|pm),\s*(\d+)\/(\d+)\/(\d+)/i
    );

    if (match) {
      let [, hh, mm, ampm, dd, mo, yyyy] = match;

      hh = parseInt(hh);

      if (
        ampm.toLowerCase() === 'pm' &&
        hh !== 12
      ) {
        hh += 12;
      }

      if (
        ampm.toLowerCase() === 'am' &&
        hh === 12
      ) {
        hh = 0;
      }

      return new Date(
        `${yyyy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${mm}:00`
      ).toISOString();
    }

    logger.warn(
      'Unknown group timestamp format: %s',
      raw
    );

    return new Date().toISOString();

  } catch (err) {
    logger.error(
      'Group timestamp conversion failed: %s',
      err.message
    );

    return new Date().toISOString();
  }
}

/**
 * Extract group messages from the currently open group chat.
 * Also downloads media attachments.
 */
export async function extractGroupMessages(
  page,
  groupName,
  source = 'playwright'
) {
  logger.debug(
    'Extracting group messages: %s',
    groupName
  );

  // ✅ Download media in parallel
  const attachmentsPromise = downloadAllMedia(
    page,
    groupName
  ).catch((e) => {
    logger.warn(
      'Group media download error: %s',
      e.message
    );

    return [];
  });

  let textMessages = [];

  try {
    // ✅ Extract raw browser-side data
    const rawMessages = await page.evaluate(
      ({ group, src }) => {
        const containers =
          document.querySelectorAll(
            '[data-testid="msg-container"]'
          );

        const messages = [];

        containers.forEach((el) => {
          const prePlain =
            el
              .querySelector(
                '[data-pre-plain-text]'
              )
              ?.getAttribute(
                'data-pre-plain-text'
              ) || '';

          const senderEl = el.querySelector(
            '._ahxt span, [class*="author"]'
          );

          const textEl = el.querySelector(
            '[data-testid="msg-txt"] span, .copyable-text span'
          );

          const timeEl =
            el.querySelector('._ao3e');

          let parsedSender = '';
          let parsedTime = '';

          // Example:
          // [1:42 pm, 19/05/2026] John:
          if (prePlain) {
            const m = prePlain.match(
              /\[(.+?)\]\s*(.*?):/
            );

            if (m) {
              parsedTime = m[1];
              parsedSender = m[2].trim();
            }
          }

          if (
            !parsedSender &&
            senderEl
          ) {
            parsedSender =
              senderEl.innerText?.trim() || '';
          }

          const isOutgoing =
            el.closest(
              '[class*="message-out"]'
            ) !== null;

          const text =
            textEl?.innerText?.trim() || '';

          if (!text) {
            return;
          }

          messages.push({
            source: src,

            contact: group,

            sender: isOutgoing
              ? 'Me'
              : parsedSender || 'Unknown',

            receiver: 'Me',

            text,

            rawTimestamp:
              parsedTime ||
              timeEl?.innerText?.trim() ||
              '',

            direction: isOutgoing
              ? 'outgoing'
              : 'incoming',

            category: 'group',

            tags: [
              'whatsapp',
              'group',
            ],

            priority: 'normal',
          });
        });

        return messages;
      },
      {
        group: groupName,
        src: source,
      }
    );

    // ✅ Convert timestamps OUTSIDE browser context
    textMessages = rawMessages.map((msg) => {
      const convertedTimestamp =
        parseWhatsAppTimestamp(
          msg.rawTimestamp
        );

      logger.info(
        'Group timestamp converted: %s -> %s',
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
      'extractGroupMessages failed: %s',
      err.message
    );
  }

  // ✅ Attach media
  const attachments =
    await attachmentsPromise;

  if (attachments.length > 0) {
    if (textMessages.length > 0) {
      textMessages[
        textMessages.length - 1
      ].attachments = attachments;

    } else {
      textMessages.push({
        source,

        contact: groupName,

        sender: 'Unknown',

        receiver: 'Me',

        text: attachments
          .map(
            (a) =>
              `[${a.type}: ${a.filename}]`
          )
          .join(', '),

        timestamp:
          new Date().toISOString(),

        direction: 'incoming',

        category: 'group',

        tags: [
          'whatsapp',
          'group',
          'media',
        ],

        priority: 'normal',

        attachments,
      });
    }
  }

  return textMessages;
}

/**
 * Open group info panel and extract metadata.
 */
export async function extractGroupInfo(
  page,
  groupName,
  source = 'playwright'
) {
  logger.info(
    'Extracting group info: %s',
    groupName
  );

  try {
    // Open group info
    const header = await page.$(
      '[data-testid="conversation-header"]'
    );

    if (!header) {
      return null;
    }

    await header.click();

    await page.waitForTimeout(1500);

    const info = await page.evaluate(
      ({ group, src }) => {
        const descEl =
          document.querySelector(
            '[data-testid="section-description"] span'
          );

        const description =
          descEl?.innerText?.trim() || '';

        const participantEls =
          document.querySelectorAll(
            '[data-testid="participant-common-groups"] [data-testid="cell-frame-title"] span, ' +
            '[aria-label="Participants"] [data-testid="cell-frame-title"] span, ' +
            '._ak8q span[title]'
          );

        const participants = [];
        const admins = [];

        participantEls.forEach((el) => {
          const name =
            el.getAttribute('title') ||
            el.innerText?.trim() ||
            '';

          const row =
            el.closest(
              '[data-testid="cell-frame-container"]'
            );

          const badge =
            row?.querySelector(
              '[data-testid="group-participant-admin-badge"]'
            );

          const phone =
            row
              ?.querySelector(
                'span[title*="+"]'
              )
              ?.getAttribute(
                'title'
              ) || '';

          if (name) {
            const p = {
              name,
              phone,
            };

            participants.push(p);

            if (badge) {
              admins.push(p);
            }
          }
        });

        return {
          group_name: group,
          description,
          participants,
          admins,
          source: src,
        };
      },
      {
        group: groupName,
        src: source,
      }
    );

    // Close info drawer
    const closeBtn = await page.$(
      '[data-testid="btn-close-drawer"], [data-testid="x-btn"]'
    );

    if (closeBtn) {
      await closeBtn.click();
    }

    logger.info(
      'Group info extracted: %s (%d participants, %d admins)',
      groupName,
      info.participants.length,
      info.admins.length
    );

    return info;

  } catch (err) {
    logger.error(
      'extractGroupInfo failed: %s',
      err.message
    );

    return null;
  }
}

/**
 * Check whether current chat is group.
 */
export async function isGroupChat(page) {
  try {
    const el = await page.$(
      '[data-testid="conversation-header-subtitle"]'
    );

    const subtitle =
      await el?.innerText().catch(
        () => ''
      );

    return (
      (subtitle || '')
        .toLowerCase()
        .includes('member') ||
      (subtitle || '')
        .toLowerCase()
        .includes('participants')
    );

  } catch {
    return false;
  }
}