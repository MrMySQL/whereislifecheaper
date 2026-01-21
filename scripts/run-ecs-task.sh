#!/bin/bash
set -e

CLUSTER="whereislifecheaper"
TASK_DEF="scraper-task"
SUBNET="subnet-58f63724"
SECURITY_GROUP="sg-03f5fc279875d994c"

echo "Starting ECS task..."
TASK_ARN=$(aws ecs run-task \
  --cluster $CLUSTER \
  --task-definition $TASK_DEF \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' \
  --output text)

echo "Task started: $TASK_ARN"
echo ""
echo "Watch logs with:"
echo "  aws logs tail /ecs/whereislifecheaper/scraper --follow"
