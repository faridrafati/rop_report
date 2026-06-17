import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUser } from './jwt.strategy';

/** Inject the verified JWT user (req.user) into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    return ctx.switchToHttp().getRequest<{ user: JwtUser }>().user;
  },
);
