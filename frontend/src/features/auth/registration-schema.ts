import { z } from "zod";

const passwordSchema = z
  .string()
  .min(10, "Минимум 10 символов")
  .regex(/[a-z]/, "Добавьте строчную латинскую букву")
  .regex(/[A-Z]/, "Добавьте заглавную латинскую букву")
  .regex(/[0-9]/, "Добавьте цифру")
  .regex(/[^A-Za-z0-9]/, "Добавьте специальный символ");

export const registrationSchema = z.object({
  first_name: z.string().trim().min(1, "Введите имя").max(100),
  last_name: z.string().trim().min(1, "Введите фамилию").max(100),
  middle_name: z.string().trim().max(100),
  timezone: z.string().trim().min(1).max(64),
  email: z.email("Введите корректный email").trim(),
  password: passwordSchema,
  role: z.enum(["TEACHER", "STUDENT"]),
});

export type RegistrationFormValues = z.infer<typeof registrationSchema>;
