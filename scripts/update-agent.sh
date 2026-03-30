#!/usr/bin/env bash
#
# Push code updates to a deployed ClaudeClaw agent droplet.
#
# Usage: ./scripts/update-agent.sh <DROPLET_IP> <AGENT_ID>
#
# Syncs code, reinstalls deps, rebuilds, and restarts the service.
# Does NOT overwrite secrets (.env, agent.yaml, google creds).

set -euo pipefail

DROPLET_IP="${1:?Usage: update-agent.sh <DROPLET_IP> <AGENT_ID>}"
AGENT_ID="${2:?Usage: update-agent.sh <DROPLET_IP> <AGENT_ID>}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_USER="claudeclaw"
REMOTE_DIR="/home/$REMOTE_USER/lead_generation"
SERVICE_NAME="claudeclaw-$AGENT_ID"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/claudeclaw_do}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
export RSYNC_RSH="ssh $SSH_OPTS"

echo "==> Updating agent '$AGENT_ID' on $DROPLET_IP (key: $SSH_KEY)"

# Sync code (preserve secrets on remote)
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

# Reinstall deps + rebuild
ssh $SSH_OPTS "root@$DROPLET_IP" "su - $REMOTE_USER -c 'cd $REMOTE_DIR && npm install && npm run build'"

# Restart service
ssh $SSH_OPTS "root@$DROPLET_IP" "systemctl restart $SERVICE_NAME"

echo "==> Done! Service restarted."
echo "    View logs: ssh root@$DROPLET_IP journalctl -u $SERVICE_NAME -f"
