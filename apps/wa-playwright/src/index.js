import { chromium } from 'playwright';
import qrcode from 'qrcode-terminal';

const WA_WEB_URL = 'https://web.whatsapp.com';

async function launchBrowser() {
  return chromium.launchPersistentContext('./session', {
    headless: false,
    args: ['--no-sandbox'],
  });
}

async function waitForQR(page) {
  console.log('Waiting for QR code...');
  const canvas = await page.waitForSelector(
    'canvas[aria-label="Scan this QR code to link a device"]',
    { timeout: 60_000 }
  );
  const qrData = await canvas.evaluate((el) => el.toDataURL());
  if (qrData) qrcode.generate(qrData, { small: true });
}

async function waitForLogin(page) {
  await page.waitForSelector('[data-testid="chat-list"]', { timeout: 120_000 });
  console.log('Logged in.');
}

async function readMessages(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('[data-testid="msg-container"]');
    return Array.from(rows).map((el) => ({
      text: el.querySelector('.copyable-text')?.innerText ?? '',
      timestamp: el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '',
    }));
  });
}

async function sendMessage(page, contactName, text) {
  await page.click('[data-testid="chat-list-search"]');
  await page.fill('[data-testid="chat-list-search"]', contactName);
  await page.waitForSelector(`[title="${contactName}"]`, { timeout: 10_000 });
  await page.click(`[title="${contactName}"]`);

  await page.waitForSelector('[data-testid="conversation-compose-box-input"]');
  await page.fill('[data-testid="conversation-compose-box-input"]', text);
  await page.keyboard.press('Enter');
  console.log(`Sent to ${contactName}: ${text}`);
}

(async () => {
  const context = await launchBrowser();
  const page = await context.newPage();
  await page.goto(WA_WEB_URL, { waitUntil: 'networkidle' });

  const isLoggedIn = await page.$('[data-testid="chat-list"]').catch(() => null);
  if (!isLoggedIn) {
    await waitForQR(page);
    await waitForLogin(page);
  }

  const messages = await readMessages(page);
  console.log('Recent messages:', messages);
})();
