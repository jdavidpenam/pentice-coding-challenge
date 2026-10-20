import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ActingUserResolver, DEMO_USER_HEADER } from '../common/acting-user.js';
import { idSchema } from '../common/ids.js';
import { amountMinorSchema } from '../common/money.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Payment } from '../store/models.js';
import { PaymentsService } from './payments.service.js';

/** Writable fields only. Status, provider results, and ownership are decided by the server. */
const createPaymentBody = z.strictObject({
  accountId: idSchema,
  amountMinor: amountMinorSchema,
  /** What is being paid for, e.g. a booking reference. Not card or bank data. */
  reference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9 _#-]+$/, 'Use letters, numbers, spaces, and _ # -'),
});

/** Client-chosen key for safe retries (the web app sends a UUID). Scoped per acting user and operation. */
const idempotencyKeyHeader = z
  .string({ error: 'The Idempotency-Key header is required.' })
  .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Idempotency-Key must be 8-100 characters of A-Z, a-z, 0-9, _ or -.');

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Post()
  create(
    @Headers(DEMO_USER_HEADER) demoUser: unknown,
    @Headers('idempotency-key') rawIdempotencyKey: unknown,
    @Body(new ZodPipe(createPaymentBody)) body: z.infer<typeof createPaymentBody>,
  ): Promise<Payment> {
    const idempotencyKey = new ZodPipe(idempotencyKeyHeader).transform(rawIdempotencyKey);
    return this.payments.create(this.actingUser.resolve(demoUser), idempotencyKey, body);
  }

  /** Ask the provider for the real outcome of an UNKNOWN payment. Owner only; safe to repeat. */
  @Post(':id/reconcile')
  @HttpCode(200)
  reconcile(@Headers(DEMO_USER_HEADER) demoUser: unknown, @Param('id', new ZodPipe(idSchema)) id: string): Promise<Payment> {
    return this.payments.reconcile(this.actingUser.resolve(demoUser), id);
  }

  @Get()
  list(@Headers(DEMO_USER_HEADER) demoUser: unknown): Payment[] {
    return this.payments.listFor(this.actingUser.resolve(demoUser));
  }

  @Get(':id')
  get(@Headers(DEMO_USER_HEADER) demoUser: unknown, @Param('id', new ZodPipe(idSchema)) id: string): Payment {
    return this.payments.getOwned(this.actingUser.resolve(demoUser), id);
  }
}
