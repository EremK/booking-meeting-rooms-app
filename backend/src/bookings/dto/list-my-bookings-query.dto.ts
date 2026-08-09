import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_PAGE_SIZE = 100;

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
  @Max(MAX_PAGE_SIZE, {
    message: `Розмір сторінки має бути не більше ${MAX_PAGE_SIZE}`,
  })
  pageSize: number = 10;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean({ message: 'includeCancelled має бути true або false' })
  includeCancelled: boolean = false;
}
