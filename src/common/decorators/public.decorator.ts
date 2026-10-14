import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** JwtAuthGuard chạy toàn cục (fail-closed); route công khai phải khai báo rõ bằng decorator này. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
