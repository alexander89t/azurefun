FROM node:alpine
RUN npm i -g pm2
RUN npm install
COPY . .
CMD ["pm2-runtime", "/conf/ecosystem.config.js"]
