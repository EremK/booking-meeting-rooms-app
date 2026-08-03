import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'Некоректний email' })
  email!: string;

  @IsString({ message: "Пароль обов'язковий" })
  password!: string;
}
