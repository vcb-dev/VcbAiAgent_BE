import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { COOKIE_CSRF, CSRF_HEADER } from '../cookie.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Các route chạy trước khi người dùng có cookie CSRF. */
const EXEMPT_PATHS = [/\/auth\/login$/, /\/auth\/csrf$/];

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Double-submit cookie: cookie `vcb_csrf` (JS đọc được) phải khớp header `x-csrf-token`.
 * Vì token auth nằm trong cookie, trình duyệt tự gửi kèm ở request cross-site — header
 * thì không, nên đây là thứ chặn CSRF.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (EXEMPT_PATHS.some((re) => re.test(req.path))) return true;

    const cookieToken = req.cookies?.[COOKIE_CSRF] as string | undefined;
    const headerToken = req.header(CSRF_HEADER);

    // Fail-closed: thiếu cookie cũng là lỗi. Không để ngỏ như một "đường tạm".
    if (!cookieToken || !headerToken || !equals(cookieToken, headerToken)) {
      throw new ForbiddenException('CSRF token không hợp lệ');
    }
    return true;
  }
}
