#!/usr/bin/env bash
#
# Universal skill runner for ClaudeClaw agents.
# Usage: $PROJECT_ROOT/scripts/run-skill.sh <skill_name> '<json_input>'
#
# Reads manifest.json from the skill directory to determine the handler type,
# then invokes it with SKILL_INPUT set to the JSON input.
#
# Requires PROJECT_ROOT to be set in the environment.

set -euo pipefail

if [[ -z "${PROJECT_ROOT:-}" ]]; then
  echo '{"status":"error","error":"PROJECT_ROOT not set"}' >&2
  exit 1
fi

SKILL_NAME="${1:?Usage: run-skill.sh <skill_name> '<json_input>'}"
SKILL_INPUT="${2:-{}}"

SKILL_DIR="$PROJECT_ROOT/skills/$SKILL_NAME"
MANIFEST="$SKILL_DIR/manifest.json"

if [[ ! -d "$SKILL_DIR" ]]; then
  echo "{\"status\":\"error\",\"error\":\"Skill not found: $SKILL_NAME\"}"
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "{\"status\":\"error\",\"error\":\"No manifest.json in skill: $SKILL_NAME\"}"
  exit 1
fi

# Read handler type from manifest.json
HANDLER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['handler'])" "$MANIFEST" 2>/dev/null || echo "")

if [[ -z "$HANDLER" ]]; then
  echo "{\"status\":\"error\",\"error\":\"Could not read handler from manifest.json\"}"
  exit 1
fi

export SKILL_INPUT

case "$HANDLER" in
  py)
    exec python3 "$SKILL_DIR/handler.py"
    ;;
  node|js)
    exec node "$SKILL_DIR/handler.js"
    ;;
  bash|sh)
    exec bash "$SKILL_DIR/handler.sh"
    ;;
  *)
    echo "{\"status\":\"error\",\"error\":\"Unknown handler type: $HANDLER\"}"
    exit 1
    ;;
esac
