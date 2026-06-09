import { z } from "zod";

export const bookingInputSchema = z.object({
  serviceName: z.string().trim().min(1, "Service is required").max(160),
  startAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date/time" }),
  endAt: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().email("Enter a valid email").max(200).optional(),
  ),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;
