import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CancelBookingController } from './cancel-booking.controller';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController, CancelBookingController],
  providers: [BookingsService],
})
export class BookingsModule {}
