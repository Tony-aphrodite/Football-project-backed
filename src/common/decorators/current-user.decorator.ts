import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';

/**
 * Pulls the authenticated user payload off the request after JwtAuthGuard has
 * populated it. Usage: `myEndpoint(@CurrentUser() user: JwtPayload)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtPayload;
  },
);
