import { z } from "zod";

export const formSchema = z.object({
  student_id: z.uuid({ error: "Выберите ученика." }),
  title: z.string().trim().min(1, "Укажите название.").max(200, "Не более 200 символов."),
  description: z.string().max(10000, "Не более 10 000 символов."),
  due_at: z.string().min(1, "Укажите срок."),
});

export type FormValues = z.infer<typeof formSchema>;

export const submissionSchema = z.object({
  comment: z.string().max(10000, "Не более 10 000 символов."),
});

export type SubmissionValues = z.infer<typeof submissionSchema>;

export const reviewSchema = z.object({
  grade: z.number().int("Укажите целую оценку.").min(0, "Оценка от 0 до 100.").max(100, "Оценка от 0 до 100."),
  comment: z.string().max(10000, "Не более 10 000 символов."),
});

export type ReviewValues = z.infer<typeof reviewSchema>;

export const revisionSchema = z.object({
  comment: z.string().trim().min(1, "Укажите, что нужно исправить.").max(10000, "Не более 10 000 символов."),
});

export type RevisionValues = z.infer<typeof revisionSchema>;
