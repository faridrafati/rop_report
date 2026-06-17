import {
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Injectable wrapper around PrismaClient.
 *
 * Connects on module init and disconnects on shutdown so Nest owns the pool
 * lifecycle.
 *
 * TODO (Phase 1/2 — RLS): the app role (drilliq_app) is RLS-restricted, so each
 * request must run inside a transaction that first issues
 *   SET LOCAL app.current_client_id = '<tenant uuid>'
 * before any query, so Postgres row-level security scopes reads/writes to the
 * caller's tenant. Add a `withClient(clientId, fn)` helper here that opens a
 * `$transaction`, sets the GUC via `$executeRawUnsafe`, and runs `fn(tx)`.
 * For now this is a plain client (seeds/dev connect as an RLS-bypassing role).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
