FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8900
ENV NODE_ENV=production
CMD ["node", "server/server.js"]
