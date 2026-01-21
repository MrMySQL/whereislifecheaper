#!/bin/bash
set -e

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
echo ""

echo "Starting ECS task..."
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition scraper-task \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' \
  --output text)

echo "Task started: $TASK_ARN"
echo ""
echo "Watch logs with:"
echo "  aws logs tail $LOG_GROUP --follow"
