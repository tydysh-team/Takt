import { z } from "zod";

import { passwordSchema } from "./registration-schema";

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Введите текущий пароль"),
  new_password: passwordSchema,
  confirm_password: z.string().min(1, "Подтвердите новый пароль"),
}).refine((values) => values.new_password === values.confirm_password, {
  path: ["confirm_password"],
  message: "Пароли не совпадают",
}).refine((values) => values.new_password !== values.current_password, {
  path: ["new_password"],
  message: "Новый пароль должен отличаться от текущего",
});

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
