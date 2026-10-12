import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Catalog } from '../catalog/catalog.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { EquippedController } from './equipped.controller.js';
import { Equipped } from './equipped.js';
import { EquippedCache } from './equipped-cache.js';
import { InvsimController } from './invsim.controller.js';
import { StatTrakCounter } from './stattrak-counter.js';

/**
 * O que o cs2-css-inventory-simulator lê e grava: `equipped/v5` e o cache dele, e o contador
 * do StatTrak. Quem muda o Loadout invalida pelo {@link EquippedCache}.
 */
@Module({
  imports: [GameServersModule],
  controllers: [EquippedController, InvsimController],
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
    {
      provide: StatTrakCounter,
      inject: [DATABASE, EquippedCache],
      useFactory: (db: Database, cache: EquippedCache) => new StatTrakCounter(db, cache),
    },
  ],
  exports: [EquippedCache],
})
export class EquippedModule {}
