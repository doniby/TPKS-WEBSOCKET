# ============================================
# Stage 1: Build the React Admin UI (client)
# ============================================
FROM node:22-slim AS client-builder

WORKDIR /app/client

# Copy client package files and install dependencies
COPY client/package.json client/package-lock.json* ./
RUN npm ci

# Copy client source and build
COPY client/ ./
RUN npm run build

# ============================================
# Stage 2: Production Server
# ============================================
FROM node:22-slim AS production

# Install Oracle Instant Client dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libaio1 \
    wget \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and install Oracle Instant Client 21 (Basic + SQL*Plus)
ARG ORACLE_INSTANT_CLIENT_URL=https://download.oracle.com/otn_software/linux/instantclient/2119000/instantclient-basic-linux.x64-21.19.0.0.0dbru.zip
RUN mkdir -p /opt/oracle && \
    cd /opt/oracle && \
    wget -q ${ORACLE_INSTANT_CLIENT_URL} -O instantclient.zip && \
    unzip -q instantclient.zip && \
    rm instantclient.zip && \
    # Create symlink for the library directory
    ln -s /opt/oracle/instantclient_* /opt/oracle/instantclient

# Set Oracle environment variables
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient
ENV ORACLE_CLIENT_PATH=/opt/oracle/instantclient

WORKDIR /app

# Copy server package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy server source code
COPY server/ ./server/

# Copy built client from Stage 1
COPY --from=client-builder /app/client/dist ./client/dist

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose the server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Run as non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Start the server
CMD ["node", "server/server.js"]
