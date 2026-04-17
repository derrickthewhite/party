const puppeteer = require('puppeteer');

let browser = null;

async function startBrowser() {
  if (browser) {
    return browser;
  }

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return browser;
}

async function stopBrowser() {
  if (!browser) {
    return;
  }

  await browser.close();
  browser = null;
}

async function createPage(viewport = { width: 1280, height: 960 }) {
  const activeBrowser = await startBrowser();
  const page = await activeBrowser.newPage();
  await page.setViewport(viewport);
  return page;
}

module.exports = {
  createPage,
  startBrowser,
  stopBrowser,
};