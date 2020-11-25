'use strict';

const appCache = require('./mars');
const executeJsx = require('./executeJsx');
const { formResult } = require('../helpers/helpers');

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

    const result = await block({ ...executeJsx.Mars, ...appCache }, props, event);
    return formResult(result, event, (block.block || {}).settings);
  } catch (e) {
    event.response.statusCode = 400;
    return e.message
  }
};
