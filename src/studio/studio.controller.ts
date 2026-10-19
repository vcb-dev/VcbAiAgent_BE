import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { Readable } from 'stream';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AiClientService } from './ai-client.service';

const MAX_VO_UPLOAD = 25 * 1024 * 1024;

/** Phần multer cần dùng. Khai tại chỗ để khỏi thêm @types/multer chỉ cho một route. */
type UploadedAudio = { buffer: Uint8Array<ArrayBuffer>; originalname: string; mimetype: string };

function toForm(file: UploadedAudio): FormData {
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  return form;
}

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

  @Get('voices')
  @ApiOperation({ summary: 'Giọng nhân bản có trên tài khoản MiniMax' })
  voices() {
    return this.ai.request('get', '/voices');
  }

  @Get('music')
  @ApiOperation({ summary: 'Danh sách nhạc nền trên volume AI' })
  music() {
    return this.ai.request('get', '/music');
  }

  @Post('music-uploads')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Tải bài nhạc nền lên volume (mp3/wav/m4a), không lưu database' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VO_UPLOAD } }))
  musicStore(@UploadedFile() file?: UploadedAudio) {
    if (!file) throw new BadRequestException('Thiếu file nhạc');
    return this.ai.request('post', '/music-uploads', { data: toForm(file), timeoutMs: 120_000 });
  }

  @Post('jobs')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  createJob(@Body() body: unknown) {
    // Dựng kèm giọng nhân bản thì phải chờ học giọng và đọc hết kịch bản.
    return this.ai.request('post', '/jobs', { data: body, timeoutMs: 300_000 });
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

  @Post('jobs/:jobId/parts/:partId/craft-step')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Đổi công đoạn chế tác của một khối rồi bốc source mới' })
  craftStep(@Param('jobId') jobId: string, @Param('partId') partId: string, @Body() body: unknown) {
    const path = `/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(partId)}/craft-step`;
    return this.ai.request('post', path, { data: body });
  }

  @Post('jobs/:jobId/craft-plan')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Đổi cả dãy công đoạn chế tác theo footage A4' })
  craftPlan(@Param('jobId') jobId: string, @Body() body: unknown) {
    return this.ai.request('post', `/jobs/${encodeURIComponent(jobId)}/craft-plan`, { data: body });
  }

  @Post('voice-uploads')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Cất bản thu lên máy chủ trước khi dựng, để nghe lại' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VO_UPLOAD } }))
  voiceStore(@UploadedFile() file?: UploadedAudio) {
    if (!file) throw new BadRequestException('Thiếu file âm thanh');
    return this.ai.request('post', '/voice-uploads', { data: toForm(file), timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-upload/apply')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  jobVoiceApply(@Param('jobId') jobId: string, @Body() body: unknown) {
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-upload/apply`;
    return this.ai.request('post', path, { data: body, timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-upload')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Tải bản thu cả kịch bản, dùng làm lời đọc cho toàn video' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VO_UPLOAD } }))
  jobVoiceUpload(@Param('jobId') jobId: string, @UploadedFile() file?: UploadedAudio) {
    if (!file) throw new BadRequestException('Thiếu file âm thanh');
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-upload`;
    return this.ai.request('post', path, { data: toForm(file), timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-clone/apply')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Học giọng trong bản thu đã cất, rồi đọc lại cả kịch bản' })
  jobVoiceCloneApply(@Param('jobId') jobId: string, @Body() body: unknown) {
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-clone/apply`;
    return this.ai.request('post', path, { data: body, timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-clone')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Tải mẫu giọng lên và cho giọng đó đọc kịch bản' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VO_UPLOAD } }))
  jobVoiceClone(@Param('jobId') jobId: string, @UploadedFile() file?: UploadedAudio) {
    if (!file) throw new BadRequestException('Thiếu file âm thanh');
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-clone`;
    return this.ai.request('post', path, { data: toForm(file), timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-clone/clear')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  jobVoiceCloneClear(@Param('jobId') jobId: string) {
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-clone/clear`;
    return this.ai.request('post', path, { timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/voice-upload/clear')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  jobVoiceUploadClear(@Param('jobId') jobId: string) {
    const path = `/jobs/${encodeURIComponent(jobId)}/voice-upload/clear`;
    return this.ai.request('post', path, { timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/parts/:partId/voice-upload')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Tải file ghi âm lên làm lời đọc của một phần' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VO_UPLOAD } }))
  voiceUpload(
    @Param('jobId') jobId: string,
    @Param('partId') partId: string,
    @UploadedFile() file?: UploadedAudio,
  ) {
    if (!file) throw new BadRequestException('Thiếu file âm thanh');
    const path = `/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(partId)}/voice-upload`;
    // Chuyển mã rồi dựng lại video nên lâu hơn các lời gọi khác.
    return this.ai.request('post', path, { data: toForm(file), timeoutMs: 300_000 });
  }

  @Post('jobs/:jobId/parts/:partId/voice-upload/clear')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  voiceUploadClear(@Param('jobId') jobId: string, @Param('partId') partId: string) {
    const path = `/jobs/${encodeURIComponent(jobId)}/parts/${encodeURIComponent(partId)}/voice-upload/clear`;
    return this.ai.request('post', path, { timeoutMs: 300_000 });
  }

  @Patch('jobs/:jobId/settings')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  settings(@Param('jobId') jobId: string, @Body() body: unknown) {
    return this.ai.request('patch', `/jobs/${encodeURIComponent(jobId)}/settings`, { data: body });
  }

  @Patch('clips/:clipId')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  @ApiOperation({ summary: 'Gắn công đoạn chế tác cho một clip đã kéo về' })
  labelClip(@Param('clipId') clipId: string, @Body() body: unknown) {
    return this.ai.request('patch', `/clips/${encodeURIComponent(clipId)}`, { data: body });
  }

  @Post('jobs/:jobId/undo')
  @Roles(UserRole.admin, UserRole.manager, UserRole.editor)
  undo(@Param('jobId') jobId: string) {
    return this.ai.request('post', `/jobs/${encodeURIComponent(jobId)}/undo`);
  }

  @Get('jobs/:jobId/export')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Tải MP4 đã mix nhạc/âm lượng hiện tại (không dựng lại hình)' })
  async downloadExport(@Param('jobId') jobId: string, @Res() res: Response) {
    const stream = await this.ai.request<Readable>('get', `/jobs/${encodeURIComponent(jobId)}/export`, {
      responseType: 'stream',
      timeoutMs: 120_000,
    });
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="VCB_${jobId}.mp4"`);
    stream.pipe(res);
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
