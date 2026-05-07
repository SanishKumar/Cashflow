# ──────────────────────────────────────────────
# Frontend Dockerfile — Multi-stage Build
# Stage 1: Build Vite app
# Stage 2: Serve with nginx
# ──────────────────────────────────────────────

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json ./
COPY apps/web/package.json apps/web/

# Install dependencies
RUN npm install --workspace=apps/web

# Copy source
COPY apps/web/ apps/web/

# Build
RUN npm run build --workspace=apps/web

# ──────────────────────────────────────────────
# Production stage — nginx
# ──────────────────────────────────────────────
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Custom nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # SPA fallback \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # API proxy (when behind docker network) \
    location /api { \
        proxy_pass http://server:4000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    \
    location /socket.io { \
        proxy_pass http://server:4000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
    } \
    \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
