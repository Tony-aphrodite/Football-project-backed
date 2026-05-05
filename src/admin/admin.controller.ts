import { Controller, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService, type AdminStats } from './admin.service';
import type { ReportWithComment } from './entities/report.entity';
import type { UserPublic } from '../users/entities/user.entity';
import type { ListingPublic } from '../listings/entities/listing.entity';
import type { OrderPublic } from '../orders/entities/order.entity';

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
}
