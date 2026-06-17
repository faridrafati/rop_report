import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

/** CLS key holding the verified tenant id for the current request. */
export const CLS_CLIENT_ID = 'clientId';

/**
 * Injectable PrismaClient with per-request RLS tenant scoping.
 *
 * The app connects as the RLS-restricted role (drilliq_app — non-owner, no
 * BYPASSRLS). For row-level security to scope reads/writes, every request must
 * run its queries inside a transaction that first issues
 *   SET LOCAL app.current_client_id = '<tenant uuid>'
 * The `tenant()` accessor returns a transactional client bound to the verified
 * JWT client_id (taken from CLS, never from the request body). Code that must
 * be RLS-scoped should use `prisma.tenant()` instead of the raw client.
 *
 * `runForTenant` is the low-level primitive used by the RLS interceptor and the
 * auth/e2e tests.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run `fn` inside a transaction with app.current_client_id set via SET LOCAL,
   * so Postgres RLS scopes every query to `clientId`. SET LOCAL is
   * transaction-scoped and therefore connection-pool safe.
   *
   * `clientId` must be a validated UUID (it is interpolated into SET LOCAL,
   * which does not accept bind parameters). Callers pass only JWT-derived ids.
   */
  async runForTenant<T>(
    clientId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!UUID_RE.test(clientId)) {
      throw new Error('runForTenant: clientId must be a UUID');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_client_id = '${clientId}'`,
      );
      return fn(tx);
    });
  }

  /**
   * A transactional, RLS-scoped client bound to the current request's tenant
   * (from CLS). Throws if no tenant is in scope — fail closed.
   *
   * Usage in a service: `return this.prisma.tenant((db) => db.well.findMany())`.
   */
  tenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const clientId = this.cls.get<string>(CLS_CLIENT_ID);
    if (!clientId) {
      throw new Error(
        'No tenant in scope — request is not authenticated / RLS context missing',
      );
    }
    return this.runForTenant(clientId, fn);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
