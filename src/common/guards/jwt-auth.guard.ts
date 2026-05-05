import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Default guard used to protect any controller that needs an authenticated
 * user. Delegates to the `jwt` strategy registered in AuthModule.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
