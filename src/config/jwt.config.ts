import { registerAs } from '@nestjs/config';

/** Secret mẫu trong .env.example — chặn boot nếu lọt lên production. */
const WEAK_SECRETS = [
  'dev-jwt-secret-change-me',
  'dev-jwt-refresh-secret-change-me',
  'secret',
  'changeme',
];

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
  const refreshSecret =
    process.env.JWT_REFRESH_SECRET ?? 'dev-jwt-refresh-secret-change-me';

  if (process.env.NODE_ENV === 'production') {
    if (WEAK_SECRETS.includes(secret)) {
      throw new Error('JWT_SECRET vẫn là giá trị mặc định — bắt buộc đổi trên production');
    }
    if (WEAK_SECRETS.includes(refreshSecret)) {
      throw new Error('JWT_REFRESH_SECRET vẫn là giá trị mặc định — bắt buộc đổi trên production');
    }
    if (secret === refreshSecret) {
      throw new Error('JWT_SECRET và JWT_REFRESH_SECRET phải khác nhau');
    }
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  };
});
