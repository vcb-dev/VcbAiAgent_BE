import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { toPublicUser } from '../users/user.serializer';
import { AuthService } from './auth.service';
import { CookieAuthService } from './cookie-auth.service';
import { COOKIE_CSRF, COOKIE_REFRESH } from './cookie.constants';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: CookieAuthService,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Phát CSRF token cho phiên chưa đăng nhập' })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const existing = req.cookies?.[COOKIE_CSRF] as string | undefined;
    if (existing) return { csrfToken: existing };

    const csrf = randomBytes(32).toString('hex');
    res.cookie(COOKIE_CSRF, csrf, {
      httpOnly: false,
      secure: req.secure,
      sameSite: 'lax',
      path: '/',
    });
    return { csrfToken: csrf };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Đăng nhập — token được đặt vào cookie httpOnly' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    const csrfToken = this.cookies.setAuthCookies(res, result);
    return {
      success: true as const,
      message: 'Đăng nhập thành công',
      data: { user: result.user, csrfToken },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi cặp token mới bằng refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE_REFRESH] as string | undefined;
    if (!token) throw new UnauthorizedException('Thiếu refresh token');

    const result = await this.authService.refresh(token);
    const csrfToken = this.cookies.setAuthCookies(res, result);
    return { user: result.user, csrfToken };
  }

  @Get('me')
  @ApiOperation({ summary: 'Thông tin người dùng của phiên hiện tại' })
  me(@CurrentUser() user: User) {
    return toPublicUser(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất và thu hồi mọi token đã phát hành' })
  async logout(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id);
    this.cookies.clearAuthCookies(res);
    return { success: true as const, message: 'Đã đăng xuất', data: null };
  }
}
