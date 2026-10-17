import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * Client gọi VCB_AI. Render/TTS có thể chạy hàng chục giây nên dùng keep-alive
 * và timeout rộng; mọi lỗi được dịch lại thành HttpException của Nest.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config
      .get<string>('AI_SERVICE_URL', 'http://localhost:8787')
      .replace(/\/$/, '');

    this.http = axios.create({
      baseURL: `${baseURL}/api`,
      timeout: Number(this.config.get<string>('AI_SERVICE_TIMEOUT_MS', '120000')),
      headers: { 'X-Assistant-Secret': this.config.get<string>('ASSISTANT_INTERNAL_SECRET', '') },
      httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 32 }),
      httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 32 }),
    });
  }

  async request<T>(
    method: 'get' | 'post' | 'patch',
    path: string,
    options: { data?: unknown; responseType?: 'json' | 'stream'; timeoutMs?: number } = {},
  ): Promise<T> {
    try {
      const res = await this.http.request<T>({
        method,
        url: path,
        data: options.data,
        responseType: options.responseType ?? 'json',
        // Quét ổ mạng lâu hơn hẳn mọi lời gọi khác nên cho phép nới riêng.
        ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
      });
      return res.data;
    } catch (e) {
      if (!isAxiosError(e)) throw e;

      if (e.response) {
        const detail = (e.response.data as { detail?: string })?.detail;
        throw new HttpException(detail ?? 'AI service trả về lỗi', e.response.status);
      }
      this.logger.error(`Không gọi được AI service (${method.toUpperCase()} ${path}): ${e.message}`);
      throw new ServiceUnavailableException('Dịch vụ AI đang không phản hồi, thử lại sau ít phút');
    }
  }
}
