import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Cho qua nếu user có ÍT NHẤT MỘT trong các quyền liệt kê. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
