import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_PAGE_SIZE = 100;

export class ListMyBookingsQueryDto {
  @IsIn(['upcoming', 'past', 'cancelled'], {
    message: 'Розділ має бути "upcoming", "past" або "cancelled"',
  })
  section!: 'upcoming' | 'past' | 'cancelled';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Сторінка має бути цілим числом' })
  @Min(1, { message: 'Сторінка має бути не менше 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Розмір сторінки має бути цілим числом' })
  @Min(1, { message: 'Розмір сторінки має бути не менше 1' })
  @Max(MAX_PAGE_SIZE, {
    message: `Розмір сторінки має бути не більше ${MAX_PAGE_SIZE}`,
  })
  pageSize: number = 10;
}
