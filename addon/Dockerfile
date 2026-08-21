FROM node:20-alpine

RUN apk add --no-cache python3 make g++

# Chromium + benodigde font-/renderbibliotheken voor server-side PDF-generatie
# (offerte/werkbon-PDF's, backend/lib/pdf.js) — puppeteer-core gebruikt dit
# systeem-Chromium i.p.v. zelf een eigen kopie te downloaden.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3000
CMD ["/run.sh"]
