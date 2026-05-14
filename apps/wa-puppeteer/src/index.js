import puppeteer from 'puppeteer';
import qrcode from 'qrcode-terminal';

const WA_WEB_URL = 'https://web.whatsapp.com';

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    userDataDir: './session',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function waitForQR(page) {
  console.log('Waiting for QR code...');
  await page.waitForSelector('canvas[aria-label="Scan this QR code to link a device"]', {
    timeout: 60_000,
  });
  const qrData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Scan this QR code to link a device"]');
    return canvas?.toDataURL();
  });
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
  const searchBox = await page.$('[data-testid="chat-list-search"]');
  await searchBox.click();
  await searchBox.type(contactName, { delay: 50 });
  await page.waitForSelector(`[title="${contactName}"]`, { timeout: 10_000 });
  await page.click(`[title="${contactName}"]`);

  const input = await page.waitForSelector('[data-testid="conversation-compose-box-input"]');
  await input.type(text, { delay: 30 });
  await page.keyboard.press('Enter');
  console.log(`Sent to ${contactName}: ${text}`);
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(WA_WEB_URL, { waitUntil: 'networkidle2' });

  const isLoggedIn = await page.$('[data-testid="chat-list"]').catch(() => null);
  if (!isLoggedIn) {
    await waitForQR(page);
    await waitForLogin(page);
  }

  const messages = await readMessages(page);
  console.log('Recent messages:', messages);
})();
