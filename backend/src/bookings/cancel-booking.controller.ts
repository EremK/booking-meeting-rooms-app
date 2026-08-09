import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingsService, type CreatedBooking } from './bookings.service';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class CancelBookingController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post(':bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUserId() userId: string,
  ): Promise<CreatedBooking> {
    return this.bookingsService.cancelBooking(bookingId, userId);
  }
}
