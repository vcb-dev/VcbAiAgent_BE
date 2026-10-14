import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toPublicUser } from './user.serializer';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ của chính mình' })
  me(@CurrentUser() user: User) {
    return toPublicUser(user);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi mật khẩu của chính mình (thu hồi mọi phiên cũ)' })
  async changeMyPassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { success: true as const, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.', data: null };
  }

  @Get()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Danh sách người dùng (phân trang, lọc theo quyền/trạng thái)' })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.manager)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) return null;
    return toPublicUser(user);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Tạo người dùng mới' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Vô hiệu hoá người dùng (không xoá cứng)' })
  remove(@Param('id') id: string, @CurrentUser() current: User) {
    if (current.id.toString() === id) {
      throw new ForbiddenException('Không thể tự vô hiệu hoá tài khoản của mình');
    }
    return this.usersService.remove(id);
  }
}
