import {
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from './roles.decorator';
import { CLS_CLIENT_ID } from '../prisma/prisma.service';
import type { JwtUser } from './jwt.strategy';

/**
 * Authenticates the request via the 'jwt' strategy, then seeds the CLS context
 * with the verified tenant id so PrismaService.tenant() scopes RLS for the
 * whole request. Routes marked @Public() bypass authentication.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      const req = context
        .switchToHttp()
        .getRequest<{ user?: JwtUser }>();
      if (req.user?.clientId) {
        this.cls.set(CLS_CLIENT_ID, req.user.clientId);
      }
    }
    return ok;
  }
}
