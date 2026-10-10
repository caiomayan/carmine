import { Module } from '@nestjs/common';
import { EquippedController } from './equipped.controller.js';

@Module({ controllers: [EquippedController] })
export class EquippedModule {}
