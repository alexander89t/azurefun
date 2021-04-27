const fs = require('fs');
const appCache = require('./mars');
const uuid = (require('uuid')).v4;

const { AsyncFunction, flatten } = require('../helpers/helpers');
const SentryErrorHandler = require('../helpers/sentryErrorHandler');

const createBlock = (thisBlock, data, Req) => {
  try {
    Req = Req || {};
    const uniqId = `obj${uuid().replace(/-/g, '')}`

    if (!data) data = { Id: uniqId };
    if (!data.Id) data.Id = uniqId;

    const css = (props) => {
      if (!thisBlock.Css) return '';
      Object.assign(data, props);
      const needsEval = thisBlock.Css.includes('${');
      const r = ((props.plainCss ? '' : '<style>')
        + (needsEval ? eval('`' + thisBlock.Css.replace(/\'\${/g, '${').replace(/\}\'/g, '}') + '`') : thisBlock.Css) +
        (props.plainCss ? '' : '</style>')).replace(/XID/g, data.Id);
      if (needsEval || thisBlock.Css.includes('XID')) return r;

      if (!Req.context.css) Req.context.css = {}
      //if (r) Req.context.css[`/*${thisBlock.Name}*/${r.replace('<style>', '').replace('</style>', '')}`] = '';
      return r;
    }
    const script = (props) => {
      if (!thisBlock.Script) return '';
      const clientJs = props && props.clientJs ? `\n ${props.clientJs.replace(/export default/g, 'return')}` : '';
      return (
        `<script v-pre type="module">` +
        `const data = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(Object.assign({ _blockName: thisBlock.Name }, data, { children: null }, props)))}"));` +
        (thisBlock.Script + clientJs).replace(/XID/g, data.Id) +
        '</script>'
      );
    }
    return {
      html(props = {}) {
        if (!thisBlock.Html) return '';

        Object.assign(data, props);

        if (thisBlock.Html && !props.noEval && thisBlock.Html.includes('${')) {
          const S = (str, ...args) => Mars.services.GetLocalizationKeyValue({ blockName: thisBlock.Name, str, args }, Req);
          return (new Function('data', 'S', 'Mars', 'device', 'isMobie', 'isTablet', 'isDesktop', 'return `' + thisBlock.Html.replace(/XID/g, data.Id) + '`'))(data, S, Mars, Req.device, Req.isMobie, Req.isTablet, Req.isDesktop)
        }
        return thisBlock.Html.replace(/XID/g, data.Id);
      },
      style: css,
      css,
      client: script,
      script,
      children() {
        return data.children ? data.children.join('') : '';
      },
      contentSlot(p) {
        return `<div id="${thisBlock.Name}" class="${p && p.class ? p.class : ''}" data-master-content>${data.children ? data.children.join('') : ''}</div>`;
      },
    };
  } catch (e) {
    console.error(e);
    throw new Error(`Failed to createBlock ${(thisBlock || {}).Name}`);
  }
}

function executeServerJs(thisBlock, data, Req) {
  try {
    if (!appCache.services[thisBlock.Name]) return null;
    return appCache.services[thisBlock.Name](data, Req, thisBlock);
  } catch (e) {
    console.error(e);
  }
}

function initJsx(thisBlock, data, Req) {
  try {
    return {
      serverData: thisBlock.BlockFunction && thisBlock.BlockFunction.includes('server(') ? executeServerJs(thisBlock, data, Req) : {},
      This: createBlock(thisBlock, data, Req),
    };
  } catch (e) {
    console.error(e);
  }
}

let Mars = {
  ...appCache,
  executeAppBlock,
  executeServerJs,
  initJsx,
  createBlock,
};

function blockError(f, e, Req) {
  console.error(e);

  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'dev' && process.env.NODE_ENV !== 'local') {
    const Sentry = SentryErrorHandler.getSentry();
    if (Sentry) {
      const {STRINGS, Page, user, cookies, headers, ...extraContext} = Req;
      Sentry.captureException(e, {user: user, extra: extraContext});
    }
  }

  try {
    return Mars.services[Req.headers['mobile-platform'] ? 'AppBlockRenderError' : 'BlockRenderError']({ f, e }, Req);
  } catch (error) {
    return `<b style="background:red;padding: 5px;color:white;">ERROR(${f.name || f}): ${e}</b>`;
  }
}

async function executeAppBlock(Req, f, props, ...children) {
  try {
    if (!props) props = {};
    // regular html tags
    if (typeof f === 'string') {
      const htmlProps = props
        ? Object.entries(props)
          .map(([key, value]) => `${key.replace(/--/, ':')}="${value}"`)
          .join(' ')
        : null;

      const settledChildren = (await Promise.allSettled(flatten(children.filter((t) => t)))).map((t) => {
        return t.status === 'fulfilled' ? t.value : blockError(f, t.reason, Req);
      });

      return `<${f} ${htmlProps || ''}>${settledChildren.join('')}</${f}>`;
    }

    // editable block
    if (props.Id && Req && Req.Page) {
      // merge block data saved in the page into block props
      try {
        Object.assign(props, Req.Page.Props && Req.Page.Props.currentBlockName ? Mars.allBlocks.find(t => t.Name === Req.Page.Props.currentBlockName).blocks[props.Id] :
          (Req.Page.Block || Req.Page).blocks[props.Id])
      } catch (error) { }
    }

    // function block
    if (children && children.length > 0) {
      props = props || {};
      props.children = (await Promise.allSettled(flatten(children.filter((t) => t)))).map((t) => {
        return t.status === 'fulfilled' ? t.value : blockError(f, t.reason, Req);
      });
      /*props.children = await Promise.all(props.children.map(t => {
                const r = t.render ? t.render() : t;
                return r;
            }));*/
    }

    return f.name === 'anonymous' ? f(Mars, props || {}, Req) : f(props || {});
  } catch (e) {
    return blockError(f, e, Req);
  }
}

/*fs.writeFile('mars.js', `window.executeAppBlock = ${executeAppBlock.toString()}; \n window.AsyncFunction =Object.getPrototypeOf(async () => { }).constructor; \n window.flatten = (arr) => {
    return arr.reduce((flat, toFlatten) => flat.concat(Array.isArray(toFlatten) ? window.flatten(toFlatten) : toFlatten), []);
}`, function (err) {
    if (err) return console.log(err);
    console.log('Hello World > mars.js');
});*/

module.exports.Mars = Mars;

module.exports.render = async function ({ Block, Props }, event) {
  try {
    Mars = {
      ...appCache,
      executeAppBlock,
      executeServerJs,
      initJsx,
    };
    return { renderRes: await Mars.blocks[Block.Name](Mars, Props, event) };
  } catch (e2) {
    console.error(e2);
    throw new Error(`PAGE ERROR(${Block.Name}): ${e2}`);
  }
};
