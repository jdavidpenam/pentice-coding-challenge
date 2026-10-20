import { z } from 'zod';

/** Every server-generated ID is a UUID; anything else in a route param is rejected before lookup. */
export const idSchema = z.uuid();
