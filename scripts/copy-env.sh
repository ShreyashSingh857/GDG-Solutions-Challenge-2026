#!/bin/bash
# Copies the root .env into each service directory so dotenv/config finds it.
# Run once after filling in .env:
#   bash scripts/copy-env.sh

set -e

if [ ! -f ".env" ]; then
  echo "ERROR: .env not found in repo root. Copy .env.example to .env and fill in all values first."
  exit 1
fi

cp .env event-bus/.env
cp .env disruption/.env
cp .env impact/.env
cp .env resolution/.env
cp .env news-intel/.env
cp .env dashboard/.env.local

echo "Done. .env copied to: event-bus, disruption, impact, resolution, news-intel, dashboard (.env.local)"
