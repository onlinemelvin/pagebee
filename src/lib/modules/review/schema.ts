import { z } from "zod";
import { ReviewCommentKind, ReviewCommentStatus } from "@prisma/client";

/** Element anchor for a pin (computed by the serve.ts annotate bridge). */
export const commentAnchorSchema = z.object({
  pagePath: z.string().max(512).default("/"),
  selector: z.string().max(2000).optional(),
  anchorText: z.string().max(200).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
});

export const createCommentSchema = commentAnchorSchema.extend({
  body: z.string().trim().min(1).max(2000),
  kind: z.nativeEnum(ReviewCommentKind).default(ReviewCommentKind.CHANGE_REQUEST),
  parentId: z.string().cuid().optional(), // a reply in a thread
});

export const updateCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    status: z.nativeEnum(ReviewCommentStatus).optional(),
  })
  .refine((d) => d.body !== undefined || d.status !== undefined, { message: "nothing_to_update" });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
