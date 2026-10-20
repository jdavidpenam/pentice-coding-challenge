import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ActingUserResolver, DEMO_USER_HEADER } from '../common/acting-user.js';
import { idSchema } from '../common/ids.js';
import { nameSchema } from '../common/names.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Account, LedgerEntry } from '../store/models.js';
import { AccountsService } from './accounts.service.js';

const openAccountBody = z.strictObject({ name: nameSchema });

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Get()
  list(@Headers(DEMO_USER_HEADER) demoUser: unknown): Account[] {
    return this.accounts.listFor(this.actingUser.resolve(demoUser));
  }

  @Post()
  open(
    @Headers(DEMO_USER_HEADER) demoUser: unknown,
    @Body(new ZodPipe(openAccountBody)) body: z.infer<typeof openAccountBody>,
  ): Account {
    return this.accounts.open(this.actingUser.resolve(demoUser), body.name);
  }

  @Get(':id')
  get(@Headers(DEMO_USER_HEADER) demoUser: unknown, @Param('id', new ZodPipe(idSchema)) id: string): Account {
    return this.accounts.getOwned(this.actingUser.resolve(demoUser), id);
  }

  @Get(':id/transactions')
  transactions(
    @Headers(DEMO_USER_HEADER) demoUser: unknown,
    @Param('id', new ZodPipe(idSchema)) id: string,
  ): LedgerEntry[] {
    return this.accounts.transactionsFor(this.actingUser.resolve(demoUser), id);
  }
}
