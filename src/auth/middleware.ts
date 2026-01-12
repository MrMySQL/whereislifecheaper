import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: Express.User;
}

function isUserAuthenticated(req: AuthenticatedRequest): boolean {
  return Boolean(req.isAuthenticated && req.isAuthenticated());
}

export function isAuthenticated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (isUserAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required',
  });
}

export function isAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!isUserAuthenticated(req)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (req.user?.role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  next();
}

export function optionalAuth(
  _req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  next();
}
