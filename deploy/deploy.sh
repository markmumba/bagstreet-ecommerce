#!/usr/bin/env sh
# Deploys the release named by IMAGE_TAG in .env.production. Run from anywhere on the droplet:
#   ~/bagstreet/deploy/deploy.sh
# See docs/deployment.md#migrations.
set -eu

cd "$(dirname "$0")/.."

compose() {
    docker compose -f deploy/docker-compose.prod.yml --env-file .env.production "$@"
}

compose pull

# Backs up the database, then applies the new release's migrations. This runs before `up` on
# purpose: `up` replaces the API container before it runs migrate, so a failed migration would
# take the shop down. Here the running API is untouched, and set -e stops the deploy.
compose run --rm migrate

# Starts the new release. It runs the backup and migrate jobs again; migrate finds nothing to do.
compose up -d

docker image prune -f
compose ps
