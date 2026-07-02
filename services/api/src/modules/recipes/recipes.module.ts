/**
 * RecipesModule — native NestJS. Recipe endpoints on the promoted backend.
 * First member: GET /recipes/:id/instructions (the detail step backfill).
 * (The legacy POST /recipes/search stays on the Express router in
 * routes/recipes.ts for now; it migrates incrementally.)
 */
import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller.js';

@Module({
  controllers: [RecipesController],
})
export class RecipesModule {}
