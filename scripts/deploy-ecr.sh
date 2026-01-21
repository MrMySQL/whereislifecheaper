#!/bin/bash
set -e

ECR_REPO="685470421486.dkr.ecr.eu-central-1.amazonaws.com/whereislifecheaper-scraper"
AWS_REGION="eu-central-1"

echo "Building Docker image..."
docker build -t whereislifecheaper-scraper .

echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO

echo "Tagging image..."
docker tag whereislifecheaper-scraper:latest $ECR_REPO:latest

echo "Pushing to ECR..."
docker push $ECR_REPO:latest

echo "Deploy complete!"
