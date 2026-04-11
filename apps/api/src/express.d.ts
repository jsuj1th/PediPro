import type { AuthContext } from './types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

export {};
