import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../src/payments/payment-provider.js';
import { SimulatedPaymentProvider } from '../src/payments/simulated-payment-provider.js';
import { InMemoryStore } from '../src/store/in-memory-store.js';
import type { Account } from '../src/store/models.js';

export const HEADER = 'x-demo-user-id';

export interface TestUser {
  readonly id: string;
  readonly name: string;
  readonly mainAccountId: string;
}

/** Boots the real app (same HTTP config as main.ts) with an empty in-memory store and no seed. */
export async function createTestApp(options: { devTools?: boolean; provider?: PaymentProvider } = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot({ devTools: options.devTools ?? true })] });
  if (options.provider) builder = builder.overrideProvider(PAYMENT_PROVIDER).useValue(options.provider);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();

  const store = app.get(InMemoryStore);
  const ledger = app.get(LedgerService);
  const simulator = app.get(SimulatedPaymentProvider);
  const http = () => request(app.getHttpServer());

  /** Creates a user through the API, then funds the main account through the demo seed path. */
  async function createUser(name: string, fundsMinor = 0): Promise<TestUser> {
    const res = await http().post('/api/users').send({ name }).expect(201);
    const body = res.body as { user: { id: string; name: string }; account: Account };
    if (fundsMinor > 0) ledger.seed(body.account.id, fundsMinor);
    return { id: body.user.id, name: body.user.name, mainAccountId: body.account.id };
  }

  async function openAccount(user: TestUser, name: string, fundsMinor = 0): Promise<string> {
    const res = await http().post('/api/accounts').set(HEADER, user.id).send({ name }).expect(201);
    const account = res.body as Account;
    if (fundsMinor > 0) ledger.seed(account.id, fundsMinor);
    return account.id;
  }

  function balance(accountId: string): number {
    const account = store.accounts.get(accountId);
    if (!account) throw new Error('no such account');
    return account.balanceMinor;
  }

  /** Deep copy of all financial state, to prove a rejected request changed nothing. */
  function snapshot() {
    return structuredClone({
      accounts: [...store.accounts.values()],
      ledger: [...store.ledger],
      transfers: [...store.transfers.values()],
      payments: [...store.payments.values()],
    });
  }

  /** Every balance equals the sum of its ledger entries and is never negative. */
  function expectLedgerConsistent(): void {
    for (const account of store.accounts.values()) {
      const sum = store.ledger.filter((e) => e.accountId === account.id).reduce((acc, e) => acc + e.amountMinor, 0);
      expect(account.balanceMinor).toBe(sum);
      expect(account.balanceMinor).toBeGreaterThanOrEqual(0);
    }
  }

  function totalFunds(): number {
    return [...store.accounts.values()].reduce((acc, a) => acc + a.balanceMinor, 0);
  }

  return { app, http, store, ledger, simulator, createUser, openAccount, balance, snapshot, expectLedgerConsistent, totalFunds };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Asserts the response is a safe error body with the given status/code and nothing internal in it. */
export function expectSafeError(res: request.Response, status: number, code: string): void {
  expect(res.status).toBe(status);
  const body = res.body as { error?: { code?: unknown; message?: unknown } };
  expect(body.error?.code).toBe(code);
  expect(typeof body.error?.message).toBe('string');
  const text = JSON.stringify(res.body);
  expect(text).not.toMatch(/stack|\.ts:|\.js:|node_modules|at [A-Z][A-Za-z]+\./);
  expect(Object.keys(res.body as object)).toEqual(['error']);
}
