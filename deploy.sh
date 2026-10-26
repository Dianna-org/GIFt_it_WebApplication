#!/bin/bash
set -e

# Builds the Docker images and starts the whole app (web + api + MongoDB) in containers.

cd "$(dirname "$0")"

# The app needs a secret for login tokens: create .env with a random one the first time
if [ ! -f .env ]; then
  echo "No .env found – creating one with a new random JWT_KEY..."
  echo "JWT_KEY=$(openssl rand -hex 32 2> /dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" > .env
fi
set -a && . ./.env && set +a

WEB_PORT="${WEB_PORT:-3000}"

echo "Starting 'GIFt it!' Local Deployment..."

# Check if Docker daemon is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker Desktop or the Docker service and try again."
  echo "Note: to start the Docker service on Linux, run:"
  echo "      sudo systemctl start docker"
  exit 1
fi

# The web port must be free (unless it is our own web container, which will just be replaced)
if ss -ltn "sport = :$WEB_PORT" | grep -q LISTEN \
   && ! docker ps --format '{{.Names}} {{.Ports}}' | grep -q "msa_webapplication-web-1 .*:$WEB_PORT->"; then
  echo "Error: port $WEB_PORT is already in use by another program (for example another web app or ./runlocal.sh)."
  echo "       Stop it, or start GIFt it! on another port:  WEB_PORT=3002 ./deploy.sh"
  exit 1
fi

echo "Building images and launching containers..."
WEB_PORT="$WEB_PORT" docker compose up --build -d

# Wait until the API answers through the web server
echo -n "Waiting for the app to be ready"
for _ in $(seq 1 60); do
  if curl -fs "http://localhost:${WEB_PORT}/api/health" > /dev/null 2>&1; then ready=1; break; fi
  echo -n "."; sleep 1
done
echo
if [ -z "$ready" ]; then
  echo "Warning: the app did not answer yet. Check the logs with: docker compose logs -f"
  exit 1
fi

echo "Deployment successful!"
echo "--------------------------------------------------"
echo " * GIFt it! (React):  http://localhost:${WEB_PORT}"
echo " * Backend (.NET API):   http://localhost:${WEB_PORT}/api   (health: /api/health)"
echo " * MongoDB Database:     inside Docker only (not exposed)"
echo "--------------------------------------------------"
echo "Tip: Run 'docker compose logs -f' to view live application logs."
echo "     Run './stopwebapp.sh' to stop the app."
