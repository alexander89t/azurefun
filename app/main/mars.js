'use strict';

const axios = require('axios').default;
const _ = require('lodash');
const config = require('config');
const events = require('events');
const moment = require('moment');
const { v4: uuid } = require('uuid');
const { AsyncFunction, toCamelCase, writeFile, readFile, mergeDeep } = require('../helpers/helpers');
const executeJsx = require('./executeJsx');

const { mongoDb, ObjectID, client, getIncrementedId } = require('../helpers/db');
const ide_json = require('../external-apps/ide.json');

const eventEmitter = new events.EventEmitter();

const status = {
  ready: false,
  sessions: {},
};

let blocks = {};
let services = {};
let pages = {};
let users = {};
let settings = {};
let helpers = {};
let allBlocks = [];

Object.assign(config, process.env);

module.exports.services = services;
module.exports.blocks = blocks;
module.exports.settings = settings;
module.exports.helpers = helpers;
module.exports.status = status;
module.exports.pages = pages;
module.exports.allBlocks = allBlocks;

module.exports.config = config;
module.exports.mongoDb = mongoDb;
module.exports.mongoClient = client;
module.exports.users = users;
module.exports.Db = {
  getIncrementedId,
};

module.exports.libs = {
  axios,
  _,
  require,
  AsyncFunction,
  ObjectID,
  toCamelCase,
  moment,
  uuid,
};

module.exports.init = async function () {
  try {
    // if status is ready we just return it
    if (status.ready) return status;

    // if cache is in process of initializing we wait for it to end
    if (status.initializing) {
      return new Promise(function (resolve) {
        eventEmitter.on('cache-is-ready', function () {
          resolve(status);
        });
      });
    }

    // if it is the first time the cache is being initialized we need to do all the work
    status.initializing = true;
    console.time('init cache: ');

    await module.exports.run(this)

    if (services.AfterCacheInit) {
      const moduleExports = await services.AfterCacheInit();
      Object.getOwnPropertyNames(moduleExports).map((property) => {
        const propertyDescriptor = Object.getOwnPropertyDescriptor(moduleExports, property);
        Object.defineProperty(module.exports, property, propertyDescriptor);
      });
    }

    status.ready = true;
    console.timeEnd('init cache: ');
    eventEmitter.emit('cache-is-ready');
    status.initializing = false;
    return status;
  } catch (error) {
    console.error(error)
    status.initializing = false;
    status.ready = false;
    throw new Error(error)
  }
};

async function loadAllBlocks(appBlocks) {
  const dbClient = await mongoDb;
  // load local blocks
  const localBlocks = (await dbClient.collection('blocks').find().toArray()).filter((t) => t && t.Name);

  // find import settings
  const ideAppConfig = {
    "name": "ide",
    "api_key": "sdfsd45sdf45sdf45sdf",
    "url": "https://ide.marscloud.dev",
    "hideFromBlocks": true
  }

  const importedAppsSettings = (localBlocks.find(t => t.Name === 'ImportedAppsSettings' && t.Config && t.Config.Apps));
  const externalAppsConfig = importedAppsSettings ? [ideAppConfig, ...importedAppsSettings.Config.Apps] : [ideAppConfig];
  const externalAppPromises = externalAppsConfig.map(t => axios(`${t.url}/api/GetExportedAppBlocks?api_key=${t.api_key || ''}`))

  let appsBlocks = [];
  try {
    const externalAppBlocks = await Promise.all(externalAppPromises);
    appsBlocks = [...externalAppBlocks, { data: localBlocks }]
  } catch (error) {
    throw new Error(error.config ? `${error.config.url.split('api_key')[0]}: ${error.message}` : error)
  }

  const allAppBlocks = [];

  appsBlocks.forEach((element, i) => {
    allAppBlocks.push(...element.data)
  });

  //allAppBlocks.forEach(t => appBlocks[t.Name] = t)

  return allAppBlocks.map(t => {
    return {
      ...t,
      _id: t._id.toString(),
      Folder: t.app && !t.forked ? `_external/${t.app.name}/${t.Folder}` : t.Folder,
      isSystem: t.app && t.app.name === 'mars-ide'
    }
  });
}

function injectServiceParams(blockFunction) {
  if (!blockFunction) return blockFunction;
  return blockFunction.replace(/Mars\.services\.(.*?)\((.*?)\)/g, function (body, service, params) {
    const paramsTrimmed = params.replace(/[ \t\r\n]/g, '').trim();
    return `Mars.services.${service}(${paramsTrimmed ? params : '{}'}${paramsTrimmed.includes(',Req') ? '' : ', Req'})`;
  });
};

