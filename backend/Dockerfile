# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (dev tools needed for CLI and debugging)
RUN npm install

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy prisma schema for migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["npm", "run", "start:prod"]
