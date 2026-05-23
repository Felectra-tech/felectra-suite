// src/media-downloader.js — Download WhatsApp media files (Puppeteer)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

const DOWNLOAD_MEDIA = process.env.DOWNLOAD_MEDIA !== 'false';
const DOWNLOAD_DIR   = path.resolve(process.env.DOWNLOAD_DIR || '../downloads');

const MIME_MAP = {
  'image/jpeg':    { folder: 'images',    ext: 'jpg'  },
  'image/jpg':     { folder: 'images',    ext: 'jpg'  },
  'image/png':     { folder: 'images',    ext: 'png'  },
  'image/webp':    { folder: 'images',    ext: 'webp' },
  'image/gif':     { folder: 'images',    ext: 'gif'  },
  'audio/ogg':     { folder: 'audio',     ext: 'ogg'  },
  'audio/mpeg':    { folder: 'audio',     ext: 'mp3'  },
  'audio/mp4':     { folder: 'audio',     ext: 'm4a'  },
  'audio/aac':     { folder: 'audio',     ext: 'aac'  },
  'audio/wav':     { folder: 'audio',     ext: 'wav'  },
  'video/mp4':     { folder: 'videos',    ext: 'mp4'  },
  'video/webm':    { folder: 'videos',    ext: 'webm' },
  'video/3gpp':    { folder: 'videos',    ext: '3gp'  },
  'application/pdf': { folder: 'documents', ext: 'pdf' },
  'application/msword': { folder: 'documents', ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                        { folder: 'documents', ext: 'docx' },
  'application/vnd.ms-excel': { folder: 'documents', ext: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                        { folder: 'documents', ext: 'xlsx' },
  'application/vnd.ms-powerpoint': { folder: 'documents', ext: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                        { folder: 'documents', ext: 'pptx' },
  'application/zip':    { folder: 'documents', ext: 'zip'  },
  'text/plain':         { folder: 'documents', ext: 'txt'  },
  'text/csv':           { folder: 'documents', ext: 'csv'  },
  'text/vcard':         { folder: 'contacts',  ext: 'vcf'  },
  'text/x-vcard':       { folder: 'contacts',  ext: 'vcf'  },
};

function resolveFolderAndExt(mimeType, isSticker = false) {
  if (isSticker) return { folder: 'stickers', ext: 'webp' };
  const entry = MIME_MAP[mimeType?.toLowerCase()];
  if (entry) return entry;
  if (mimeType?.startsWith('image/'))  return { folder: 'images',    ext: 'bin' };
  if (mimeType?.startsWith('audio/'))  return { folder: 'audio',     ext: 'bin' };
  if (mimeType?.startsWith('video/'))  return { folder: 'videos',    ext: 'bin' };
  return { folder: 'others', ext: 'bin' };
}

function buildFilename(contactName, ext) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe = (contactName || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const uid  = crypto.randomUUID().split('-')[0];
  return `${date}_${safe}_${uid}.${ext}`;
}

function ensureFolder(folder) {
  const full = path.join(DOWNLOAD_DIR, folder);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  return full;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
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

function buildMeta(descriptor, filename, relPath, byteSize = 0) {
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

/**
 * Click each media thumbnail to trigger blob URL generation,
 * then close the viewer. This forces WhatsApp to load the actual media.
 */
async function triggerMediaLoad(page) {
  try {
    // Get all media containers that have unloaded thumbnails
    const mediaCount = await page.evaluate(() => {
      const containers = document.querySelectorAll('[data-testid="msg-container"]');
      let count = 0;
      containers.forEach(el => {
        const img = el.querySelector('img');
        if (img && (!img.src || img.src === '' || img.src.startsWith('data:image/gif'))) count++;
        const audio = el.querySelector('audio');
        if (audio && (!audio.src || audio.src === '')) count++;
        const video = el.querySelector('video');
        if (video && (!video.src || video.src === '')) count++;
      });
      return count;
    });

    if (mediaCount === 0) return;
    logger.debug('Triggering load for %d unloaded media items', mediaCount);

    // Click each download button if visible (for undownloaded media)
    const downloadBtns = await page.$$('[data-testid="msg-container"] [data-testid="media-download-btn"]');
    for (const btn of downloadBtns) {
      try {
        await btn.click();
        await page.waitForTimeout(800);
      } catch { /* ignore */ }
    }

    // Click image thumbnails to open viewer and load blob
    const imgContainers = await page.$$('[data-testid="msg-container"] [data-testid="image-thumb"], [data-testid="msg-container"] [data-testid="media-url-img"]');
    for (const container of imgContainers) {
      try {
        await container.click();
        // Wait for blob to be set in the opened viewer
        await page.waitForSelector('img[src^="blob:"]', { timeout: 3000 }).catch(() => {});
        // Close the viewer with Escape
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));
      } catch { /* ignore */ }
    }

    // Small wait for all blobs to settle
    await new Promise(r => setTimeout(r, 1000));

  } catch (err) {
    logger.debug('triggerMediaLoad error: %s', err.message);
  }
}

export async function extractMediaDescriptors(page) {
  return await page.evaluate(async () => {
    const containers = document.querySelectorAll('[data-testid="msg-container"]');
    const results    = [];

    async function blobToBase64(blobUrl) {
      try {
        const res = await fetch(blobUrl);
        const ab  = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      } catch {
        return null;
      }
    }

    for (const el of containers) {
      const prePlain = el.querySelector('[data-pre-plain-text]')
        ?.getAttribute('data-pre-plain-text') || '';
      const isOut    = el.closest('[class*="message-out"]') !== null;
      let parsedTime = '', parsedSender = '';
      if (prePlain) {
        const m = prePlain.match(/\[(.+?)\]\s*(.*?):/);
        if (m) { parsedTime = m[1]; parsedSender = m[2].trim(); }
      }

      // Image / sticker
      const imgEl = el.querySelector(
        'img[src^="blob:"], img[src^="https://mmg"], ' +
        '[data-testid="media-url-img"] img, [data-testid="image-thumb"] img'
      );
      if (imgEl) {
        const isSticker = !!el.querySelector('[data-testid="sticker-container"], [data-testid="sticker"]');
        const captionEl = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
        const src = imgEl.src || imgEl.getAttribute('src') || '';
        const base64 = src.startsWith('blob:') ? await blobToBase64(src) : null;
        results.push({
          mediaType: isSticker ? 'sticker' : 'image',
          mimeType:  isSticker ? 'image/webp' : 'image/jpeg',
          src, base64,
          caption:   captionEl?.innerText?.trim() || '',
          isSticker, isOutgoing: isOut, timestamp: parsedTime, sender: parsedSender,
        });
        continue;
      }

      // Audio
      const audioEl = el.querySelector(
        'audio[src^="blob:"], [data-testid="audio-player"] audio, [data-testid="voice-note"] audio'
      );
      if (audioEl) {
        const durEl = el.querySelector('[data-testid="audio-duration"]');
        const src = audioEl.src || '';
        const base64 = src.startsWith('blob:') ? await blobToBase64(src) : null;
        results.push({
          mediaType: 'audio', mimeType: 'audio/ogg',
          src, base64,
          duration: durEl?.innerText?.trim() || '',
          isOutgoing: isOut, timestamp: parsedTime, sender: parsedSender,
        });
        continue;
      }

      // Video
      const videoEl = el.querySelector('video[src^="blob:"], [data-testid="video-player"] video');
      if (videoEl) {
        const captionEl = el.querySelector('[data-testid="msg-txt"] span, .copyable-text span');
        const src = videoEl.src || '';
        const base64 = src.startsWith('blob:') ? await blobToBase64(src) : null;
        results.push({
          mediaType: 'video', mimeType: 'video/mp4',
          src, base64,
          caption: captionEl?.innerText?.trim() || '',
          isOutgoing: isOut, timestamp: parsedTime, sender: parsedSender,
        });
        continue;
      }

      // Document
      const docEl = el.querySelector(
        '[data-testid="document-container"], [data-testid="media-document"]'
      );
      if (docEl) {
        const nameEl = docEl.querySelector('[data-testid="doc-title"], ._ao3e, span[title]');
        const mimeEl = docEl.querySelector('[data-testid="doc-mime-type"]');
        const sizeEl = docEl.querySelector('[data-testid="doc-size"]');
        const dlLink = docEl.querySelector('a[href^="blob:"], a[download]');
        const src = dlLink?.href || '';
        const base64 = src.startsWith('blob:') ? await blobToBase64(src) : null;
        results.push({
          mediaType: 'document',
          mimeType:  mimeEl?.innerText?.trim() || 'application/octet-stream',
          src, base64,
          filename: nameEl?.getAttribute('title') || nameEl?.innerText?.trim() || 'document',
          size:     sizeEl?.innerText?.trim() || '',
          isOutgoing: isOut, timestamp: parsedTime, sender: parsedSender,
        });
        continue;
      }

      // Contact card
      const vcardEl = el.querySelector('[data-testid="vcard-container"], [data-testid="contact-card"]');
      if (vcardEl) {
        const nameEl = vcardEl.querySelector('[data-testid="vcard-name"], span[title]');
        results.push({
          mediaType: 'contact', mimeType: 'text/vcard',
          src: '', base64: null,
          filename: (nameEl?.innerText?.trim() || 'contact') + '.vcf',
          isOutgoing: isOut, timestamp: parsedTime, sender: parsedSender,
        });
      }
    }

    return results;
  });
}

export async function downloadMediaItem(page, descriptor, contactName) {
  if (!DOWNLOAD_MEDIA) return null;

  const isSticker       = descriptor.isSticker || descriptor.mediaType === 'sticker';
  const { folder, ext } = resolveFolderAndExt(descriptor.mimeType, isSticker);
  const folderPath      = ensureFolder(folder);

  const filename  = descriptor.filename
    ? sanitizeFilename(descriptor.filename)
    : buildFilename(contactName, ext);

  const localPath = path.join(folderPath, filename);
  const relPath   = path.join('downloads', folder, filename).replace(/\\/g, '/');

  if (fs.existsSync(localPath)) {
    logger.debug('Already exists, skipping: %s', filename);
    return buildMeta(descriptor, filename, relPath);
  }

  try {
    let buffer;

    if (descriptor.base64) {
      buffer = Buffer.from(descriptor.base64, 'base64');
    } else if (descriptor.src?.startsWith('http')) {
      const cookies = await page.cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const res = await fetch(descriptor.src, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': await page.evaluate(() => navigator.userAgent),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        logger.warn('HTTP %d fetching %s', res.status, descriptor.src);
        return null;
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      logger.debug('No src or base64 for %s — skipping', descriptor.mediaType);
      return null;
    }

    fs.writeFileSync(localPath, buffer);
    logger.info('Downloaded %s -> %s (%d bytes)', descriptor.mediaType, filename, buffer.length);
    return buildMeta(descriptor, filename, relPath, buffer.length);

  } catch (err) {
    logger.error('downloadMediaItem [%s] failed: %s', descriptor.mediaType, err.message);
    return null;
  }
}

export async function downloadAllMedia(page, contactName) {
  if (!DOWNLOAD_MEDIA) return [];

  // Trigger media load by clicking thumbnails/download buttons
  await triggerMediaLoad(page);

  let descriptors = [];
  try {
    descriptors = await extractMediaDescriptors(page);
  } catch (err) {
    logger.error('extractMediaDescriptors error: %s', err.message);
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

  logger.info('Downloaded %d/%d media for "%s"', attachments.length, descriptors.length, contactName);
  return attachments;
}