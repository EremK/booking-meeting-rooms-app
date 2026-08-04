import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookingsService, type CreatedBooking } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('rooms/:roomId/bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(
    @Param('roomId') roomId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<CreatedBooking> {
    return this.bookingsService.createBooking(roomId, userId, dto);
  }
}
