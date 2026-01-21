#!/bin/bash
set -e

# Usage: ./run-ecs-task.sh [supermarket-name]
# Examples:
#   ./run-ecs-task.sh           # Run all scrapers
#   ./run-ecs-task.sh migros    # Run only Migros scraper
#   ./run-ecs-task.sh voli      # Run only Voli scraper

SUPERMARKET=${1:-}

# Get values from Terraform state
TERRAFORM_DIR="$(dirname "$0")/../terraform"

echo "Getting configuration from Terraform..."
CLUSTER=$(terraform -chdir="$TERRAFORM_DIR" output -raw ecs_cluster_name)
SECURITY_GROUP=$(terraform -chdir="$TERRAFORM_DIR" output -raw security_group_id)
LOG_GROUP=$(terraform -chdir="$TERRAFORM_DIR" output -raw cloudwatch_log_group)

# Get first default subnet
SUBNET=$(aws ec2 describe-subnets --filters "Name=default-for-az,Values=true" --query 'Subnets[0].SubnetId' --output text)

echo "Cluster: $CLUSTER"
echo "Security Group: $SECURITY_GROUP"
echo "Subnet: $SUBNET"

# Build command override if supermarket specified
if [ -n "$SUPERMARKET" ]; then
  echo "Supermarket: $SUPERMARKET"
  OVERRIDES='{"containerOverrides":[{"name":"scraper","command":["npm","run","scraper:run","--","'"$SUPERMARKET"'"]}]}'
  echo ""
  echo "Starting ECS task for $SUPERMARKET..."
  TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition scraper-task \
    --launch-type FARGATE \
    --overrides "$OVERRIDES" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
    --query 'tasks[0].taskArn' \
    --output text)
else
  echo ""
  echo "Starting ECS task for ALL scrapers..."
  TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition scraper-task \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
    --query 'tasks[0].taskArn' \
    --output text)
fi

echo "Task started: $TASK_ARN"
echo ""
echo "Watch logs with:"
echo "  aws logs tail $LOG_GROUP --follow"
