import { z } from 'zod';

/** Display names for users and accounts. */
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}\p{N} .'-]+$/u, "Use letters, numbers, spaces, and . ' -");
