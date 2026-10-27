import { z } from "zod";

const stripControlsAndTrim = (value: string) =>
  [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(code < 32 || (code >= 127 && code <= 159));
    })
    .join("")
    .trim();

export const feedbackSubmissionSchema = z
  .object({
    name: z
      .string()
      .transform(stripControlsAndTrim)
      .pipe(z.string().min(2).max(50)),
    email: z.string().transform(stripControlsAndTrim).pipe(z.email().max(254)),
    message: z
      .string()
      .transform(stripControlsAndTrim)
      .pipe(z.string().min(10).max(1000)),
    website: z.string().max(200).optional(),
  })
  .strict();

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
