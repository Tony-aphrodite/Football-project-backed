import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req     = context.switchToHttp().getRequest<Request>();
    const secret  = req.headers['x-admin-secret'] as string | undefined;
    const envSecret = process.env.ADMIN_SECRET;
    if (!envSecret || secret !== envSecret) throw new ForbiddenException();
    return true;
  }
}
