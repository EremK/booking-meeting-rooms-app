import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListMyBookingsQueryDto {
  @IsIn(['upcoming', 'past'], {
    message: 'Розділ має бути "upcoming" або "past"',
  })
  section!: 'upcoming' | 'past';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Сторінка має бути цілим числом' })
  @Min(1, { message: 'Сторінка має бути не менше 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Розмір сторінки має бути цілим числом' })
  @Min(1, { message: 'Розмір сторінки має бути не менше 1' })
  pageSize: number = 10;
}
