FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright

COPY --chown=node:node src ./src
RUN mkdir -p /app/output && chown -R node:node /app/output

USER node
EXPOSE 8787
CMD ["node", "src/server.mjs"]
