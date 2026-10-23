#!/bin/bash
set -e

cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

echo "Stopping 'Card Studio' containers..."

# Check if Docker daemon is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running, so there is nothing to stop."
  exit 1
fi

# Stop and remove the app's containers and network (the mongo-data volume – saved cards and accounts – is kept).
# The local-mode database container (started by ./runlocal.sh) belongs to the same project, so it stops too.
docker compose -f docker-compose.yml -f docker-compose.local.yml down

echo "All 'Card Studio' containers stopped."
echo "Tip: Run './deploy.sh' to start the app again. Database data is preserved."
echo "     To also delete the database data (all accounts and saved cards), run 'docker compose down -v'."
