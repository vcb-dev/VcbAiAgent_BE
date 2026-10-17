import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiClientService } from '../studio/ai-client.service';
import { NasController } from './nas.controller';
import { NasService } from './nas.service';

@Module({
  imports: [ConfigModule],
  controllers: [NasController],
  providers: [NasService, AiClientService],
})
export class NasModule {}
