import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Минимум 8 символов")
  .max(128, "Не более 128 символов");

export const registrationSchema = z.object({
  first_name: z.string().trim().min(1, "Введите имя").max(100),
  last_name: z.string().trim().min(1, "Введите фамилию").max(100),
  middle_name: z.string().trim().max(100),
  email: z.email("Введите корректный email").trim(),
  password: passwordSchema,
  role: z.enum(["TEACHER", "STUDENT"]),
});

export type RegistrationFormValues = z.infer<typeof registrationSchema>;
