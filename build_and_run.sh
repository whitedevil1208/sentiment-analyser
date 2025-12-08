#!/bin/bash

# Build the Docker image
echo "Building Docker image..."
docker build -t sentiment-analysis-app .

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "Docker build successful."
    
    # Run the Docker container
    # -p 8000:8000 maps port 8000 of the container to port 8000 of the host
    # --rm removes the container when it stops
    echo "Starting container on port 8000..."
    docker run --rm -p 8000:8000 sentiment-analysis-app
else
    echo "Docker build failed."
    exit 1
fi
