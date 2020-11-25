const express = require('express');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const config = require('config');
const path = require('path');
const fileUpload = require('express-fileupload');

const port = process.env.port || 8888;

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
  //process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('There was an unhandledRejection', err);
});

console.log('NODE_ENV: ', process.env.NODE_ENV);

const app = express();
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(bodyParser.json({ limit: '10mb', extended: true }));
app.use(fileUpload({
  createParentPath: true
}));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke! Please refresh the page...');
});

const httpServer = http.createServer(app, (req, res) => {
  res.send('hello');
});

httpServer.listen(port, () => {
  console.log('Listening on port %d', httpServer.address().port);
});

app.get('/favicon.ico', (req, res, next) => {
  res.send('favi');
});

const main = require('./app/main');
app.all('*', async (req, res, next) => {
  // assets
  if (req.path.includes('.js') && !req.path.includes('assets')) {
    let filePath = path.join(__dirname, req.path);
    res.sendFile(filePath);
    return;
  }

  console.time(`${req.originalUrl}: `);
  const response = await main.handleRequest({
    queryStringParameters: req.query,
    path: req.path,
    headers: req.headers,
    body: req.body,
    httpMethod: req.method,
    requestContext: {
      stage: 'dev',
    },
    files: req.files,
  }, {});

  console.timeEnd(`${req.originalUrl}: `);

  if (typeof response === 'string') {
    res.send(response)
    return
  }

  // merge one-value and multi-value headers to one object because express supports multi-value headers out of the box
  if (response.headers || response.multiValueHeaders) {
    const mergedHeaders = Object.assign({}, response.headers || {}, response.multiValueHeaders || {});
    for (let key in mergedHeaders) {
      res.header(key, mergedHeaders[key]);
    }
  }

  res.status(response.statusCode || 200).send(response.body);
});

module.exports = app;
