#!/bin/sh

export NODE_ENV=production
export PORT=3000
export DB_PATH=/data/erp.db

if [ -f /data/options.json ]; then
  export HA_TOKEN=$(cat /data/options.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ha_token',''))" 2>/dev/null)
  export SMTP_USER=$(cat /data/options.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('smtp_user',''))" 2>/dev/null)
  export SMTP_PASS=$(cat /data/options.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('smtp_pass',''))" 2>/dev/null)
  export SMTP_FROM=$(cat /data/options.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('smtp_from',''))" 2>/dev/null)
fi

if [ -z "$HA_TOKEN" ] && [ -n "$SUPERVISOR_TOKEN" ]; then
  export HA_TOKEN="$SUPERVISOR_TOKEN"
fi

export HA_URL="http://supervisor/core"

echo "3D Print ERP v2 opstarten op poort 3000..."
echo "Database: $DB_PATH"
echo "SMTP: $SMTP_USER"

cd /app/backend
node server.js
