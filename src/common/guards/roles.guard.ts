import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) throw new ForbiddenException('Không có quyền truy cập');

    if (!requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException(
        `Yêu cầu quyền: ${requiredRoles.join(', ')}. Quyền hiện tại: ${user.roles.join(', ') || '(trống)'}`,
      );
    }
    return true;
  }
}
