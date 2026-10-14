import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { toPublicUser } from '../users/user.serializer';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** ConfigService trả `string`, còn jsonwebtoken nhận union hẹp `number | StringValue`. */
  private expiry(key: 'jwt.expiresIn' | 'jwt.refreshExpiresIn', fallback: string) {
    return this.config.get<string>(key, fallback) as JwtSignOptions['expiresIn'];
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id.toString(),
      email: user.email,
      roles: user.roles,
      tv: user.tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.expiry('jwt.expiresIn', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.expiry('jwt.refreshExpiresIn', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    // So sánh hash cả khi không tìm thấy user để thời gian phản hồi không lộ email tồn tại hay không.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const matched = await bcrypt.compare(password, hash);

    if (!user || !matched) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khoá');
    }
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    const tokens = await this.generateTokens(user);
    await this.usersService.markLoggedIn(user.id);
    return { user: toPublicUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Phiên đã hết hạn, vui lòng đăng nhập lại');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      // tokenVersion lệch = đã logout hoặc đổi mật khẩu → refresh token cũ vô hiệu.
      throw new UnauthorizedException('Phiên đã hết hiệu lực, vui lòng đăng nhập lại');
    }

    const tokens = await this.generateTokens(user);
    return { user: toPublicUser(user), ...tokens };
  }

  /** Tăng tokenVersion để mọi access/refresh token đã phát hành trở nên vô hiệu ngay lập tức. */
  async logout(userId: bigint) {
    await this.usersService.revokeTokens(userId);
  }
}
