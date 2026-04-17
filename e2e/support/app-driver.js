const { getServerInfo } = require('../../api-tests/support/server-runtime');
const { createPage } = require('./browser-runtime');

function parseCookieHeader(cookieHeader) {
  const firstPair = String(cookieHeader || '').split(';')[0].trim();
  const separatorIndex = firstPair.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error('Missing session cookie header for browser test.');
  }

  return {
    name: firstPair.slice(0, separatorIndex),
    value: firstPair.slice(separatorIndex + 1),
  };
}

function buildRoute(params = {}) {
  const search = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== null && typeof value !== 'undefined' && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function openAuthenticatedPage(session, params = {}, options = {}) {
  const { baseURL } = getServerInfo();
  const page = await createPage(options.viewport || { width: 1280, height: 960 });
  const sessionCookie = parseCookieHeader(session.client.cookieHeader);
  await page.setCookie({
    ...sessionCookie,
    url: baseURL,
  });

  await page.goto(`${baseURL}/${buildRoute(params)}`, { waitUntil: 'networkidle0' });
  return page;
}

async function waitForActiveHeading(page, expectedHeading) {
  await page.waitForFunction(
    (headingText) => {
      const activeScreen = document.querySelector('.screen:not(.hidden)');
      if (!activeScreen) {
        return false;
      }

      const heading = activeScreen.querySelector('h1, h2, h3');
      return !!heading && heading.textContent.trim() === headingText;
    },
    { timeout: 15000 },
    expectedHeading
  );
}

async function reloadPage(page, expectedHeading) {
  await page.reload({ waitUntil: 'networkidle0' });
  if (expectedHeading) {
    await waitForActiveHeading(page, expectedHeading);
  }
}

async function waitForText(page, selector, expectedText) {
  await page.waitForFunction(
    (nodeSelector, text) => {
      const node = document.querySelector(nodeSelector);
      return !!node && node.textContent.includes(text);
    },
    { timeout: 15000 },
    selector,
    expectedText
  );
}

async function getVisibleText(page, selector) {
  return page.$eval(selector, (node) => node.textContent.trim());
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function getContainedOverflowState(page, selector) {
  return page.$eval(selector, (node) => {
    const style = window.getComputedStyle(node);
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: style.overflowY,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      overflowX: style.overflowX,
    };
  });
}

async function getLandingRowInfo(page, gameTitle) {
  return page.evaluate((title) => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const rows = Array.from(activeScreen.querySelectorAll('.game-item'));
    const row = rows.find((item) => {
      const name = item.querySelector('[data-ref="name"]');
      return !!name && name.textContent.includes(title);
    });

    if (!row) {
      return null;
    }

    const isVisible = (node) => {
      if (!node) {
        return false;
      }

      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const buttonInfo = (ref) => {
      const node = row.querySelector(`[data-ref="${ref}"]`);
      return {
        visible: isVisible(node),
        disabled: !!(node && node.disabled),
        text: node ? node.textContent.trim() : '',
      };
    };

    const textOf = (ref) => {
      const node = row.querySelector(`[data-ref="${ref}"]`);
      return node ? node.textContent.trim() : '';
    };

    const titleNode = row.querySelector('[data-ref="name"]');

    return {
      title: titleNode ? titleNode.textContent.trim() : '',
      ownerInfo: textOf('ownerInfo'),
      playersInfo: textOf('playersInfo'),
      observersInfo: textOf('observersInfo'),
      statusInfo: textOf('statusInfo'),
      progressInfo: textOf('progressInfo'),
      join: buttonInfo('join'),
      observe: buttonInfo('observe'),
      leave: buttonInfo('leave'),
      open: buttonInfo('open'),
      start: buttonInfo('start'),
      end: buttonInfo('end'),
      remove: buttonInfo('remove'),
    };
  }, gameTitle);
}

module.exports = {
  assertNoHorizontalOverflow,
  getContainedOverflowState,
  getLandingRowInfo,
  getVisibleText,
  openAuthenticatedPage,
  reloadPage,
  waitForActiveHeading,
  waitForText,
};