#!/bin/bash
set -e

# Get ECR URL from Terraform state
TERRAFORM_DIR="$(dirname "$0")/../terraform"

echo "Getting ECR repository from Terraform..."
ECR_REPO=$(terraform -chdir="$TERRAFORM_DIR" output -raw ecr_repository_url)
AWS_REGION=$(aws configure get region || echo "eu-central-1")

echo "ECR Repository: $ECR_REPO"
echo ""

echo "Building Docker image..."
docker build -t whereislifecheaper-scraper .

echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO

echo "Tagging image..."
docker tag whereislifecheaper-scraper:latest $ECR_REPO:latest

echo "Pushing to ECR..."
docker push $ECR_REPO:latest

echo "Deploy complete!"
