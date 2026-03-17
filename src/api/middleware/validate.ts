import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: result.error.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request body',
        details: result.error.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.validatedBody = result.data;
    next();
  };
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: any;
      validatedBody?: any;
    }
  }
}
