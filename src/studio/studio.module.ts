import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiClientService } from './ai-client.service';
import { StudioController } from './studio.controller';

@Module({
  imports: [ConfigModule],
  controllers: [StudioController],
  providers: [AiClientService],
})
export class StudioModule {}
