import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { COOKIE_ACCESS, COOKIE_CSRF, COOKIE_REFRESH } from './cookie.constants';

/**
 * Toàn bộ thao tác cookie auth gom về một chỗ: token không bao giờ xuống body JSON,
 * nên JS trên trình duyệt không đọc được (chống XSS đánh cắp token).
 */
@Injectable()
export class CookieAuthService {
  constructor(private readonly config: ConfigService) {}

  /** Đường dẫn duy nhất mà refresh cookie được gửi kèm. */
  private refreshPath(): string {
    const prefix = this.config.get<string>('API_PREFIX', 'api/v1').replace(/^\/|\/$/g, '');
    return `/${prefix}/auth`;
  }

  private flags(): { secure: boolean; sameSite: 'lax' | 'none' } {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', '');
    const isHttps = frontendUrl.startsWith('https://');
    const secure = this.config.get<string>('COOKIE_SECURE', isHttps ? 'true' : 'false') === 'true';
    // Dev chạy qua Vite proxy nên cùng origin → 'lax' là đủ và không cần HTTPS.
    return { secure, sameSite: isHttps ? 'none' : 'lax' };
  }

  private baseOptions(): CookieOptions {
    const { secure, sameSite } = this.flags();
    return { httpOnly: true, secure, sameSite, path: '/' };
  }

  /** '15m' | '7d' | '30s' → ms. Mặc định 15 phút nếu chuỗi sai định dạng. */
  private parseDurationMs(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 15 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
    return amount * (unit ?? 60_000);
  }

  /** Đặt access + refresh + csrf; trả về csrf token để controller gửi kèm trong body. */
  setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): string {
    const accessMaxAge = this.parseDurationMs(this.config.get<string>('jwt.expiresIn', '15m'));
    const refreshMaxAge = this.parseDurationMs(this.config.get<string>('jwt.refreshExpiresIn', '7d'));
    const csrf = randomBytes(32).toString('hex');
    const { secure, sameSite } = this.flags();

    res.cookie(COOKIE_ACCESS, tokens.accessToken, {
      ...this.baseOptions(),
      maxAge: accessMaxAge,
    });

    // Scope hẹp: refresh token không bị gửi kèm mọi request API thông thường.
    res.cookie(COOKIE_REFRESH, tokens.refreshToken, {
      ...this.baseOptions(),
      maxAge: refreshMaxAge,
      path: this.refreshPath(),
    });

    // Cố ý KHÔNG httpOnly: double-submit cần JS đọc được để gắn vào header.
    res.cookie(COOKIE_CSRF, csrf, {
      httpOnly: false,
      secure,
      sameSite,
      path: '/',
      maxAge: refreshMaxAge,
    });

    return csrf;
  }

  /** Options khi xoá phải khớp lúc đặt (path/sameSite/secure), nếu không trình duyệt giữ nguyên cookie. */
  clearAuthCookies(res: Response) {
    const { secure, sameSite } = this.flags();
    res.clearCookie(COOKIE_ACCESS, { path: '/', sameSite, secure });
    res.clearCookie(COOKIE_REFRESH, { path: this.refreshPath(), sameSite, secure });
    res.clearCookie(COOKIE_CSRF, { path: '/', sameSite, secure });
  }
}
