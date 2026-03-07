import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1, "Password is required").transform((s) => s.trim()),
});

export type LoginInput = z.infer<typeof loginSchema>;
