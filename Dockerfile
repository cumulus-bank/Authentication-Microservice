FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g webpack-cli
RUN webpack-cli
EXPOSE 3003
USER node
CMD [ "npm", "start" ]
