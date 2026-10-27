#!/bin/bash
set -e

# Builds and runs the backend and the frontend directly on the host (no Docker for the app).
# MongoDB is started from docker compose if Docker is available. Press Ctrl+C to stop everything.
# Needs: .NET 8 SDK (dotnet) and Node.js 20 (npm) installed on this computer.

cd "$(dirname "$0")"

# Load the optional .env overrides (same file used by docker compose); create it with a random JWT_KEY if missing
if [ ! -f .env ]; then
    echo "JWT_KEY=$(openssl rand -hex 32 2> /dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" > .env
fi
# Round 44: a random secret "pepper" for the password hashes, added once to .env (never change it afterwards)
if ! grep -q '^PASSWORD_PEPPER=' .env; then
  echo "PASSWORD_PEPPER=$(openssl rand -hex 32 2> /dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> .env
fi
set -a && . ./.env && set +a

BACKEND_PORT="${BACKEND_PORT:-5080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
MONGODB_PORT="${MONGODB_PORT:-27018}"
export MONGODB_PORT

for tool in dotnet npm; do
    if ! command -v "$tool" > /dev/null; then
        echo "Error: '$tool' is not installed. Use ./deploy.sh instead (it only needs Docker)."
        exit 1
    fi
done

# Refuse to start if a port is taken (e.g. the Docker deployment is still running)
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    if ss -ltn "sport = :$port" | grep -q LISTEN; then
        echo "Error: port $port is already in use. If the Docker deployment is running, stop it with ./stopwebapp.sh"
        echo "       (or choose other ports, e.g.  FRONTEND_PORT=3002 BACKEND_PORT=5081 ./runlocal.sh)"
        exit 1
    fi
done

# Start MongoDB from docker compose (only the database container, reachable on localhost), if Docker is running
if docker info > /dev/null 2>&1; then
    echo "Starting MongoDB container (localhost:${MONGODB_PORT})..."
    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d mongo mailpit
else
    echo "Warning: Docker is not running, so MongoDB is not started (accounts and the portfolio won't work)."
fi

# Build the backend
echo "Building backend..."
dotnet build backend/CardApi --nologo -v quiet

# Install frontend dependencies if missing
echo "Preparing frontend..."
if [ -d frontend/node_modules ] && [ ! -w frontend/node_modules ]; then
    echo "Error: frontend/node_modules belongs to another user (made by a Docker container)."
    echo "       Remove it with:  docker run --rm -v \"\$PWD/frontend\":/w alpine rm -rf /w/node_modules"
    exit 1
fi
[ -d frontend/node_modules ] || (cd frontend && npm install --no-audit --no-fund)

# Stop both servers when the script exits (Ctrl+C included)
pids=()
cleanup() {
    echo
    echo "Stopping backend and frontend..."
    kill "${pids[@]}" 2> /dev/null || true
    wait 2> /dev/null || true
}
trap cleanup EXIT INT TERM

# Run the backend (ASP.NET Core 8 minimal API) on a fixed port
echo "Starting backend..."
(
    cd backend/CardApi
    ASPNETCORE_ENVIRONMENT=Development \
    ASPNETCORE_URLS="http://localhost:${BACKEND_PORT}" \
    Mongo__ConnectionString="mongodb://localhost:${MONGODB_PORT}" \
    Mongo__Database=birthdaycards \
    Jwt__Key="${JWT_KEY}" \
    Security__PasswordPepper="${PASSWORD_PEPPER}" \
    Smtp__Host="${SMTP_HOST:-localhost}" Smtp__Port="${SMTP_PORT:-${MAILPIT_SMTP_PORT:-1026}}" \
    Smtp__User="${SMTP_USER:-}" Smtp__Password="${SMTP_PASSWORD:-}" Smtp__From="${SMTP_FROM:-}" \
    App__PublicUrl="${PUBLIC_URL:-http://localhost:${FRONTEND_PORT}}" \
    Cors__Origins="http://localhost:${FRONTEND_PORT}" \
    exec dotnet run --no-build --no-launch-profile
) &
pids+=($!)

# Run the frontend dev server; its /api requests are proxied to the backend (API_TARGET, see vite.config.js)
echo "Starting frontend..."
(
    cd frontend
    API_TARGET="http://localhost:${BACKEND_PORT}" \
    exec npx vite --port "$FRONTEND_PORT" --strictPort
) &
pids+=($!)

echo "--------------------------------------------------"
echo " * GIFt it! (React):  http://localhost:${FRONTEND_PORT}"
echo " * Backend (.NET API):   http://localhost:${BACKEND_PORT}/api   (health: /api/health)"
echo " * MongoDB Database:     localhost:${MONGODB_PORT}"
echo " * Test email inbox:     http://localhost:${MAILPIT_PORT:-8025}"
echo "--------------------------------------------------"
echo "Press Ctrl+C to stop."

# Exit as soon as either server dies
wait -n
