import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { toPublicUser } from './user.serializer';

const BCRYPT_ROUNDS = 12;

function parseUserId(id: string | number | bigint): bigint {
  try {
    return typeof id === 'bigint' ? id : BigInt(id);
  } catch {
    throw new BadRequestException('ID người dùng không hợp lệ');
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hash nằm trong service để không controller nào lỡ lưu mật khẩu dạng thô. */
  private hash(password: string) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  findById(id: string | number | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: parseUserId(id) } });
  }

  /** Email không phân biệt hoa thường — findUnique không hỗ trợ `mode`. */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
    });
  }

  async findAll(query: QueryUsersDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { roles: { has: query.role } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, items: rows.map(toPublicUser) };
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.hash(dto.password),
        fullName: dto.fullName ?? null,
        phoneNumber: dto.phoneNumber ?? null,
        roles: dto.roles ?? undefined,
        isActive: dto.isActive ?? true,
      },
    });
    return toPublicUser(user);
  }

  async update(id: string | number | bigint, dto: UpdateUserDto) {
    const userId = parseUserId(id);
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('Không tìm thấy người dùng');

    const { password, ...rest } = dto;
    // Đổi mật khẩu hoặc khoá tài khoản thì thu hồi luôn token cũ.
    const revoke = password !== undefined || (rest.isActive === false && existing.isActive);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        ...(password ? { passwordHash: await this.hash(password) } : {}),
        ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    return toPublicUser(user);
  }

  async remove(id: string | number | bigint) {
    const userId = parseUserId(id);
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException('Không tìm thấy người dùng');

    // Vô hiệu hoá thay vì xoá cứng: giữ lịch sử job/duyệt gắn với user này.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });
    return toPublicUser(user);
  }

  async changePassword(id: string | number | bigint, currentPassword: string, newPassword: string) {
    const userId = parseUserId(id);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hash(newPassword), tokenVersion: { increment: 1 } },
    });
  }

  markLoggedIn(id: bigint) {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  revokeTokens(id: bigint) {
    return this.prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  }
}
