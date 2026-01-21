#!/bin/bash
set -e

TERRAFORM_DIR="$(dirname "$0")/../terraform"
CLUSTER=$(terraform -chdir="$TERRAFORM_DIR" output -raw ecs_cluster_name)

echo "Finding running tasks in cluster: $CLUSTER"
TASKS=$(aws ecs list-tasks --cluster "$CLUSTER" --desired-status RUNNING --query 'taskArns[]' --output text)

if [ -z "$TASKS" ] || [ "$TASKS" = "None" ]; then
  echo "No running tasks found."
  exit 0
fi

echo "Stopping tasks..."
for TASK in $TASKS; do
  echo "Stopping: $TASK"
  aws ecs stop-task --cluster "$CLUSTER" --task "$TASK" --query 'task.lastStatus' --output text
done

echo "Done."
