-- Migration: Create users and sessions tables for Google OAuth authentication
-- Description: Users table stores Google OAuth user data, sessions table stores express-session data

-- Users table for OAuth authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture_url TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table for express-session with connect-pg-simple
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (sid)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Create trigger to automatically update updated_at timestamp
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE users IS 'Users authenticated via Google OAuth';
COMMENT ON COLUMN users.google_id IS 'Google unique identifier from OAuth';
COMMENT ON COLUMN users.role IS 'User role: user (default) or admin';
COMMENT ON TABLE sessions IS 'Express session storage for authenticated users';
