#!/bin/bash

# Default Docker Hub username
DOCKER_USER=${1:-"kishansingh1"}

echo "Building and pushing images for $DOCKER_USER..."

# 1. Build and Tag Sandbox
echo "Building Sandbox image..."
docker build -t $DOCKER_USER/codesandbox-sandbox:latest -f backend/Dockerfile.sandbox backend/
docker push $DOCKER_USER/codesandbox-sandbox:latest

# 2. Build and Tag Backend
echo "Building Backend image..."
docker build -t $DOCKER_USER/codesandbox-backend:latest ./backend
docker push $DOCKER_USER/codesandbox-backend:latest

# 3. Build and Tag Frontend
echo "Building Frontend image..."
docker build -t $DOCKER_USER/codesandbox-frontend:latest -f frontend/Dockerfile.prod ./frontend
docker push $DOCKER_USER/codesandbox-frontend:latest

echo "Done! All images pushed to $DOCKER_USER registry."
