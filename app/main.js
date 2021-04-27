'use strict';

const appCache = require('./main/mars');
const api = require('./main/api');
const page = require('./main/page');
const { resetLambda, rebuildHeaders, removeFile } = require('./helpers/helpers');
const MobileDetect = require('mobile-detect');

module.exports.handleRequest = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    if (event.path === '/reset') {
      //removeFile('node_modules/mars-ide/index.json');
      process.exit(0)
      return await resetLambda();
    }

    const mobileDetect = new MobileDetect(event.headers['user-agent']);
    if (mobileDetect.mobile()) {
      event.device = 'mobile';
    } else if (mobileDetect.tablet()) {
      event.device = 'tablet';
    } else {
      event.device = 'desktop';
    }

    await appCache.init(); // init cache

    await appCache.services.HandleRequest({ event });
    const body = event.path.startsWith('/api/') ? await api.render(event) : await page.render(event);
    await appCache.services.HandleResponse({ request: event });

    const statusCode = event.response && event.response.statusCode ? event.response.statusCode : 200

    return statusCode === 200 ? {
      body, statusCode,
      ...rebuildHeaders(event.response.headers)
    } :
      {
        body,
        statusCode, ...rebuildHeaders({ ...event.response.headers, 'Cache-Control': 'max-age=0' })
      }
  } catch (e) {
    const headers = {
      'Cache-Control': `max-age=0`,
    }
    if (!event.response) event.response = {}
    event.response.statusCode = 400;

    if (e && e.isAxiosError) {
      event.response.statusCode = (e.response || {}).status || 400;
      return {
        body: (e.response || {}).data || e.message,
        statusCode: event.response.statusCode,
        headers
      }
    }

    return {
      body: (e || {}).message,
      statusCode: event.response.statusCode,
      headers
    }
  }
};
