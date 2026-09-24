#!/usr/bin/env bash
set -e

# Change to repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================================="
echo "🚀 [QUENTRA SHIP] Automated End-to-End Release Pipeline"
echo "=========================================================="

echo "▶️ Step 1/5: Harmonizing strategy metrics and stats..."
python3 backend/recalculate_btc_metrics.py

echo "▶️ Step 2/5: Running pytest suite for engine & API contracts..."
pytest backend/test_live_signals_and_chart.py -v

echo "▶️ Step 3/5: Building frontend production assets..."
cd frontend
npm run build
cd "$REPO_ROOT"

echo "▶️ Step 4/5: Restarting local backend service..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet quentra.service; then
    sudo systemctl restart quentra.service
    echo "✅ quentra.service successfully restarted."
else
    echo "ℹ️ quentra.service not active or sudo not required, continuing."
fi

echo "▶️ Step 5/5: Synchronizing Git repository & triggering Cloudflare Edge..."
git add backend/ frontend/ worker.js package.json scripts/
if git diff --staged --quiet; then
    echo "ℹ️ No unstaged/staged code changes to commit."
else
    COMMIT_MSG="chore(release): automated sync & build $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    git commit -m "$COMMIT_MSG"
    git push origin main
    echo "✅ Git push origin main complete! Cloudflare Edge Workers updated."
fi

echo "=========================================================="
echo "🎉 [QUENTRA SHIP] All systems synchronized and deployed!"
echo "=========================================================="

