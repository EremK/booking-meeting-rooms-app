import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetScheduleQueryDto } from './dto/get-schedule-query.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import {
  RoomsService,
  type RoomSummary,
  type WeeklySchedule,
} from './rooms.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  listRooms(@Query() query: ListRoomsQueryDto): Promise<RoomSummary[]> {
    return this.roomsService.listRooms(query.minCapacity);
  }

  @Get(':roomId/schedule')
  getSchedule(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query() query: GetScheduleQueryDto,
  ): Promise<WeeklySchedule> {
    return this.roomsService.getWeeklySchedule(roomId, query.date);
  }
}
