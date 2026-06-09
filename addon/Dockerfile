FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3000
CMD ["/run.sh"]
