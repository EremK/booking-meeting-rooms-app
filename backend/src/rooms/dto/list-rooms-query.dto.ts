import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListRoomsQueryDto {
  /** Bonus: room filter by capacity. Only rooms seating at least this many people are returned. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Місткість має бути цілим числом' })
  @Min(1, { message: 'Місткість має бути не менше 1' })
  minCapacity?: number;
}
