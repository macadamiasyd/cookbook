import { NextRequest } from 'next/server';

export function isAuthorized(req: NextRequest): boolean {
  const token = process.env.WRITE_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization');
  return header === `Bearer ${token}`;
}
