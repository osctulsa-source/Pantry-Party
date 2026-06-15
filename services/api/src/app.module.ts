/**
 * Root NestJS module.
 *
 * Currently empty — the legacy Express routers are mounted directly on the
 * underlying Express instance in main.ts. This module exists as the anchor
 * for native NestJS feature modules (AccountModule is the first, next PR).
 * As legacy routers are incrementally migrated to NestJS controllers, their
 * modules register here.
 */
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
