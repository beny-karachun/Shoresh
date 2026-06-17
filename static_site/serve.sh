#!/usr/bin/env bash
# Serve the static site over HTTP (required: the app fetches the DB + wasm,
# which browsers block over file://). Open the printed URL in your browser.
PORT="${1:-8000}"
cd "$(dirname "$0")"
echo "Serving מחשבון תזונתי at http://localhost:$PORT  (Ctrl+C to stop)"
exec python3 -m http.server "$PORT"
