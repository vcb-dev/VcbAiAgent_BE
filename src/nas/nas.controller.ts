import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { NasService } from './nas.service';

/**
 * Kho footage cho bước chọn đầu của Studio: loại → sản phẩm → công đoạn → HuyK.
 * Các API GET đọc từ Postgres nên trả về ngay; chỉ nhóm `sync` mới chọc vào ổ mạng.
 */
@ApiTags('nas')
@Controller('nas')
@UseGuards(RolesGuard)
export class NasController {
  constructor(private readonly nas: NasService) {}

  @Get('status')
  @ApiOperation({ summary: 'Ổ mạng đã kết nối chưa, đã đồng bộ được bao nhiêu, lần quét gần nhất' })
  status() {
    return this.nas.status();
  }

  @Get('categories')
  @ApiOperation({ summary: 'Nhẫn, lắc tay, bông tai, dây chuyền' })
  categories() {
    return this.nas.categories();
  }

  @Get('categories/:code/products')
  @ApiOperation({ summary: 'Tên và mã sản phẩm của một loại' })
  products(
    @Param('code') code: string,
    @Query('search') search?: string,
    @Query('ready') ready?: string,
  ) {
    return this.nas.products(code, search, ready === '1' || ready === 'true');
  }

  @Get('categories/:code/products/:sku/craft-steps')
  @ApiOperation({ summary: 'Công đoạn chế tác của sản phẩm; lần đầu sẽ quét ổ nên chậm hơn' })
  craftSteps(
    @Param('code') code: string,
    @Param('sku') sku: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.nas.craftSteps(code, sku, refresh === 'true' || refresh === '1');
  }

  @Get('categories/:code/products/:sku/a4-plan')
  @ApiOperation({ summary: 'Bốc ngẫu nhiên 4 công đoạn + 2 cảnh HuyK cho tuyến A4' })
  a4Plan(@Param('code') code: string, @Param('sku') sku: string) {
    return this.nas.a4Plan(code, sku);
  }

  @Get('huyk-actions')
  @ApiOperation({ summary: 'Kho HuyK thao tác, chia theo hành động' })
  huykActions() {
    return this.nas.huykActions();
  }

  @Post('sync/products')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Quét lại toàn bộ sản phẩm từ ổ (vài phút)' })
  syncProducts() {
    return this.nas.syncProducts();
  }

  @Post('sync/huyk-actions')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Quét lại kho HuyK thao tác' })
  syncHuyk() {
    return this.nas.syncHuykActions();
  }

  @Post('categories/:code/products/:sku/prepare')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Kéo footage tuyến A4 của mã này về máy dựng proxy (vài phút)' })
  prepare(
    @Param('code') code: string,
    @Param('sku') sku: string,
    @Body() body: { craft?: string[]; huyk?: string[] },
  ) {
    return this.nas.prepareFootage(code, sku, body ?? {});
  }

  @Post('sync/craft-steps')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Nạp công đoạn của mọi sản phẩm vào DB; chạy nền, mất vài giờ' })
  syncAllCraft() {
    return this.nas.syncAllCraftSteps();
  }

  @Post('sync/categories/:code/products/:sku/craft-steps')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Quét lại công đoạn chế tác của một sản phẩm' })
  syncCraft(@Param('code') code: string, @Param('sku') sku: string) {
    return this.nas.syncCraftSteps(code, sku);
  }
}
