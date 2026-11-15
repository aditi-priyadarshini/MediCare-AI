#!/usr/bin/env bash
# Runs on the OCI server (copied there by .github/workflows/deploy.yml).
# Usage: deploy.sh <image-tag> <image-prefix> <registry-user>   (GHCR pull token on stdin)
set -euo pipefail

tag=$1
prefix=$2
user=$3
cd "$(dirname "$0")"

[ -f .env ] || { echo "Missing $(pwd)/.env (see README: Deployment)"; exit 1; }

read -r token
printf '%s' "$token" | sudo docker login ghcr.io -u "$user" --password-stdin

# Some sudo configs ignore -E, so pass the image settings explicitly via `env`.
compose=(sudo env IMAGE_TAG="$tag" IMAGE_PREFIX="$prefix" docker compose -f docker-compose.prod.yml)

"${compose[@]}" pull
# `up` runs the one-shot migrate service first and only starts the app if it succeeds.
"${compose[@]}" up -d --no-build --remove-orphans

wait_healthy() {
  local service=$1 cid status
  cid=$("${compose[@]}" ps -q "$service")
  for _ in $(seq 1 36); do
    status=$(sudo docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)
    [ "$status" = "healthy" ] && return 0
    [ "$status" = "unhealthy" ] && break
    sleep 5
  done
  echo "$service did not become healthy"
  "${compose[@]}" logs --tail 80 "$service" || true
  return 1
}

wait_healthy backend
wait_healthy frontend
sudo docker image prune -f >/dev/null
echo "Deployed $tag"
