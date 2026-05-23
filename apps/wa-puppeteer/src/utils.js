// src/utils.js — Shared helpers for wa-puppeteer
 
/**
 * Convert WhatsApp Web timestamp strings → ISO 8601.
 *
 * Formats scraped from DOM:
 *   "9:48 pm, 02/05/2026"   DD/MM/YYYY  (Indian / UK locale)
 *   "9:48 PM"               time-only → today's date assumed
 *   already ISO             returned unchanged
 */
export function parseWATimestamp(ts) {
  if (!ts) return new Date().toISOString();
 
  // Already ISO — pass through
  if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) return ts;
 
  // "H:MM am/pm, DD/MM/YYYY"
  const full = ts.match(/^(\d{1,2}):(\d{2})\s*(am|pm),\s*(\d{2})\/(\d{2})\/(\d{4})$/i);
  if (full) {
    let [, hh, mm, ampm, dd, mo, yyyy] = full;
    hh = parseInt(hh, 10);
    if (ampm.toLowerCase() === 'pm' && hh !== 12) hh += 12;
    if (ampm.toLowerCase() === 'am' && hh === 12) hh = 0;
    return `${yyyy}-${mo}-${dd}T${String(hh).padStart(2,'0')}:${mm}:00.000Z`;
  }
 
  // "H:MM am/pm"  (time only, no date)
  const timeOnly = ts.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (timeOnly) {
    let [, hh, mm, ampm] = timeOnly;
    hh = parseInt(hh, 10);
    if (ampm.toLowerCase() === 'pm' && hh !== 12) hh += 12;
    if (ampm.toLowerCase() === 'am' && hh === 12) hh = 0;
    const d = new Date();
    d.setHours(hh, parseInt(mm, 10), 0, 0);
    return d.toISOString();
  }
 
  // Native parse fallback
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}