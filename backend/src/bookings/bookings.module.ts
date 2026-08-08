import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CancelBookingSeriesController } from './cancel-booking-series.controller';
import { CancelBookingController } from './cancel-booking.controller';
import { MyBookingsController } from './my-bookings.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    BookingsController,
    CancelBookingController,
    CancelBookingSeriesController,
    MyBookingsController,
  ],
  providers: [BookingsService],
})
export class BookingsModule {}
