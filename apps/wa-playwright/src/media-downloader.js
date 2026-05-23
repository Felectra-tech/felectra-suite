// src/media-downloader.js — Download WhatsApp media files (Playwright)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

// ── Config ────────────────────────────────────────────────────────────────────
const DOWNLOAD_MEDIA = process.env.DOWNLOAD_MEDIA !== 'false'; // default true
const DOWNLOAD_DIR   = path.resolve(process.env.DOWNLOAD_DIR || '../downloads');

// ── MIME → folder + extension map ────────────────────────────────────────────
const MIME_MAP = {
  // Images
  'image/jpeg':    { folder: 'images',    ext: 'jpg'  },
  'image/jpg':     { folder: 'images',    ext: 'jpg'  },
  'image/png':     { folder: 'images',    ext: 'png'  },
  'image/webp':    { folder: 'images',    ext: 'webp' },
  'image/gif':     { folder: 'images',    ext: 'gif'  },
  // Audio
  'audio/ogg':     { folder: 'audio',     ext: 'ogg'  },
  'audio/mpeg':    { folder: 'audio',     ext: 'mp3'  },
  'audio/mp4':     { folder: 'audio',     ext: 'm4a'  },
  'audio/aac':     { folder: 'audio',     ext: 'aac'  },
  'audio/wav':     { folder: 'audio',     ext: 'wav'  },
  // Video
  'video/mp4':     { folder: 'videos',    ext: 'mp4'  },
  'video/webm':    { folder: 'videos',    ext: 'webm' },
  'video/3gpp':    { folder: 'videos',    ext: '3gp'  },
  // Documents
  'application/pdf':  { folder: 'documents', ext: 'pdf'  },
  'application/msword': { folder: 'documents', ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                       { folder: 'documents', ext: 'docx' },
  'application/vnd.ms-excel': { folder: 'documents', ext: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                       { folder: 'documents', ext: 'xlsx' },
  'application/vnd.ms-powerpoint': { folder: 'documents', ext: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                       { folder: 'documents', ext: 'pptx' },
  'application/zip':   { folder: 'documents', ext: 'zip'  },
  'text/plain':        { folder: 'documents', ext: 'txt'  },
  'text/csv':          { folder: 'documents', ext: 'csv'  },
  // Contacts
  'text/vcard':        { folder: 'contacts',  ext: 'vcf'  },
  'text/x-vcard':      { folder: 'contacts',  ext: 'vcf'  },
};

// Sticker detection: webp in image context
const STICKER_MIME = 'image/webp';

/**
 * Determine media type category string from mime type.
 */
function getMediaType(mimeType, isSticker = false) {
  if (isSticker) return 'sticker';
  if (!mimeType) return 'other';
  const m = mimeType.toLowerCase();
  if (m.startsWith('image/'))       return 'image';
  if (m.startsWith('audio/'))       return 'audio';
  if (m.startsWith('video/'))       return 'video';
  if (m.startsWith('text/vcard') || m.includes('vcard')) return 'contact';
  if (m.startsWith('application/') || m.startsWith('text/')) return 'document';
  return 'other';
}

/**
 * Resolve folder and extension from mime type.
 */
function resolveFolderAndExt(mimeType, isSticker = false) {
  if (isSticker) return { folder: 'stickers', ext: 'webp' };
  const entry = MIME_MAP[mimeType?.toLowerCase()];
  if (entry) return entry;
  // Fallback by prefix
  if (mimeType?.startsWith('image/'))  return { folder: 'images',    ext: 'bin' };
  if (mimeType?.startsWith('audio/'))  return { folder: 'audio',     ext: 'bin' };
  if (mimeType?.startsWith('video/'))  return { folder: 'videos',    ext: 'bin' };
  return { folder: 'others', ext: 'bin' };
}

/**
 * Build a unique filename: YYYYMMDD_<contact>_<uuid>.<ext>
 */
function buildFilename(contactName, ext) {
  const date    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe    = (contactName || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const uid     = crypto.randomUUID().split('-')[0]; // 8 chars
  return `${date}_${safe}_${uid}.${ext}`;
}

/**
 * Ensure the download sub-folder exists.
 */
function ensureFolder(folder) {
  const full = path.join(DOWNLOAD_DIR, folder);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
  return full;
}

/**
 * Extract raw media info from a single message container element (runs in browser).
 * Returns array of raw media descriptors (one message may have one media item).
 */
export async function extractMediaDescriptors(page) {
  return await page.evaluate(() => {
    const containers = document.querySelectorAll('[data-testid="msg-container"]');
    const results    = [];

    containers.forEach((el) => {
      const prePlain = el.querySelector('[data-pre-plain-text]')
        ?.getAttribute('data-pre-plain-text') || '';
      const isOut    = el.closest('[class*="message-out"]') !== null;
      let parsedTime = '', parsedSender = '';
      if (prePlain) {
        const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
        if (m) { parsedTime = m[1]; parsedSender = m[2].trim(); }
      }

      // ── Image ──────────────────────────────────────────────────────────────
      const imgEl = el.querySelector(
        'img[src^="blob:"], img[src^="https://mmg"], ' +
        '[data-testid="media-url-img"] img, ' +
        '[data-testid="image-thumb"] img'
      );
      if (imgEl) {
        const isSticker = !!el.querySelector('[data-testid="sticker-container"], [data-testid="sticker"]');
        const captionEl = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
        results.push({
          mediaType:  isSticker ? 'sticker' : 'image',
          mimeType:   isSticker ? 'image/webp' : 'image/jpeg',
          src:        imgEl.src || imgEl.getAttribute('src') || '',
          caption:    captionEl?.innerText?.trim() || '',
          isSticker,
          isOutgoing: isOut,
          timestamp:  parsedTime,
          sender:     parsedSender,
        });
        return;
      }

      // ── Audio / Voice note ─────────────────────────────────────────────────
      const audioEl = el.querySelector(
        'audio[src^="blob:"], ' +
        '[data-testid="audio-player"] audio, ' +
        '[data-testid="voice-note"] audio'
      );
      if (audioEl) {
        const durEl = el.querySelector('[data-testid="audio-duration"]');
        results.push({
          mediaType:  'audio',
          mimeType:   'audio/ogg',
          src:        audioEl.src || '',
          duration:   durEl?.innerText?.trim() || '',
          isOutgoing: isOut,
          timestamp:  parsedTime,
          sender:     parsedSender,
        });
        return;
      }

      // ── Video ──────────────────────────────────────────────────────────────
      const videoEl = el.querySelector(
        'video[src^="blob:"], ' +
        '[data-testid="video-player"] video'
      );
      if (videoEl) {
        const captionEl = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
        results.push({
          mediaType:  'video',
          mimeType:   'video/mp4',
          src:        videoEl.src || '',
          caption:    captionEl?.innerText?.trim() || '',
          isOutgoing: isOut,
          timestamp:  parsedTime,
          sender:     parsedSender,
        });
        return;
      }

      // ── Document ───────────────────────────────────────────────────────────
      const docEl = el.querySelector(
        '[data-testid="document-container"], ' +
        '[data-testid="media-document"]'
      );
      if (docEl) {
        const nameEl     = docEl.querySelector('[data-testid="doc-title"], ._ao3e, span[title]');
        const mimeEl     = docEl.querySelector('[data-testid="doc-mime-type"]');
        const sizeEl     = docEl.querySelector('[data-testid="doc-size"]');
        const rawName    = nameEl?.getAttribute('title') || nameEl?.innerText?.trim() || 'document';
        const mimeRaw    = mimeEl?.innerText?.trim() || 'application/octet-stream';
        const dlLink     = docEl.querySelector('a[href^="blob:"], a[download]');
        results.push({
          mediaType:  'document',
          mimeType:   mimeRaw,
          src:        dlLink?.href || '',
          filename:   rawName,
          size:       sizeEl?.innerText?.trim() || '',
          isOutgoing: isOut,
          timestamp:  parsedTime,
          sender:     parsedSender,
        });
        return;
      }

      // ── Contact card ───────────────────────────────────────────────────────
      const vcardEl = el.querySelector(
        '[data-testid="vcard-container"], ' +
        '[data-testid="contact-card"]'
      );
      if (vcardEl) {
        const nameEl = vcardEl.querySelector('[data-testid="vcard-name"], span[title]');
        results.push({
          mediaType:  'contact',
          mimeType:   'text/vcard',
          src:        '',
          filename:   (nameEl?.innerText?.trim() || 'contact') + '.vcf',
          isOutgoing: isOut,
          timestamp:  parsedTime,
          sender:     parsedSender,
        });
      }
    });

    return results;
  });
}

/**
 * Download a single media item using Playwright's page.request.
 * Returns an attachment metadata object, or null on failure.
 *
 * @param {import('playwright').Page} page
 * @param {{ mediaType, mimeType, src, caption, filename, duration, size, isSticker }} descriptor
 * @param {string} contactName
 */
export async function downloadMediaItem(page, descriptor, contactName) {
  if (!DOWNLOAD_MEDIA) return null;
  if (!descriptor.src || !descriptor.src.startsWith('blob:') && !descriptor.src.startsWith('http')) {
    logger.debug('No downloadable src for %s', descriptor.mediaType);
    return null;
  }

  const isSticker          = descriptor.isSticker || descriptor.mediaType === 'sticker';
  const { folder, ext }    = resolveFolderAndExt(descriptor.mimeType, isSticker);
  const folderPath         = ensureFolder(folder);

  // Use the supplied filename (for docs) or build a unique one
  const filename = descriptor.filename
    ? sanitizeFilename(descriptor.filename)
    : buildFilename(contactName, ext);

  const localPath = path.join(folderPath, filename);
  const relPath   = path.join('downloads', folder, filename).replace(/\\/g, '/');

  // Skip if already downloaded
  if (fs.existsSync(localPath)) {
    logger.debug('Already exists, skipping: %s', filename);
    return buildMeta(descriptor, filename, relPath, folder);
  }

  try {
    let buffer;

    if (descriptor.src.startsWith('blob:')) {
      // For blob URLs: read the blob bytes from inside the page context
      buffer = await page.evaluate(async (blobUrl) => {
        const res  = await fetch(blobUrl);
        const ab   = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, descriptor.src);
      buffer = Buffer.from(buffer);
    } else {
      // For https:// CDN URLs: use Playwright's request object (carries cookies)
      const response = await page.request.get(descriptor.src, { timeout: 30_000 });
      if (!response.ok()) {
        logger.warn('HTTP %d for %s', response.status(), descriptor.src);
        return null;
      }
      buffer = await response.body();
    }

    fs.writeFileSync(localPath, buffer);
    logger.info('Downloaded %s → %s (%d bytes)', descriptor.mediaType, filename, buffer.length);

    return buildMeta(descriptor, filename, relPath, folder, buffer.length);
  } catch (err) {
    logger.error('downloadMediaItem failed [%s]: %s', descriptor.mediaType, err.message);
    return null;
  }
}

/**
 * Process all media in the currently open conversation.
 * Returns array of attachment metadata objects (only successfully downloaded ones).
 *
 * @param {import('playwright').Page} page
 * @param {string} contactName
 */
export async function downloadAllMedia(page, contactName) {
  if (!DOWNLOAD_MEDIA) return [];

  let descriptors = [];
  try {
    descriptors = await extractMediaDescriptors(page);
  } catch (err) {
    logger.error('extractMediaDescriptors failed: %s', err.message);
    return [];
  }

  if (descriptors.length === 0) return [];
  logger.info('Found %d media items in "%s"', descriptors.length, contactName);

  const attachments = [];
  for (const desc of descriptors) {
    try {
      const meta = await downloadMediaItem(page, desc, contactName);
      if (meta) attachments.push(meta);
    } catch (err) {
      logger.warn('Skipping media item: %s', err.message);
    }
  }

  logger.info('Downloaded %d/%d media files for "%s"', attachments.length, descriptors.length, contactName);
  return attachments;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function buildMeta(descriptor, filename, relPath, folder, byteSize = 0) {
  return {
    type:       descriptor.mediaType || 'other',
    filename,
    local_path: relPath,
    mime_type:  descriptor.mimeType  || 'application/octet-stream',
    caption:    descriptor.caption   || '',
    size:       byteSize || parseSizeString(descriptor.size),
    duration:   descriptor.duration  || '',
  };
}

function parseSizeString(sizeStr) {
  if (!sizeStr) return 0;
  const m = String(sizeStr).match(/([\d.]+)\s*(KB|MB|GB)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = (m[2] || '').toUpperCase();
  if (u === 'MB') return Math.round(n * 1024 * 1024);
  if (u === 'KB') return Math.round(n * 1024);
  if (u === 'GB') return Math.round(n * 1024 * 1024 * 1024);
  return Math.round(n);
}
