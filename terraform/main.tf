terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use S3 backend for state
  # backend "s3" {
  #   bucket = "whereislifecheaper-terraform-state"
  #   key    = "scraper/terraform.tfstate"
  #   region = "eu-central-1"
  # }
}

provider "aws" {
  region = var.aws_region
  profile = "default"
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ECR Repository
resource "aws_ecr_repository" "scraper" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

# ECR Lifecycle Policy - Keep only last 5 images
resource "aws_ecr_lifecycle_policy" "scraper" {
  repository = aws_ecr_repository.scraper.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = var.ecs_cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "scraper" {
  name              = "/ecs/${var.ecs_cluster_name}/scraper"
  retention_in_days = 14

  tags = var.tags
}

# Secrets Manager - Database URL
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project_name}/database-url"
  description             = "PostgreSQL connection string for scrapers"
  recovery_window_in_days = 0  # Immediate deletion on destroy

  tags = var.tags
}

# Secrets Manager - Google Cloud credentials (optional)
resource "aws_secretsmanager_secret" "google_credentials" {
  name                    = "${var.project_name}/google-credentials"
  description             = "Google Cloud credentials JSON for logging"
  recovery_window_in_days = 0  # Immediate deletion on destroy

  tags = var.tags
}

# Secrets Manager - Proxy URL (optional)
resource "aws_secretsmanager_secret" "proxy_url" {
  name                    = "${var.project_name}/proxy-url"
  description             = "Proxy URL for scrapers (optional)"
  recovery_window_in_days = 0  # Immediate deletion on destroy

  tags = var.tags
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS to read secrets
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.google_credentials.arn,
          aws_secretsmanager_secret.proxy_url.arn
        ]
      }
    ]
  })
}

# IAM Role for ECS Task (runtime)
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# VPC - Use default VPC for simplicity (public subnet approach)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group for ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-tasks"
  description = "Security group for ECS scraper tasks"
  vpc_id      = data.aws_vpc.default.id

  # Allow all outbound traffic (needed for scraping and DB connections)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # No inbound rules needed - scrapers only make outbound connections

  tags = var.tags
}

# ECS Task Definition
resource "aws_ecs_task_definition" "scraper" {
  family                   = "scraper-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "scraper"
      image     = "${aws_ecr_repository.scraper.repository_url}:latest"
      essential = true

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "PLAYWRIGHT_HEADLESS"
          value = "false"
        },
        {
          name  = "SCRAPER_MAX_RETRIES"
          value = "3"
        },
        {
          name  = "SCRAPER_TIMEOUT"
          value = "30000"
        },
        {
          name  = "SCRAPER_CONCURRENT_BROWSERS"
          value = "2"
        },
        {
          name  = "SEED_DB"
          value = "true"
        },
        {
          name  = "SYNC_RATES"
          value = "true"
        },
        {
          name  = "DISABLE_DEV_SHM"
          value = "true"
        },
        {
          name  = "SCRAPER_PROXY_SUPERMARKETS"
          value = "migros,rewe"
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.database_url.arn
        },
        {
          name      = "GOOGLE_CREDENTIALS_JSON"
          valueFrom = aws_secretsmanager_secret.google_credentials.arn
        },
        {
          name      = "SCRAPER_PROXY_URL"
          valueFrom = aws_secretsmanager_secret.proxy_url.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.scraper.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = var.tags
}

# IAM Role for EventBridge to run ECS tasks
resource "aws_iam_role" "eventbridge_ecs" {
  name = "${var.project_name}-eventbridge-ecs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "eventbridge_ecs" {
  name = "run-ecs-task"
  role = aws_iam_role.eventbridge_ecs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          aws_ecs_task_definition.scraper.arn,
          "${replace(aws_ecs_task_definition.scraper.arn, "/:\\d+$/", "")}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      }
    ]
  })
}

# EventBridge Rule - Daily schedule at 3 AM UTC
resource "aws_cloudwatch_event_rule" "daily_scrape" {
  name                = "${var.project_name}-daily-scrape"
  description         = "Run scrapers daily at 3 AM UTC"
  schedule_expression = "cron(0 3 * * ? *)"

  tags = var.tags
}

# EventBridge Target - Run ECS Task
resource "aws_cloudwatch_event_target" "ecs_scraper" {
  rule      = aws_cloudwatch_event_rule.daily_scrape.name
  target_id = "run-scraper-task"
  arn       = aws_ecs_cluster.main.arn
  role_arn  = aws_iam_role.eventbridge_ecs.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.scraper.arn
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "LATEST"

    network_configuration {
      subnets          = data.aws_subnets.default.ids
      security_groups  = [aws_security_group.ecs_tasks.id]
      assign_public_ip = true  # Required for public subnet (no NAT Gateway)
    }
  }
}
