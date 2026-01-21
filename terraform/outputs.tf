output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.scraper.repository_url
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.scraper.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for scraper logs"
  value       = aws_cloudwatch_log_group.scraper.name
}

output "security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

output "database_secret_arn" {
  description = "ARN of the database URL secret in Secrets Manager"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "eventbridge_rule_name" {
  description = "Name of the EventBridge rule for daily scraping"
  value       = aws_cloudwatch_event_rule.daily_scrape.name
}

output "push_commands" {
  description = "Commands to push Docker image to ECR"
  value       = <<-EOT
    # Authenticate Docker to ECR
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.scraper.repository_url}

    # Build and tag image
    docker build -t ${var.ecr_repository_name} .
    docker tag ${var.ecr_repository_name}:latest ${aws_ecr_repository.scraper.repository_url}:latest

    # Push to ECR
    docker push ${aws_ecr_repository.scraper.repository_url}:latest
  EOT
}
