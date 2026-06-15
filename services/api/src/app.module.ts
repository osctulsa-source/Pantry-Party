/**
 * Root NestJS module.
 *
 * The legacy Express routers (upload, household, recipes) are mounted
 * directly on the underlying Express instance in main.ts. Native NestJS
 * feature modules register here; AccountModule is the first.
 */
import { Module } from '@nestjs/common';
import { AccountModule } from './modules/account/account.module.js';

@Module({
  imports: [AccountModule],
})
export class AppModule {}
