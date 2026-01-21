variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "whereislifecheaper"
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository"
  type        = string
  default     = "whereislifecheaper-scraper"
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "whereislifecheaper"
}

variable "task_cpu" {
  description = "CPU units for the ECS task (1024 = 1 vCPU)"
  type        = number
  default     = 2048  # 2 vCPU
}

variable "task_memory" {
  description = "Memory in MB for the ECS task"
  type        = number
  default     = 4096  # 4 GB
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "whereislifecheaper"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
