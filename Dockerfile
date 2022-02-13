FROM node:alpine
RUN npm i -g pm2
COPY app.js
CMD ["pm2-runtime", "/conf/ecosystem.config.js"]
