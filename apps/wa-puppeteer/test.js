import puppeteer from 'puppeteer';

console.log('Launching browser...');
const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
console.log('Browser launched!');
const page = await browser.newPage();
console.log('Opening WhatsApp Web...');
await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 60000 });
console.log('Page loaded!');