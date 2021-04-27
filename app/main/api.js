'use strict';

const appCache = require('./mars');
const executeJsx = require('./executeJsx');
const { formResult } = require('../helpers/helpers');
const SentryErrorHandler = require('../helpers/sentryErrorHandler');

module.exports.render = async (event) => {
  try {
    try {
      event.body = JSON.parse(event.body);
    } catch (e) { }

    const blockName = event.path.replace('/api/', '').split('?')[0];
    const block = appCache.blocks[blockName];
    const service = appCache.services[blockName];
    const props = { ...event.body, ...event.queryStringParameters };
    props._blockName = blockName;

    if (!block && service) {
      const result = await service(props, event);
      event.response.headers
      return formResult(result, event, (service.block || {}).settings);
    }

    let result = await block({ ...executeJsx.Mars, ...appCache }, props, event);

    if (typeof (result) === 'string' && event.context.css) result = result + `<style>${Object.keys(event.context.css).join('\n')}</style>`;

    return formResult(result, event, (block.block || {}).settings);
  } catch (e) {
    event.response.statusCode = 400;

    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'dev' && process.env.NODE_ENV !== 'local') {
      const Sentry = SentryErrorHandler.getSentry();
      if (Sentry) {
        const {STRINGS, Page, user, cookies, headers, ...extraContext} = event;
        Sentry.captureException(e, {user: user, extra: extraContext});
      }
    }

    return e.message
  }
};
