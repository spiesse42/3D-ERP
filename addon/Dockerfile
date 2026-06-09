ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
