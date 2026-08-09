import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Некоректний email' })
  email!: string;

  @IsString({ message: "Пароль обов'язковий" })
  @Length(8, 72, { message: 'Пароль має містити від 8 до 72 символів' })
  password!: string;
}
