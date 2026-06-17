import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { JwtUser } from './jwt.strategy';

/**
 * Enforces @Roles(...) on a route. Runs after JwtAuthGuard, so req.user is set.
 * Routes without @Roles() are allowed for any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: JwtUser }>();
    if (!user) throw new ForbiddenException('No authenticated user');
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role: ${required.join(' | ')}`,
      );
    }
    return true;
  }
}
