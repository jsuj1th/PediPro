import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthContext, UserRole } from '../types.js';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: AuthContext): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthContext {
  return jwt.verify(token, config.jwtSecret) as AuthContext;
}

export function requireRole(role: UserRole, currentRole: UserRole): boolean {
  if (role === 'parent') return currentRole === 'parent';
  if (role === 'staff') return currentRole === 'staff' || currentRole === 'admin';
  return currentRole === 'admin';
}
