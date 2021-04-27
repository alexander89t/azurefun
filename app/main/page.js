'use strict';

const { formResult } = require('../helpers/helpers');
const appCache = require('./mars');
const executeJsx = require('./executeJsx');
const SentryErrorHandler = require('../helpers/sentryErrorHandler');

function findStaticPage(event) {
  // let qs = event.queryStringParameters;
  event.Page = appCache.pages[event.path];
  if (!event.Page) { return null; }
  return {
    Block: event.Page,
    Props: {},
  };
}

function findDinamicPage(event) {
  event.Page = appCache.services.FindDinamicPageByPath({ urlPath: event.path, blocks: appCache.pages, routes: appCache.routes }, event);
  return event.Page;
}

const renderPage = async (event) => {
  const page = findStaticPage(event) || (await findDinamicPage(event));
  if (!page) { throw new Error(`Cant find the page: ${event.path}`); }

  const html = await executeJsx.render(page, event);
  return html.renderRes;
};

function getSettings(event) {
  try {
    if (!event.Page) return {}
    if (event.Page.Page) return event.Page.Page.settings;
    if (event.Page.Block.Page) return event.Page.Block.Page.settings;
  } catch (error) {
    return {}
  }
}

module.exports.render = async (event) => {
  try {
    const result = await renderPage(event);
    return formResult(result, event, getSettings(event));
  } catch (e) {
    if (event.response.statusCode === 200) { event.response.statusCode = 400; }

    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'dev' && process.env.NODE_ENV !== 'local') {
      const Sentry = SentryErrorHandler.getSentry();
      if (Sentry) {
        const {STRINGS, Page, user, cookies, headers, ...extraContext} = event;
        Sentry.captureException(e, {user: user, extra: extraContext});
      }
    }

    return appCache.blocks['ServerErrorPage'] ? appCache.blocks['ServerErrorPage']({ ...appCache, ...executeJsx.Mars }, { e }, event) : e.message;
  }
};
