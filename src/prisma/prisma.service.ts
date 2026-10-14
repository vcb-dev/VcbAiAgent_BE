import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Đã kết nối Postgres');
        return;
      } catch (e) {
        const message = (e as Error).message;
        if (attempt === 5) {
          this.logger.error(`Không kết nối được Postgres sau 5 lần: ${message}`);
          throw e;
        }
        this.logger.warn(`Kết nối Postgres lỗi (lần ${attempt}/5): ${message}`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
