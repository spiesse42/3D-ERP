#!/bin/bash
set -e

echo "=== 3D Print ERP — build script ==="

echo "→ Frontend dependencies installeren..."
cd frontend
npm install

echo "→ Frontend bouwen..."
npm run build

echo "→ Backend dependencies installeren (check)..."
cd ../backend
npm install --production

cd ..

echo "→ Gebuilde dist kopiëren naar addon..."
rm -rf addon/frontend
mkdir -p addon/frontend
cp -r frontend/dist addon/frontend/dist

echo "→ Backend kopiëren naar addon..."
rm -rf addon/backend
mkdir -p addon/backend
cp -r backend/* addon/backend/

echo ""
echo "✓ Build klaar! De 'addon/' map is klaar voor GitHub."
echo ""
echo "Volgende stap: push naar GitHub en voeg toe in HA."
