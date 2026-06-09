FROM ghcr.io/home-assistant/amd64-base-nodejs:20

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
