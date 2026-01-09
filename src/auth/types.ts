export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  role: 'user' | 'admin';
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

declare global {
  namespace Express {
    interface User {
      id: number;
      google_id: string;
      email: string;
      name: string | null;
      picture_url: string | null;
      role: 'user' | 'admin';
      is_active: boolean;
    }
  }
}
