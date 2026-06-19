import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: { id: string; email: string; role: Role; clientId: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Verify credentials and issue a fresh access+refresh pair. */
  async login(email: string, password: string): Promise<AuthResult> {
    // Auth lookups bypass RLS scoping: the user table is keyed by global email
    // and we have no tenant context yet. We read it as the (RLS-forced) app
    // role, so app_user is intentionally NOT restricted for self-lookup by id —
    // instead we use a direct findUnique which RLS would block, so do it through
    // a privileged path: findUnique on email with RLS bypassed via raw query.
    const user = await this.findUserByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueFor(user);
  }

  /** Rotate: validate refresh token, ensure it matches the stored hash, reissue. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ??
          'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    const user = await this.findUserById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session expired');
    }
    const matches = await argon2
      .verify(user.refreshTokenHash, refreshToken)
      .catch(() => false);
    if (!matches) {
      // Token reuse / rotation mismatch → invalidate the session.
      await this.setRefreshHash(user.id, null);
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    return this.issueFor(user);
  }

  /** Logout: clear the stored refresh hash so old refresh tokens stop working. */
  async logout(userId: string): Promise<void> {
    await this.setRefreshHash(userId, null);
  }

  // ── internals ──

  private async issueFor(user: User): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        clientId: user.clientId,
        role: user.role,
        email: user.email,
        type: 'access',
        // jti makes every access token unique so a login + refresh within the
        // same second don't yield byte-identical tokens (same iat+payload).
        jti: randomUUID(),
      },
      {
        secret:
          this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
        expiresIn: Number(this.config.get('JWT_ACCESS_TTL') ?? 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      // jti makes every refresh token unique, so rotation produces a genuinely
      // new token even when two refreshes land in the same second (otherwise
      // identical {sub,type,iat} payloads would yield byte-identical JWTs and
      // the rotated-out token would still validate).
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ??
          'dev-refresh-secret',
        expiresIn: Number(this.config.get('JWT_REFRESH_TTL') ?? 604800),
      },
    );
    await this.setRefreshHash(user.id, await argon2.hash(refreshToken));
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        clientId: user.clientId,
      },
    };
  }

  /**
   * User lookups for auth happen BEFORE a tenant is established, and app_user is
   * RLS-restricted. We read via a raw query inside a tenant-less transaction;
   * RLS would normally hide the row, so we temporarily scope to the user's own
   * client via a two-step: first find the client_id (which the policy needs).
   *
   * Simplest correct approach: run these reads with RLS satisfied by setting the
   * GUC to the row's own client_id is circular, so instead the auth path uses a
   * dedicated query that selects the row regardless of tenant. Because the app
   * role is FORCE-RLS, that requires a SECURITY DEFINER function OR connecting
   * with a role allowed to read app_user. We use raw SQL via runForTenant with a
   * lookup that first resolves client_id using a SECURITY DEFINER helper.
   *
   * For Phase 2 we read app_user through the migration-time auth_lookup() helper
   * (SECURITY DEFINER) added in the auth RLS migration.
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    const rows = await this.prisma.$queryRawUnsafe<RawUserRow[]>(
      `SELECT * FROM auth_find_user_by_email($1)`,
      email,
    );
    return mapRawUser(rows[0]);
  }

  private async findUserById(id: string): Promise<User | null> {
    const rows = await this.prisma.$queryRawUnsafe<RawUserRow[]>(
      `SELECT * FROM auth_find_user_by_id($1::uuid)`,
      id,
    );
    return mapRawUser(rows[0]);
  }

  private async setRefreshHash(
    userId: string,
    hash: string | null,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `SELECT auth_set_refresh_hash($1::uuid, $2)`,
      userId,
      hash,
    );
  }
}

/** Raw row from the auth SECURITY DEFINER helpers (snake_case columns). */
interface RawUserRow {
  id: string;
  client_id: string;
  email: string;
  password_hash: string;
  role: Role;
  display_name: string | null;
  is_active: boolean;
  refresh_token_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Map a snake_case raw user row to the Prisma camelCase User shape. */
function mapRawUser(r: RawUserRow | undefined): User | null {
  if (!r) return null;
  return {
    id: r.id,
    clientId: r.client_id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    displayName: r.display_name,
    isActive: r.is_active,
    refreshTokenHash: r.refresh_token_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
