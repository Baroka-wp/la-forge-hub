# Coolify / Docker — CMD explicite (évite les erreurs `bash -c: option requires an argument`).
# Build + runtime dans une seule image pour Prisma (client généré au `npm ci`).
FROM node:20-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server/prod.mjs"]
