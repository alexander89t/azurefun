FROM node:alpine
RUN npm i -g pm2
COPY server.js .
CMD ["pm2-runtime", "/conf/ecosystem.config.js"]
