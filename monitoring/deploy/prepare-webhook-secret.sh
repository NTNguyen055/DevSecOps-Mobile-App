#!/usr/bin/env bash
set -euo pipefail
umask 077

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
WEBHOOK_SECRET_ID="devsecops-monitoring/webhook-auth"
WEBHOOK_SECRET_FILE="${MONITORING_SECRET_FILE:-/home/ubuntu/monitoring/secrets/monitoring_webhook_token}"
WEBHOOK_SECRET_GID=24000

# This script must run as root on the deployment EC2 instance.
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Root privileges are required" >&2
  exit 1
fi

command -v aws >/dev/null
command -v python3 >/dev/null

SECRET_DIR="$(dirname "$WEBHOOK_SECRET_FILE")"

# Restrict access to the host-side secrets directory.
install -d -o root -g root -m 0700 "$SECRET_DIR"

TEMP_FILE="$(mktemp "$SECRET_DIR/.webhook-token.XXXXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT

# Fetch JSON from Secrets Manager and extract the exact key.
# The token is written directly to a private temporary file.
aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$WEBHOOK_SECRET_ID" \
  --query SecretString \
  --output text |
  python3 -c '
import json
import sys

data = json.load(sys.stdin)
token = data.get("webhook-auth-secret")

if (
    not isinstance(token, str)
    or len(token) < 32
    or token != token.strip()
):
    raise SystemExit("Invalid webhook authentication secret")

sys.stdout.write(token)
' > "$TEMP_FILE"

test -s "$TEMP_FILE"

# Grant read access only to root and supplementary group 24000.
chown 0:"$WEBHOOK_SECRET_GID" "$TEMP_FILE"
chmod 0440 "$TEMP_FILE"

# Atomically replace the destination file.
mv -f "$TEMP_FILE" "$WEBHOOK_SECRET_FILE"

trap - EXIT

echo "Webhook authentication secret prepared successfully"
