import { query, getClient, closePool, checkConnection } from '../config/database';

export {
  query,
  getClient,
  closePool,
  checkConnection,
};

// Re-export database models when they're created
// export * from './models/Country';
// export * from './models/Supermarket';
// export * from './models/Category';
// export * from './models/Product';
// export * from './models/Price';
// export * from './models/ScrapeLog';
