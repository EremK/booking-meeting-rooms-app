import { IsString, Length } from 'class-validator';

export class ConfirmEmailDto {
  @IsString({ message: "Токен підтвердження обов'язковий" })
  @Length(1, 256, { message: 'Некоректний токен підтвердження' })
  token!: string;
}
