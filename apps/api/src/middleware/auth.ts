import type { NextFunction, Request, Response } from 'express';
import { fail } from '../lib/response.js';
import { requireRole, verifyToken } from '../lib/auth.js';
import type { UserRole } from '../types.js';

export function authMiddleware(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      fail(res, 'UNAUTHORIZED', 'Missing bearer token', 401);
      return;
    }

    try {
      const token = authHeader.replace('Bearer ', '').trim();
      const payload = verifyToken(token);
      if (!requireRole(requiredRole, payload.role)) {
        fail(res, 'FORBIDDEN', 'Insufficient permissions', 403);
        return;
      }
      req.user = payload;
      next();
    } catch {
      fail(res, 'UNAUTHORIZED', 'Invalid token', 401);
    }
  };
}
