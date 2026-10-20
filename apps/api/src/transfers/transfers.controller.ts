import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { z } from 'zod';
import { ActingUserResolver, DEMO_USER_HEADER } from '../common/acting-user.js';
import { idSchema } from '../common/ids.js';
import { amountMinorSchema } from '../common/money.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Transfer } from '../store/models.js';
import { TransfersService } from './transfers.service.js';

/** Only these three fields are writable. Owner, balances, status, and IDs are always server-side. */
const createTransferBody = z.strictObject({
  fromAccountId: idSchema,
  toAccountId: idSchema,
  amountMinor: amountMinorSchema,
});

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Post()
  create(
    @Headers(DEMO_USER_HEADER) demoUser: unknown,
    @Body(new ZodPipe(createTransferBody)) body: z.infer<typeof createTransferBody>,
  ): Transfer {
    return this.transfers.create(this.actingUser.resolve(demoUser), body);
  }

  @Get()
  list(@Headers(DEMO_USER_HEADER) demoUser: unknown): Transfer[] {
    return this.transfers.listFor(this.actingUser.resolve(demoUser));
  }
}
