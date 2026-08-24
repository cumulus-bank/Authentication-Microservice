FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc
EXPOSE 3003
USER node
CMD [ "node", "dist/main.js" ]
