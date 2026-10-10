import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';

/** Disponibiliza a configuração já validada para toda a aplicação pelo token `APP_CONFIG`. */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
