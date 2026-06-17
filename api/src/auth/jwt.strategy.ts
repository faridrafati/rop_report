import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@prisma/client';

/** Shape of the verified access-token payload, attached to req.user. */
export interface JwtUser {
  userId: string;
  clientId: string;
  role: Role;
  email: string;
}

interface AccessTokenPayload {
  sub: string;
  clientId: string;
  role: Role;
  email: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
    });
  }

  validate(payload: AccessTokenPayload): JwtUser {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Not an access token');
    }
    return {
      userId: payload.sub,
      clientId: payload.clientId,
      role: payload.role,
      email: payload.email,
    };
  }
}
