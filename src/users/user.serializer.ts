import type { User } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  roles: string[];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Shape duy nhất của user khi ra API: bỏ passwordHash/tokenVersion và đổi BigInt id
 * thành chuỗi (BigInt không serialize được sang JSON).
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id.toString(),
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
