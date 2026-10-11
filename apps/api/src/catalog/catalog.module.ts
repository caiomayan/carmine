import { Global, Module } from '@nestjs/common';
import { Catalog } from './catalog.js';

/** O catálogo da cs2-lib, carregado uma vez na subida e compartilhado por todos os módulos. */
@Global()
@Module({
  providers: [{ provide: Catalog, useFactory: () => new Catalog() }],
  exports: [Catalog],
})
export class CatalogModule {}
