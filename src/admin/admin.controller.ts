import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';

import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService, type AdminStats, type CreateCouponDto } from './admin.service';
import type { ReportWithComment } from './entities/report.entity';
import type { UserPublic } from '../users/entities/user.entity';
import type { ListingPublic } from '../listings/entities/listing.entity';
import type { OrderPublic } from '../orders/entities/order.entity';
import { CreateListingDto } from '../listings/dto/create-listing.dto';
import { CreateQuizDto } from '../quiz/dto/create-quiz.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Stats ──────────────────────────────────────────────────────────────────

  @Get('stats')
  getStats(): Promise<AdminStats> {
    return this.admin.getStats();
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  listUsers(): Promise<UserPublic[]> {
    return this.admin.listUsers();
  }

  @Patch('users/:userId/suspend')
  @HttpCode(204)
  suspendUser(@Param('userId') userId: string): Promise<void> {
    return this.admin.suspendUser(userId);
  }

  @Patch('users/:userId/restore')
  @HttpCode(204)
  restoreUser(@Param('userId') userId: string): Promise<void> {
    return this.admin.restoreUser(userId);
  }

  // ── Listings ───────────────────────────────────────────────────────────────

  @Get('listings')
  listListings(): Promise<ListingPublic[]> {
    return this.admin.listAllListings();
  }

  @Patch('listings/:listingId/remove')
  @HttpCode(204)
  removeListing(@Param('listingId') listingId: string): Promise<void> {
    return this.admin.forceRemoveListing(listingId);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  @Get('orders')
  listOrders(): Promise<OrderPublic[]> {
    return this.admin.listAllOrders();
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  @Get('reports')
  listReports(): Promise<ReportWithComment[]> {
    return this.admin.listPendingReports();
  }

  @Patch('reports/:reportId/resolve')
  @HttpCode(204)
  resolve(@Param('reportId') reportId: string): Promise<void> {
    return this.admin.resolveReport(reportId);
  }

  @Patch('reports/:reportId/dismiss')
  @HttpCode(204)
  dismiss(@Param('reportId') reportId: string): Promise<void> {
    return this.admin.dismissReport(reportId);
  }

  // ── Coupons ────────────────────────────────────────────────────────────────

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.admin.createCoupon(dto);
  }

  @Get('coupons')
  listCoupons() {
    return this.admin.listCoupons();
  }

  @Patch('coupons/:code/toggle')
  @HttpCode(204)
  toggleCoupon(@Param('code') code: string) {
    return this.admin.toggleCoupon(code);
  }

  // ── MPC ────────────────────────────────────────────────────────────────────

  @Post('mpc')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  createMpc(@Body() dto: CreateListingDto) {
    return this.admin.createMpcListing(dto);
  }

  @Get('mpc')
  listMpc() {
    return this.admin.listMpcListings();
  }

  // ── Quiz ───────────────────────────────────────────────────────────────────

  @Post('quiz')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  createQuiz(@Body() dto: CreateQuizDto) {
    return this.admin.createQuiz(dto);
  }

  @Get('quiz')
  listQuizzes() {
    return this.admin.listQuizzes();
  }

  @Patch('quiz/:quizId/close')
  @HttpCode(204)
  closeQuiz(@Param('quizId') quizId: string) {
    return this.admin.closeQuiz(quizId);
  }

  @Get('quiz/:quizId/results')
  getQuizResults(@Param('quizId') quizId: string) {
    return this.admin.getQuizResults(quizId);
  }
}
