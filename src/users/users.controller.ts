import { Body, Controller, Patch, Request, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

class UpdateCepDto {
  @IsString()
  @Length(8, 9)
  cep!: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me/cep')
  updateCep(
    @Body() dto: UpdateCepDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.users.updateSellerCep(req.user.sub, dto.cep);
  }
}
