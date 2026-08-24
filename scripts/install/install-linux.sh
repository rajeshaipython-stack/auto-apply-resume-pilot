#!/usr/bin/env bash
# ResumePilot installer for Linux.
#   chmod +x install-linux.sh && ./install-linux.sh
set -euo pipefail
REPO="https://github.com/rajeshaipython-stack/auto-apply-resume-pilot.git"
DEST="$HOME/auto-apply-resume-pilot"

echo "ResumePilot installer (Linux)"
command -v git  >/dev/null 2>&1 || { echo "[!] Install git (e.g. sudo apt install git)"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "[!] Install Node.js 18+ from https://nodejs.org"; exit 1; }

if [ -d "$DEST/.git" ]; then git -C "$DEST" pull --ff-only; else git clone --depth 1 "$REPO" "$DEST"; fi
cd "$DEST"
npm install
npm run build

CFG="$HOME/.config/Claude/claude_desktop_config.json"
cat <<EOF

============================================================
 Build complete. Add this to your Claude Desktop config:
   $CFG
------------------------------------------------------------
{
  "mcpServers": {
    "resumepilot": {
      "command": "node",
      "args": ["$DEST/dist/src/index.js"],
      "env": { "RESUMEPILOT_DATA_DIR": "$HOME/ResumePilot" }
    }
  }
}
============================================================
 Then fully quit and reopen Claude Desktop.
EOF
