/**
 * Root NestJS module.
 *
 * The legacy Express routers (upload, household, recipes search) are mounted
 * directly on the underlying Express instance in main.ts. Native NestJS
 * feature modules register here; AccountModule is the first, RecipesModule
 * (the recipe-by-id step backfill) the second.
 *
 * Sentry: SentryModule.forRoot() registers the tracing interceptor globally;
 * SentryGlobalFilter (extends BaseExceptionFilter, so default error behavior
 * is preserved) captures unhandled exceptions from NestJS routes. The legacy
 * Express routers bypass Nest's filters — they are covered by
 * attachSentryErrorHandler in main.ts. Both no-op when SENTRY_DSN is unset.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AccountModule } from './modules/account/account.module.js';
import { RecipesModule } from './modules/recipes/recipes.module.js';

@Module({
  imports: [SentryModule.forRoot(), AccountModule, RecipesModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
