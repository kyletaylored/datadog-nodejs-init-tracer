# Dockerfile
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Optional build-time defaults (overridable at runtime)
ARG DD_SERVICE="datadog-nodejs-init-tracer"
ARG DD_ENV="local"
ARG DD_VERSION="0.1.0"
ARG DD_SITE="datadoghq.com"

ENV DD_SERVICE=$DD_SERVICE \
    DD_ENV=$DD_ENV \
    DD_VERSION=$DD_VERSION \
    DD_SITE=$DD_SITE
# DD_CLIENT_TOKEN and DD_APPLICATION_ID will be set at runtime, e.g. via docker run -e DD_CLIENT_TOKEN=your_token

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Install dd-trace-js
RUN npm install dd-trace --save

# Copy app source
COPY server.js ./

# Run as non-root user for safety
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
# CMD ["node", "server.js"]

# Add the tracer with command line arguments
# https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/#option-2-add-the-tracer-with-command-line-arguments
CMD ["node", "--require", "dd-trace/init", "server.js"]