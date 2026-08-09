import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingsService, type MyBookingsPage } from './bookings.service';
import { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class MyBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('me')
  listMine(
    @CurrentUserId() userId: string,
    @Query() query: ListMyBookingsQueryDto,
  ): Promise<MyBookingsPage> {
    return this.bookingsService.listMyBookings(
      userId,
      query.section,
      query.page,
      query.pageSize,
      query.includeCancelled,
    );
  }
}
