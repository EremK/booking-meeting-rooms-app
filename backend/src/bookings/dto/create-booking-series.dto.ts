import { IsInt, IsISO8601, IsString, Length, Max, Min } from 'class-validator';

export class CreateBookingSeriesDto {
  @IsString({ message: "Назва обов'язкова" })
  @Length(1, 100, { message: 'Назва має містити від 1 до 100 символів' })
  title!: string;

  /** Start time of the first occurrence; later occurrences are +7 days each. */
  @IsISO8601({}, { message: 'Некоректний час початку' })
  startAt!: string;

  /** End time of the first occurrence; duration is reused for every occurrence. */
  @IsISO8601({}, { message: 'Некоректний час завершення' })
  endAt!: string;

  @IsInt({ message: 'Кількість повторень має бути цілим числом' })
  @Min(2, { message: 'Серія має містити щонайменше 2 повторення' })
  @Max(52, { message: 'Серія може містити не більше 52 повторень' })
  occurrenceCount!: number;
}
