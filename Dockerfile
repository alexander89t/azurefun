FROM node:alpine
RUN npm i -g pm2
COPY . .
RUN npm install
CMD ["pm2-runtime", "/conf/ecosystem.config.js"]
