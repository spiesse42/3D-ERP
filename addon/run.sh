#!/usr/bin/with-contenv bashio

export NODE_ENV=production
export PORT=3000
export DB_PATH=/data/erp.db
export HA_URL="http://supervisor/core"
export HA_TOKEN=$(bashio::config 'ha_token')

if [ -z "$HA_TOKEN" ]; then
  export HA_TOKEN="$SUPERVISOR_TOKEN"
fi

bashio::log.info "3D Print ERP opstarten op poort 3000..."
bashio::log.info "Database: $DB_PATH"

cd /app/backend
node server.js
