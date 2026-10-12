import { z } from "zod";

export const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Введите имя").max(100),
  last_name: z.string().trim().min(1, "Введите фамилию").max(100),
  middle_name: z.string().trim().max(100),
  bio: z.string().max(2000, "Не более 2000 символов"),
  timezone: z.string().trim().min(1, "Укажите IANA часовой пояс").max(64),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
