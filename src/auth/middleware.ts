import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: Express.User;
}

export const isAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required',
  });
};

export const isAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.role === 'admin') {
    return next();
  }
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }
  res.status(403).json({
    error: 'Forbidden',
    message: 'Admin access required',
  });
};

export const optionalAuth = (
  _req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  // This middleware just ensures req.user is available if authenticated
  // but doesn't require authentication
  next();
};
