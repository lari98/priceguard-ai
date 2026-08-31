import { Module } from '@nestjs/common';
import { FraudGraphController } from './fraud-graph.controller';
import { FraudGraphService } from './fraud-graph.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FraudGraphController],
  providers: [FraudGraphService],
  exports: [FraudGraphService],
})
export class FraudGraphModule {}
