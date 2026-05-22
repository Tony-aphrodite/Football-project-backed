import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from './users.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

class UpdateCepDto {
  @IsString() @Length(8, 9) cep!: string;
  @IsOptional() @IsString() rua?:    string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
}

class SetRecipientDto {
  @IsString() recipientId!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('me/cep')
  updateCep(@Body() dto: UpdateCepDto, @Request() req: { user: JwtPayload }) {
    return this.users.updateSellerCep(req.user.sub, dto.cep, dto.rua, dto.numero, dto.cidade, dto.estado);
  }

  // ── Admin: manage Pagar.me recipient IDs ─────────────────────────────────

  @UseGuards(AdminGuard)
  @Get(':userId/recipient')
  getRecipient(@Param('userId') userId: string) {
    return this.users.getRecipientId(userId);
  }

  @UseGuards(AdminGuard)
  @Patch(':userId/recipient')
  setRecipient(@Param('userId') userId: string, @Body() dto: SetRecipientDto) {
    return this.users.setRecipientId(userId, dto.recipientId);
  }
}
