class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.cookieHeader = '';
  }

  async get(pathname, options) {
    return this.request('GET', pathname, options);
  }

  async post(pathname, options) {
    return this.request('POST', pathname, options);
  }

  async request(method, pathname, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${this.baseURL}${pathname}`, {
      method,
      headers,
      body: options.json ? JSON.stringify(options.json) : undefined,
    });

    this.updateCookies(response);

    const text = await response.text();
    let body = null;
    if (text.trim() !== '') {
      body = JSON.parse(text);
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      text,
    };
  }

  updateCookies(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      return;
    }

    this.cookieHeader = setCookie.split(';', 1)[0].trim();
  }
}

function createApiClient(baseURL) {
  return new ApiClient(baseURL);
}

module.exports = {
  ApiClient,
  createApiClient,
};