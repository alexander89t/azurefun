'use strict';

const { formResult } = require('../helpers/helpers');
const appCache = require('./mars')
const executeJsx = require('./executeJsx')

function findStaticPage(event) {
  let qs = event.queryStringParameters;
  const b = appCache.pages[event.path];
  event.Page = b;
  if (!b) return null;
  return {
    Block: b,
    Props: {},
  };
}

function findDinamicPage(event) {
  const p = appCache.services.FindDinamicPageByPath({ urlPath: event.path, blocks: appCache.pages });
  event.Page = p;
  return p;
}

const renderPage = async (event) => {
  const page = findStaticPage(event) || (await findDinamicPage(event));

  if (!page) throw new Error(`Cant find the page: ${event.path}`);

  const html = await executeJsx.render(page, event);
  return html.renderRes;
};


module.exports.render = async (event) => {
  try {
    const result = await renderPage(event);
    return formResult(result, event);
  } catch (e) {
    event.response.statusCode = 400;
    return e.message;
  }
};
