# Build stage
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/family_calendar"

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/family_calendar"

# Install all dependencies (dev tools needed for CLI and debugging)
RUN npm install

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/tsconfig*.json ./

# Copy prisma schema for migrations
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["npm", "run", "start:prod"]
