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
import { BookingsService, type CancelledSeries } from './bookings.service';

@Controller('bookings/series')
@UseGuards(JwtAuthGuard)
export class CancelBookingSeriesController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post(':seriesId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUserId() userId: string,
  ): Promise<CancelledSeries> {
    return this.bookingsService.cancelSeries(seriesId, userId);
  }
}
