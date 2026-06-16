# Multi-stage Dockerfile for Vite Frontend Application
FROM node:20-alpine AS builder

WORKDIR /app

# Enable Corepack to support Yarn
RUN corepack enable

# Copy dependency manifests
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy all source files
COPY . .

# Pass build-time argument for custom API Base URL
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build the Vite application
RUN yarn build

# Runtime Stage: Serve static assets with Nginx
FROM nginx:alpine

# Copy static assets to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for single page application (SPA) routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
