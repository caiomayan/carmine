import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Catalog } from '../catalog/catalog.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { EquippedController } from './equipped.controller.js';
import { Equipped } from './equipped.js';
import { EquippedCache } from './equipped-cache.js';

/** `equipped/v5` e o cache dele; quem muda o Loadout invalida pelo {@link EquippedCache}. */
@Module({
  controllers: [EquippedController],
  providers: [
    {
      provide: EquippedCache,
      inject: [VALKEY, DATABASE],
      useFactory: (valkey: Redis, db: Database) => new EquippedCache(valkey, db),
    },
    {
      provide: Equipped,
      inject: [DATABASE, Catalog, EquippedCache],
      useFactory: (db: Database, catalog: Catalog, cache: EquippedCache) =>
        new Equipped(db, catalog, cache),
    },
  ],
  exports: [EquippedCache],
})
export class EquippedModule {}
