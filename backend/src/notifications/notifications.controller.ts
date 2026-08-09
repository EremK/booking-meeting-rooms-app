import {
  Controller,
  Get,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  NotificationsService,
  type NotificationDto,
} from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<NotificationDto[]> {
    return this.notificationsService.getRecentForUser(userId);
  }

  @Sse('stream')
  stream(@CurrentUserId() userId: string): Observable<MessageEvent> {
    return this.notificationsService.streamForUser(userId);
  }
}
