import { IsOptional, Matches } from 'class-validator';

export class GetScheduleQueryDto {
  /** Any date within the target week (Kyiv time), format YYYY-MM-DD. Defaults to the current week. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата має бути у форматі РРРР-ММ-ДД',
  })
  date?: string;
}
