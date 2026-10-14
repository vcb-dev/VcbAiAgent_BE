import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { Readable } from 'stream';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AiClientService } from './ai-client.service';

/**
 * Gateway sang VCB_AI. BE giữ xác thực + phân quyền; AI service không biết gì về user,
 * nó chỉ tin X-Assistant-Secret và không mở ra ngoài internet.
 */
@ApiTags('studio')
@Controller('studio')
@UseGuards(RolesGuard)
export class StudioController {
  constructor(private readonly ai: AiClientService) {}

  @Get('bootstrap')
  @ApiOperation({ summary: 'Kho footage, template, kịch bản mẫu, cấu hình mặc định' })
  bootstrap() {
    return this.ai.request('get', '/bootstrap');
  }

  @Post('jobs')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  createJob(@Body() body: unknown) {
    return this.ai.request('post', '/jobs', { data: body });
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') jobId: string) {
    return this.ai.request('get', `/jobs/${encodeURIComponent(jobId)}`);
  }

  @Post('jobs/:jobId/select')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  select(@Param('jobId') jobId: string, @Body() body: unknown) {
    return this.ai.request('post', `/jobs/${encodeURIComponent(jobId)}/select`, { data: body });
  }

  @Post('jobs/:jobId/parts/:partId/emotion')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  emotion(@Param('jobId') jobId: string, @Param('partId') partId: string, @Body() body: unknown) {
    const path = `/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(partId)}/emotion`;
    return this.ai.request('post', path, { data: body });
  }

  @Patch('jobs/:jobId/settings')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  settings(@Param('jobId') jobId: string, @Body() body: unknown) {
    return this.ai.request('patch', `/jobs/${encodeURIComponent(jobId)}/settings`, { data: body });
  }

  @Post('jobs/:jobId/undo')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  undo(@Param('jobId') jobId: string) {
    return this.ai.request('post', `/jobs/${encodeURIComponent(jobId)}/undo`);
  }

  @Get('jobs/:jobId/package')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Tải gói bàn giao (zip: MP4 + SRT + timeline.json + VO)' })
  async downloadPackage(@Param('jobId') jobId: string, @Res() res: Response) {
    const stream = await this.ai.request<Readable>('get', `/jobs/${encodeURIComponent(jobId)}/package`, {
      responseType: 'stream',
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="VCB_${jobId}.zip"`);
    stream.pipe(res);
  }

  @Get('ai-models')
  aiModels() {
    return this.ai.request('get', '/ai-models');
  }
}
