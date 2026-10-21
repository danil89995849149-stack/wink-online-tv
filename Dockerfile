FROM node:20-alpine
WORKDIR /app

# Копирование описания пакета
COPY package*.json ./
RUN npm install --production --silent || true

# Копирование исходников проекта
COPY . .

# Создание папки кэша
RUN mkdir -p data/cache

# Порт по умолчанию 7860 (совместимость с Hugging Face Spaces, Render, Koyeb)
ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

CMD ["node", "server/server.js"]
