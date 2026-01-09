import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { query } from '../database';
import { config } from '../config/env';
import { User } from './types';
import { logger } from '../utils/logger';

export function initializePassport() {
  // Only initialize Google Strategy if credentials are provided
  if (config.google.clientId && config.google.clientSecret) {
    passport.use(new GoogleStrategy({
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'), undefined);
          }

          // Check if user exists
          let result = await query<User>(
            'SELECT * FROM users WHERE google_id = $1',
            [profile.id]
          );

          let user: User;

          if (result.rows.length === 0) {
            // Determine role based on admin emails list
            const isAdmin = config.auth.adminEmails.includes(email);
            const role = isAdmin ? 'admin' : 'user';

            // Create new user
            result = await query<User>(
              `INSERT INTO users (google_id, email, name, picture_url, role, last_login)
               VALUES ($1, $2, $3, $4, $5, NOW())
               RETURNING *`,
              [
                profile.id,
                email,
                profile.displayName,
                profile.photos?.[0]?.value || null,
                role
              ]
            );
            user = result.rows[0];
            logger.info(`New user created: ${email} (role: ${role})`);
          } else {
            user = result.rows[0];
            // Update last login and potentially upgrade to admin
            const shouldBeAdmin = config.auth.adminEmails.includes(email);
            const newRole = shouldBeAdmin ? 'admin' : user.role;

            await query(
              'UPDATE users SET last_login = NOW(), role = $2 WHERE id = $1',
              [user.id, newRole]
            );
            user.role = newRole;
            logger.info(`User logged in: ${email} (role: ${newRole})`);
          }

          return done(null, user);
        } catch (error) {
          logger.error('Google OAuth error:', error);
          return done(error as Error, undefined);
        }
      }
    ));
  } else {
    logger.warn('Google OAuth credentials not configured - authentication disabled');
  }

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const result = await query<User>(
        'SELECT id, google_id, email, name, picture_url, role, is_active FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return done(null, false);
      }

      const user = result.rows[0];
      if (!user.is_active) {
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

export default passport;
