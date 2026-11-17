#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for tool in terraform az docker node npm; do
  command -v "$tool" >/dev/null || { echo "Required tool not found: $tool" >&2; exit 1; }
done
[[ -d node_modules ]] || { echo "Run npm ci first." >&2; exit 1; }
docker info >/dev/null
terraform -chdir=terraform init -input=false

# The first apply creates the registry and private platform before the image exists.
terraform -chdir=terraform apply
SUBSCRIPTION_ID="$(terraform -chdir=terraform output -raw subscription_id)"
az account show --subscription "$SUBSCRIPTION_ID" --output none
ACR_NAME="$(terraform -chdir=terraform output -raw registry_name)"
LOGIN_SERVER="$(terraform -chdir=terraform output -raw registry_login_server)"
TAG="$(git rev-parse --short=7 HEAD)-$(date -u +%Y%m%d%H%M%S)"
az acr login --subscription "$SUBSCRIPTION_ID" --name "$ACR_NAME"
docker build --platform linux/amd64 -t "$LOGIN_SERVER/support-tickets:$TAG" .
docker push "$LOGIN_SERVER/support-tickets:$TAG"
DIGEST="$(az acr repository show --subscription "$SUBSCRIPTION_ID" --name "$ACR_NAME" \
  --image "support-tickets:$TAG" --query digest --output tsv)"
[[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Invalid image digest." >&2; exit 1; }
RELEASE_INPUTS="$(mktemp "$ROOT/terraform/.release.XXXXXX")"
trap 'rm -f "$RELEASE_INPUTS"' EXIT
node -e 'console.log(JSON.stringify({mcp_image_uri: process.argv[1]}, null, 2))' \
  "$LOGIN_SERVER/support-tickets@$DIGEST" > "$RELEASE_INPUTS"
mv "$RELEASE_INPUTS" "$ROOT/terraform/mcp.auto.tfvars.json"
terraform -chdir=terraform apply
npx --no-install tsx scripts/render-connector.ts

RESOURCE_GROUP="$(terraform -chdir=terraform output -raw resource_group_name)"
APP_NAME="$(terraform -chdir=terraform output -raw container_app_name)"
for attempt in $(seq 1 30); do
  READY="$(az containerapp show --subscription "$SUBSCRIPTION_ID" --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" --query properties.latestReadyRevisionName --output tsv)"
  LATEST="$(az containerapp show --subscription "$SUBSCRIPTION_ID" --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" --query properties.latestRevisionName --output tsv)"
  if [[ -n "$READY" && "$READY" == "$LATEST" ]]; then
    printf '\nPrivate MCP endpoint: %s\nHealthy revision: %s\n' \
      "$(terraform -chdir=terraform output -raw mcp_endpoint)" "$READY"
    echo "Complete Power Platform policy association and connector authentication in README.md."
    echo "Readiness is verified by ACA probes; test private reachability from Copilot Studio."
    exit 0
  fi
  sleep 10
done
echo "The latest revision did not become ready. Inspect Container Apps system and console logs." >&2
exit 1
