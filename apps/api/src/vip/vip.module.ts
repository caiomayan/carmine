import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../database/database.module.js';
import { VipPeriods } from './vip-periods.js';

@Module({
  providers: [
    { provide: VipPeriods, inject: [DATABASE], useFactory: (db: Database) => new VipPeriods(db) },
  ],
  exports: [VipPeriods],
})
export class VipModule {}
