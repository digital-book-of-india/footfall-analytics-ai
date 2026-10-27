#!/usr/bin/env bash
# Deploy the standalone (VPS) footfall AI worker as a systemd service.
#
# Usage (as root): bash setup-vps.sh <git-repo-url>
#
# Safe to re-run: pulls the latest code if /opt/footfall already exists, and only
# scaffolds .env from .env.example the first time (never overwrites an existing .env).
set -euo pipefail

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  echo "Usage: bash setup-vps.sh <git-repo-url>" >&2
  exit 1
fi

INSTALL_DIR=/opt/footfall
SERVICE_NAME=dbi-footfall-ai-worker

echo "==> Installing system packages"
apt-get update -y
apt-get install -y git python3 python3-venv python3-pip libglib2.0-0

if ! id -u dbi >/dev/null 2>&1; then
  echo "==> Creating unprivileged user 'dbi'"
  useradd --system --shell /usr/sbin/nologin --create-home dbi
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> $INSTALL_DIR already present — pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "==> Cloning $REPO_URL into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR/apps/ai-worker"

echo "==> Setting up Python virtualenv"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!! Created apps/ai-worker/.env from .env.example — edit it now:"
  echo "   CORE_API_URL, AI_SERVICE_SHARED_SECRET, WORKER_ID"
  echo "   then re-run this script to install and start the service."
  chown dbi:dbi .env
  chmod 600 .env
  exit 0
fi

chown -R dbi:dbi "$INSTALL_DIR"
chmod 600 .env

echo "==> Installing systemd unit"
cp deploy/dbi-footfall-ai-worker.service "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "==> Done"
systemctl status "$SERVICE_NAME" --no-pager
