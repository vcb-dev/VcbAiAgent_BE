import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

export interface ApiEnvelope<T> {
  success: true;
  message?: string;
  data: T;
}

/**
 * Bọc mọi response thành `{ success, message?, data }` ở một chỗ duy nhất, thay vì
 * để từng controller tự ghép tay (nguồn gốc lệch shape giữa các module).
 * Controller muốn trả raw (tải file, redirect) thì gắn `@SkipEnvelope()`.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'success' in payload) {
          return payload; // controller đã tự bọc (ví dụ cần kèm message riêng)
        }
        return { success: true as const, data: payload };
      }),
    );
  }
}
