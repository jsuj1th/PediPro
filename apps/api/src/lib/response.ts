import type { Response } from 'express';

export function ok<T>(res: Response, data: T): void {
  res.json({ data });
}

export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): void {
  res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}
