import { Router, Request, Response } from 'express';
import passport from 'passport';
import { config } from '../config/env';
import { AuthenticatedRequest } from './middleware';

const router = Router();

function isOAuthConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

// GET /api/auth/google - Initiate Google OAuth
router.get('/google', (req, res, next) => {
  if (!isOAuthConfigured()) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Google OAuth is not configured',
    });
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback - OAuth callback
router.get('/google/callback',
  (req, res, next) => {
    if (!isOAuthConfigured()) {
      res.redirect('/?error=oauth_not_configured');
      return;
    }
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' })(req, res, next);
  },
  (req: Request, res: Response) => {
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
      res.redirect('/');
    });
  }
);

// GET /api/auth/me - Get current user
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (req.isAuthenticated?.() && req.user) {
    const { id, email, name, role, picture_url } = req.user;
    res.json({ data: { id, email, name, role, picture_url } });
  } else {
    res.json({ data: null });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed', message: err.message });
      return;
    }
    req.session?.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('Session destroy error:', sessionErr);
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

// GET /api/auth/status - Check auth status (for frontend)
router.get('/status', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    authenticated: req.isAuthenticated?.() ?? false,
    isAdmin: req.user?.role === 'admin',
  });
});

export default router;
