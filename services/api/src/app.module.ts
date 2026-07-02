/**
 * Root NestJS module.
 *
 * The legacy Express routers (upload, household, recipes search) are mounted
 * directly on the underlying Express instance in main.ts. Native NestJS
 * feature modules register here; AccountModule is the first, RecipesModule
 * (the recipe-by-id step backfill) the second.
 */
import { Module } from '@nestjs/common';
import { AccountModule } from './modules/account/account.module.js';
import { RecipesModule } from './modules/recipes/recipes.module.js';

@Module({
  imports: [AccountModule, RecipesModule],
})
export class AppModule {}