module.exports.initServices = (serviceBlocks, services) => {
  const fParams = ['Mars', 'data', 'Req', 'thisBlock'];

  for (const b of serviceBlocks) {
    const f = `/* ${b.Name} */ const require = Mars.libs.require; \r\n${injectServiceParams(b.BlockFunction) || 'throw new Error("no code in server")'} \r\nreturn server();`;
    services[b.Name] = (data, Req, thisBlock) => {
      return (f.includes('async function server') ? new AsyncFunction(...fParams, f) : new Function(...fParams, f))({ ...this, ...executeJsx.Mars }, data, Req, b);
    }

    services[b.Name].block = b;
  }
}

module.exports.initBlocksAndPages = (blocksAndPages, blocks, pages) => {
  blocks = blocks || {};
  pages = pages || {};

  for (const b of blocksAndPages) {
    const f = `if(!Mars.blocks) {throw new Error("Mars.blocks is null in new blocks:(${b.Name})")} ` + 'with (Mars.blocks) { ' + injectServiceParams(b.JsxTranspiled) + ' }';
    try {
      const thisB = JSON.stringify({ ...b, Html: (b.Html || '').replace(/XTEMPLATE>/g, 'script>').replace(/<XTEMPLATE/g, '<script type="text/x-template"') });

      blocks[toCamelCase(b.Name)] = new AsyncFunction(
        'Mars',
        'data',
        'Req',
        `/* ${b.Name} */const thisBlock = ${thisB}; ` +
        f
          .replace('executeServerJs', 'Mars.executeServerJs').replace('Mars.initJsx()', 'Mars.initJsx(thisBlock, data, Req)').replace(/export default/g, 'return ')
          .replace(/Mars.render/g, 'return ').replace(/x-bind-/g, 'x-bind:').replace(/executeAppBlock/g, 'Mars.executeAppBlock').replace(/executeAppBlock\(/g, 'executeAppBlock(Req,'),
      );

      blocks[toCamelCase(b.Name)].funName = b.Name;
      blocks[toCamelCase(b.Name)].block = b;

      // create separate propery for page blocks
      if (b.Type === 'page' && b.Page && b.Page.settings && b.Page.settings.url) pages[b.Page.settings.url] = b;

    } catch (error) {
      blocks[toCamelCase(b.Name)] = () => {
        return `${b.Name}: ${error.toString()}`;
      };
      console.error(b.Name + error);
    }
  }
}

module.exports.initSettings = (settingsBlocks, settings) => {
  const grouped = _.groupBy(settingsBlocks, t => t.Name);
  for (const key in grouped) {
    if (grouped.hasOwnProperty(key)) {
      const element = grouped[key];
      const lastConfig = element[element.length - 1]
      settings[key] = lastConfig.merge ? mergeDeep(...element.map(t => t.Config)) : lastConfig.Config
    }
  }
}


module.exports.initMars = (allBlocks) => {
  module.exports.initServices(allBlocks.filter(t => t.BlockFunction), this.services);
  module.exports.initBlocksAndPages(allBlocks.filter((t) => t.JsxTranspiled), this.blocks, this.pages);
  module.exports.initSettings(allBlocks.filter(t => t.Type === 'settings'), this.settings);
}

module.exports.run = async () => {
  const allBlocks = await loadAllBlocks(this.appBlocks);
  this.allBlocks = allBlocks;

  module.exports.initMars(allBlocks);
  return
}

module.exports.resetBlock = (block) => {
  block._id = block._id.toString();
  block.isSystem = false;
  const b = this.allBlocks.find(t => t._id === block._id && (!t.app || t.forked));
  if (b) Object.assign(b, block)
  else this.allBlocks.push(block)

  const blocksByName = this.allBlocks.filter(t => t.Name === block.Name);
  //Object.assign(a[a.length - 1], block)
  module.exports.initMars(blocksByName)
}

module.exports.getBlock = (name, blockApp) => {
  return blockApp ? _.findLast(this.allBlocks, t => t.Name === name && t.app && t.app.name === blockApp && !t.forked)
    : _.findLast(this.allBlocks, t => t.Name === name)
}

module.exports.getBlockById = (blockId) => {
  return _.findLast(this.allBlocks, t => t._id === blockId)
}