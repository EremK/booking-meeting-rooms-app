import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

export class RegisterDto {
  @IsString({ message: "Ім'я обов'язкове" })
  @Length(1, 100, { message: "Ім'я має містити від 1 до 100 символів" })
  name!: string;

  // Normalized before validation, so a padded/mixed-case address is accepted
  // rather than rejected by @IsEmail.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Некоректний email' })
  email!: string;

  @IsString({ message: "Пароль обов'язковий" })
  @Length(8, 72, { message: 'Пароль має містити від 8 до 72 символів' })
  password!: string;
}
