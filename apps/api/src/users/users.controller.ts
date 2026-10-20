import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { z } from 'zod';
import { nameSchema } from '../common/names.js';
import { ActingUserResolver, DEMO_USER_HEADER } from '../common/acting-user.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Account } from '../store/models.js';
import { UsersService, type DirectoryEntry, type PublicUser } from './users.service.js';

const createUserBody = z.strictObject({ name: nameSchema });

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Post('users')
  create(@Body(new ZodPipe(createUserBody)) body: z.infer<typeof createUserBody>): {
    user: PublicUser;
    account: Account;
  } {
    return this.users.create(body.name);
  }

  @Get('users')
  list(): PublicUser[] {
    return this.users.list();
  }

  @Get('directory')
  directory(@Headers(DEMO_USER_HEADER) demoUser: unknown): DirectoryEntry[] {
    return this.users.directory(this.actingUser.resolve(demoUser));
  }
}
