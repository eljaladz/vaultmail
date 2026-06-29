import 'server-only';
import crypto from 'node:crypto';

const getSecret = (): string => {
  const secret = process.env.IP_HASH_SECRET ?? process.env.WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('IP_HASH_SECRET or WEBHOOK_SECRET must be set in production');
    }
    return 'vaultmail-dev-only-fallback';
  }
  return secret;
};

export const hashIp = (ip: string): string => {
  return crypto
    .createHmac('sha256', getSecret())
    .update(ip)
    .digest('hex')
    .slice(0, 32);
};

export const getRequestIp = (req: Request): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return '0.0.0.0';
};
