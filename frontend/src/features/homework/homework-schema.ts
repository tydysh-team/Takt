import { z } from "zod";

export const formSchema = z.object({
  student_id: z.uuid({ error: "Выберите ученика." }),
  title: z.string().trim().min(1, "Укажите название.").max(200, "Не более 200 символов."),
  description: z.string().max(10000, "Не более 10 000 символов."),
  due_at: z.string().min(1, "Укажите срок."),
});

export type FormValues = z.infer<typeof formSchema>;
