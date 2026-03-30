#!/usr/bin/env bash
#
# Deploy a ClaudeClaw agent to a DigitalOcean droplet.
#
# Usage: ./scripts/deploy-agent.sh <AGENT_ID> <DROPLET_IP>
#
# Prerequisites:
#   - SSH access to the droplet (root or sudo user)
#   - Agent configured locally: agents/<AGENT_ID>/agent.yaml, .env
#
# What it does:
#   1. Installs Node 20, Python 3, build-essential on the droplet
#   2. Creates a 'claudeclaw' user
#   3. Syncs the repo (excluding secrets and build artifacts)
#   4. Copies secrets separately
#   5. Installs dependencies and builds
#   6. Sets up systemd service

set -euo pipefail

AGENT_ID="${1:?Usage: deploy-agent.sh <AGENT_ID> <DROPLET_IP>}"
DROPLET_IP="${2:?Usage: deploy-agent.sh <AGENT_ID> <DROPLET_IP>}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_USER="claudeclaw"
REMOTE_DIR="/home/$REMOTE_USER/lead_generation"
AGENT_DIR="$PROJECT_ROOT/agents/$AGENT_ID"

if [[ ! -f "$AGENT_DIR/agent.yaml" ]]; then
  echo "Error: $AGENT_DIR/agent.yaml not found"
  exit 1
fi

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  echo "Error: .env not found in $PROJECT_ROOT"
  exit 1
fi

SSH_KEY="${SSH_KEY:-$HOME/.ssh/claudeclaw_do}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
export RSYNC_RSH="ssh $SSH_OPTS"

echo "==> Deploying agent '$AGENT_ID' to $DROPLET_IP (key: $SSH_KEY)"

# ── Step 1: Install system dependencies ──────────────────────────────
echo "==> Installing system dependencies..."
ssh $SSH_OPTS "root@$DROPLET_IP" bash <<'REMOTE_DEPS'
set -euo pipefail

# Node 20 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Python 3 + pip
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv build-essential git

# Claude Code CLI
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code
fi

echo "Node: $(node -v), npm: $(npm -v), Python: $(python3 --version)"
REMOTE_DEPS

# ── Step 2: Create user ─────────────────────────────────────────────
echo "==> Creating user '$REMOTE_USER'..."
ssh $SSH_OPTS "root@$DROPLET_IP" bash <<REMOTE_USER_SETUP
set -euo pipefail
if ! id "$REMOTE_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$REMOTE_USER"
fi
loginctl enable-linger "$REMOTE_USER" 2>/dev/null || true
REMOTE_USER_SETUP

# ── Step 3: Sync repo ───────────────────────────────────────────────
echo "==> Syncing repo to droplet..."
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='store/' \
  --exclude='.env' \
  --exclude='.git/' \
  --exclude='agents/*/agent.yaml' \
  --exclude='agents/*/google_credentials.json' \
  --exclude='agents/*/google_token.json' \
  --exclude='agents/*/.claude/' \
  "$PROJECT_ROOT/" "root@$DROPLET_IP:$REMOTE_DIR/"

ssh $SSH_OPTS "root@$DROPLET_IP" "chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_DIR"

# ── Step 4: Copy secrets ────────────────────────────────────────────
echo "==> Copying secrets..."
scp $SSH_OPTS "$PROJECT_ROOT/.env" "root@$DROPLET_IP:$REMOTE_DIR/.env"

# Create agent directory and copy agent-specific files
ssh $SSH_OPTS "root@$DROPLET_IP" "mkdir -p $REMOTE_DIR/agents/$AGENT_ID"
scp $SSH_OPTS "$AGENT_DIR/agent.yaml" "root@$DROPLET_IP:$REMOTE_DIR/agents/$AGENT_ID/agent.yaml"

if [[ -f "$AGENT_DIR/google_credentials.json" ]]; then
  scp $SSH_OPTS "$AGENT_DIR/google_credentials.json" "root@$DROPLET_IP:$REMOTE_DIR/agents/$AGENT_ID/google_credentials.json"
fi
if [[ -f "$AGENT_DIR/google_token.json" ]]; then
  scp $SSH_OPTS "$AGENT_DIR/google_token.json" "root@$DROPLET_IP:$REMOTE_DIR/agents/$AGENT_ID/google_token.json"
fi

ssh $SSH_OPTS "root@$DROPLET_IP" "chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_DIR && chmod 600 $REMOTE_DIR/.env $REMOTE_DIR/agents/$AGENT_ID/agent.yaml"

# ── Step 5: Install deps + build ────────────────────────────────────
echo "==> Installing dependencies and building..."
ssh $SSH_OPTS "root@$DROPLET_IP" "su - $REMOTE_USER -c 'cd $REMOTE_DIR && npm install && pip3 install --break-system-packages -r skills/lead_generation/requirements.txt && npm run build'"

# ── Step 6: Systemd service ─────────────────────────────────────────
echo "==> Installing systemd service..."
SERVICE_NAME="claudeclaw-$AGENT_ID"
ssh $SSH_OPTS "root@$DROPLET_IP" bash <<REMOTE_SERVICE
set -euo pipefail
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=ClaudeClaw Agent: $AGENT_ID
After=network.target

[Service]
Type=simple
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node $REMOTE_DIR/dist/index.js --agent $AGENT_ID
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME
REMOTE_SERVICE

echo "==> Done! Agent '$AGENT_ID' deployed to $DROPLET_IP"
echo "    Check status: ssh root@$DROPLET_IP systemctl status $SERVICE_NAME"
echo "    View logs:    ssh root@$DROPLET_IP journalctl -u $SERVICE_NAME -f"
