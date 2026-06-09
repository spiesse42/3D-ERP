#!/bin/sh

export NODE_ENV=production
export PORT=3000
export DB_PATH=/data/erp.db

if [ -f /data/options.json ]; then
  HA_TOKEN_CFG=$(cat /data/options.json | grep -o '"ha_token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$HA_TOKEN_CFG" ]; then
    export HA_TOKEN="$HA_TOKEN_CFG"
  fi
fi

if [ -z "$HA_TOKEN" ] && [ -n "$SUPERVISOR_TOKEN" ]; then
  export HA_TOKEN="$SUPERVISOR_TOKEN"
fi

export HA_URL="http://supervisor/core"

echo "3D Print ERP opstarten op poort 3000..."
echo "Database: $DB_PATH"

cd /app/backend
node server.js
