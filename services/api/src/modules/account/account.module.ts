/**
 * AccountModule — the first native NestJS feature module.
 *
 * Handles account lifecycle operations. Currently: deletion (DELETE /account).
 * Future: profile updates, data export (GDPR), password change proxy.
 */
import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';

@Module({
  controllers: [AccountController],
})
export class AccountModule {}
