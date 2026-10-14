import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { COOKIE_ACCESS } from '../cookie.constants';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const token = req?.cookies?.[COOKIE_ACCESS];
          return typeof token === 'string' && token.length > 0 ? token : null;
        },
        // Giữ Bearer để gọi API bằng Swagger / script nội bộ.
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') as string,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Phiên không hợp lệ hoặc tài khoản đã bị khoá');
    }
    if (user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Phiên đã hết hiệu lực, vui lòng đăng nhập lại');
    }
    return user;
  }
}
