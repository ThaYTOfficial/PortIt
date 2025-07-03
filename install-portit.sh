#!/bin/bash
set -e

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Installing Node.js..."
  # Try to install Node.js (Debian/Ubuntu)
  if command -v apt >/dev/null 2>&1; then
    sudo apt update && sudo apt install -y nodejs npm
  else
    echo "Please install Node.js manually."
    exit 1
  fi
fi

# Download portit.js
PORTIT_PATH="/usr/local/bin/portit"
sudo curl -fsSL -o "$PORTIT_PATH" https://your-server.com/portit.js
sudo chmod +x "$PORTIT_PATH"

# Add shebang if missing
if ! head -1 "$PORTIT_PATH" | grep -q "/usr/bin/env node"; then
  sudo sed -i '1i #!/usr/bin/env node' "$PORTIT_PATH"
fi

echo "portit installed! Use: portit add <local-port>" 