var mkdirp = require('mkdirp');
var fs = require('fs');
var getDirName = require('path').dirname;
const _ = require('lodash');

/** Rebuilds headers to support multi-value headers in response (for lambda) */
module.exports.rebuildHeaders = (headers) => {
  const defaultHeaders = {};
  const allHeaders = Object.assign({}, defaultHeaders, headers);
  const singleValueHeaders = {};
  const multiValueHeaders = {};

  Object.entries(allHeaders).forEach(([key, value]) => {
    const targetHeaders = Array.isArray(value) ? multiValueHeaders : singleValueHeaders;
    Object.assign(targetHeaders, { [key]: value });
  });

  return {
    headers: singleValueHeaders,
    multiValueHeaders,
  };
};

module.exports.calculateCacheHeaders = (event) => {
  let contentType = 'text/html';

  if (event.path.startsWith('/assets/')) {
    if (event.path.includes('.js')) contentType = 'text/javascript; charset=UTF-8';
    if (event.path.includes('.css')) contentType = 'text/css; charset=UTF-8';
  }

  let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36';

  if (event.headers['cloudfront-is-mobile-viewer'] === 'true')
    userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.4 Mobile/15E148 Safari/604.1';
  if (event.headers['cloudfront-is-tablet-viewer'] === 'true')
    userAgent = 'Mozilla/5.0 (iPad; CPU OS 11_0 like Mac OS X) AppleWebKit/604.1.34 (KHTML, like Gecko) Version/11.0 Mobile/15A5341f Safari/604.1';

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': `max-age=${event.headers.Token ? 0 : 0}`,
    'User-Agent': userAgent,
  };

  return headers;
};

module.exports.AsyncFunction = Object.getPrototypeOf(async () => { }).constructor;

module.exports.isClass = (func) => typeof func === 'function' && /^class\s/.test(Function.prototype.toString.call(func));

module.exports.flatten = (arr) => arr.reduce((flat, toFlatten) => flat.concat(Array.isArray(toFlatten) ? module.exports.flatten(toFlatten) : toFlatten), []);

module.exports.getContentType = (res) => typeof res === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8';

function serializer(replacer, cycleReplacer) {
  var stack = [], keys = []

  if (cycleReplacer == null) cycleReplacer = function (key, value) {
    if (stack[0] === value) return "[Circular ~]"
    return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join(".") + "]"
  }

  return function (key, value) {
    if (stack.length > 0) {
      var thisPos = stack.indexOf(this)
      ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
      ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
      if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
    }
    else stack.push(value)

    return replacer == null ? value : replacer.call(this, key, value)
  }
}

module.exports.formResult = (result, event, blockSettings) => {
  event.response.contentType((event.response.headers || {})['Content-Type'] || module.exports.getContentType(result));

  if (blockSettings && blockSettings.cache && blockSettings.cache.ttl) event.response.header('Cache-Control', `max-age=${blockSettings.cache.ttl}`)
  else event.response.header('Cache-Control', `max-age=0`);

  if (result === undefined) return 'undefined'
  return typeof result === 'string' ? result : JSON.stringify(result, serializer())
};

module.exports.resetLambda = () => {
  const params = {
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    Description: new Date().toString(),
  };

  const AWS = require('aws-sdk');
  const lambda = new AWS.Lambda({ region: 'eu-north-1' });

  return new Promise((resolve) => {
    const headers = {
      'Cache-Control': `max-age=0`,
    }
    lambda.updateFunctionConfiguration(params, function (err) {
      err ? resolve({ statusCode: 400, body: 'reset has failed', headers }) : resolve({ statusCode: 200, body: 'reset is done', headers });
    });
  });
};

module.exports.toCamelCase = function toCamelCase(sentenceCase) {
  const s = sentenceCase.trim().replace(/-/g, ' ').split(' ');
  let out = '';
  s.filter((t) => t).forEach(function (el, idx) {
    const add = el;
    out += add[0].toUpperCase() + add.slice(1);
  });

  return out;
};

module.exports.writeFile = function (path, contents, cb) {
  mkdirp(getDirName(path), function (err) {
    if (err) return cb(err);

    fs.writeFile(path, contents, cb);
  });
};

module.exports.readFile = function (path) {
  return fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
};

module.exports.removeFile = function (path) {
  return fs.unlinkSync(path);
};


module.exports.mergeDeep = (...objects) => {
  const isObject = obj => obj && typeof obj === 'object';

  return objects.reduce((prev, obj) => {
    Object.keys(obj).forEach(key => {
      const pVal = prev[key];
      const oVal = obj[key];

      if (Array.isArray(pVal) && Array.isArray(oVal)) {
        prev[key] = _.uniqWith(pVal.concat(...oVal),_.isEqual)
      }
      else if (isObject(pVal) && isObject(oVal)) {
        prev[key] = module.exports.mergeDeep(pVal, oVal);
      }
      else {
        prev[key] = oVal;
      }
    });

    return prev;
  }, {});
}