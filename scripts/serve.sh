#!/usr/bin/env bash

# Serve the UAP static site from the repository root.
# Usage: scripts/serve.sh [PORT]   (default 9000)
set -euo pipefail
PORT="${1:-9000}"
cd "$(dirname "$0")/.."
echo "UAP serving at http://localhost:${PORT}/unified-access.html"
python3 -m http.server "${PORT}" --bind 127.0.0.1
