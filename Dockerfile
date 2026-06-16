# Multi-stage Dockerfile for NestJS Application
FROM node:20-alpine AS builder

WORKDIR /app

# Enable Corepack to support Yarn v4
RUN corepack enable && corepack prepare yarn@4.16.0 --activate

# Copy dependency files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies using Yarn v4
RUN yarn install --immutable

# Copy Prisma schema and configurations
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./

# Generate Prisma Client (outputs to generated/prisma as per schema.prisma)
RUN npx prisma generate

# Copy application source
COPY src ./src

# Build the NestJS application
RUN yarn build

# Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

# Enable Corepack
RUN corepack enable && corepack prepare yarn@4.16.0 --activate

# Copy only production dependencies and compiled outputs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

# Run migrations and start the NestJS application in production mode
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
