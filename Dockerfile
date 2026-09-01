FROM node:22-slim

# Prisma needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# A DB path Prisma can read during generate/build (no connection is made here).
ENV DATABASE_URL=file:/data/prod.db

# Install dependencies (cached unless lockfile/schema changes).
# The prisma schema is copied first because the postinstall runs `prisma generate`.
# NODE_ENV stays unset here so devDependencies (prisma CLI, typescript) install.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Build the app.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Ensure the data dir exists, apply migrations, then start.
CMD ["sh", "-c", "mkdir -p /data && npx prisma migrate deploy && npm run start"]
