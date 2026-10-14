import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieAuthService } from './cookie-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Secret được truyền tường minh ở từng lần ký (access/refresh khác secret).
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, CookieAuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
