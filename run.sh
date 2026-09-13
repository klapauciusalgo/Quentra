#!/bin/bash
# QuietAlgo Startup Script
# Runs the unified FastAPI server on port 8080 (backend APIs, Binance WebSocket, and React frontend)

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend" || exit 1

echo "=========================================================="
echo "    QUIETALGO - PIXEL TRADING FLOOR & ALGO STRATEGY HUB"
echo "=========================================================="
echo "Starting Backend & Binance WebSocket on http://0.0.0.0:8080..."

exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8080
