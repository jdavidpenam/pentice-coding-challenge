import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_USERS } from '../src/users/users.service.js';
import { createTestApp, expectSafeError, HEADER, type TestApp } from './helpers.js';

describe('users and accounts', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.app.close();
  });

  it('AC1: creating a user returns the user and an empty default account', async () => {
    const res = await t.http().post('/api/users').send({ name: '  Dana ' }).expect(201);
    expect(res.body).toMatchObject({
      user: { id: expect.any(String), name: 'Dana' },
      account: { name: 'Main', currency: 'USD', balanceMinor: 0 },
    });
    expect(Object.keys(res.body.user as object).sort()).toEqual(['id', 'name']);
  });

  it.each([
    ['missing name', {}],
    ['empty name', { name: '   ' }],
    ['too long', { name: 'x'.repeat(51) }],
    ['markup', { name: '<script>' }],
    ['non-string', { name: 42 }],
    ['unexpected field', { name: 'Eve', id: randomUUID() }],
    ['client-set balance', { name: 'Eve', balanceMinor: 1_000_000 }],
  ])('AC1: rejects invalid user input (%s) and creates nothing', async (_label, body) => {
    const before = t.store.users.size;
    const res = await t.http().post('/api/users').send(body);
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.store.users.size).toBe(before);
    expect(t.store.accounts.size).toBe(0);
  });

  it('lists users with id and name only', async () => {
    await t.createUser('Alice', 5_000);
    const res = await t.http().get('/api/users').expect(200);
    expect(res.body).toEqual([{ id: expect.any(String), name: 'Alice' }]);
  });

  it('AC2: a user can open more accounts and lists only their own, with balances', async () => {
    const alice = await t.createUser('Alice', 5_000);
    const bob = await t.createUser('Bob', 7_000);
    const savings = await t.openAccount(alice, 'Savings');

    const res = await t.http().get('/api/accounts').set(HEADER, alice.id).expect(200);
    const accounts = res.body as { id: string; userId: string; balanceMinor: number }[];
    expect(accounts.map((a) => a.id).sort()).toEqual([alice.mainAccountId, savings].sort());
    expect(accounts.every((a) => a.userId === alice.id)).toBe(true);
    expect(accounts.find((a) => a.id === alice.mainAccountId)?.balanceMinor).toBe(5_000);
    expect(accounts.some((a) => a.id === bob.mainAccountId)).toBe(false);
  });

  it('AC2: rejects client-supplied balance or owner when opening an account', async () => {
    const alice = await t.createUser('Alice');
    const bob = await t.createUser('Bob');
    for (const body of [{ name: 'Rich', balanceMinor: 99_999 }, { name: 'Theirs', userId: bob.id }]) {
      const res = await t.http().post('/api/accounts').set(HEADER, alice.id).send(body);
      expectSafeError(res, 400, 'VALIDATION_FAILED');
    }
    expect(t.store.accounts.size).toBe(2);
  });

  it('caps accounts per user', async () => {
    const alice = await t.createUser('Alice');
    for (let i = 1; i < 10; i += 1) await t.openAccount(alice, `Acc ${i}`);
    const res = await t.http().post('/api/accounts').set(HEADER, alice.id).send({ name: 'One more' });
    expectSafeError(res, 422, 'ACCOUNT_LIMIT_REACHED');
  });

  it('AC3: another user’s account, balance and history look exactly like a missing account', async () => {
    const alice = await t.createUser('Alice', 5_000);
    const bob = await t.createUser('Bob', 7_000);

    for (const path of [`/api/accounts/${bob.mainAccountId}`, `/api/accounts/${bob.mainAccountId}/transactions`]) {
      const res = await t.http().get(path).set(HEADER, alice.id);
      expectSafeError(res, 404, 'NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toContain('7000');
    }
    const missing = await t.http().get(`/api/accounts/${randomUUID()}`).set(HEADER, alice.id);
    const forbidden = await t.http().get(`/api/accounts/${bob.mainAccountId}`).set(HEADER, alice.id);
    expect(forbidden.body).toEqual(missing.body);
  });

  it('owner can read account detail and history', async () => {
    const alice = await t.createUser('Alice', 5_000);
    await t.http().get(`/api/accounts/${alice.mainAccountId}`).set(HEADER, alice.id).expect(200);
    const history = await t.http().get(`/api/accounts/${alice.mainAccountId}/transactions`).set(HEADER, alice.id).expect(200);
    expect(history.body).toEqual([expect.objectContaining({ kind: 'SEED', amountMinor: 5_000, balanceAfterMinor: 5_000 })]);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-uuid'],
    ['unknown user', randomUUID()],
  ])('demo identity: %s header is rejected with 401', async (_label, header) => {
    const req = t.http().get('/api/accounts');
    const res = await (header === undefined ? req : req.set(HEADER, header));
    expectSafeError(res, 401, 'DEMO_USER_REQUIRED');
  });

  it('caps the total number of users', async () => {
    for (let i = 0; i < MAX_USERS; i += 1) t.store.users.set(`u${i}`, { id: `u${i}`, name: 'x', createdAt: '' });
    const res = await t.http().post('/api/users').send({ name: 'Late' });
    expectSafeError(res, 422, 'USER_LIMIT_REACHED');
    expect(t.store.users.size).toBe(MAX_USERS);
  });

  // Body validation (pipes) runs before identity resolution, so POSTs send a valid body to reach the identity check.
  it.each([
    ['GET', '/api/accounts', undefined],
    ['POST', '/api/accounts', { name: 'X' }],
    ['GET', `/api/accounts/${randomUUID()}`, undefined],
    ['GET', `/api/accounts/${randomUUID()}/transactions`, undefined],
    ['GET', '/api/directory', undefined],
    ['GET', '/api/transfers', undefined],
    ['POST', '/api/transfers', { fromAccountId: randomUUID(), toAccountId: randomUUID(), amountMinor: 1 }],
    ['GET', '/api/payments', undefined],
    ['POST', '/api/payments', { accountId: randomUUID(), amountMinor: 1, reference: 'R1' }],
    ['GET', `/api/payments/${randomUUID()}`, undefined],
  ] as const)('every acting-user endpoint rejects an unknown demo identity: %s %s', async (method, path, body) => {
    const before = t.snapshot();
    const req = method === 'GET' ? t.http().get(path) : t.http().post(path).send(body);
    const res = await req.set(HEADER, randomUUID());
    expectSafeError(res, 401, 'DEMO_USER_REQUIRED');
    expect(t.snapshot()).toEqual(before);
  });

  it('rejects malformed route IDs', async () => {
    const alice = await t.createUser('Alice');
    const res = await t.http().get('/api/accounts/../../etc').set(HEADER, alice.id);
    expect([400, 404]).toContain(res.status);
    const res2 = await t.http().get('/api/accounts/abc').set(HEADER, alice.id);
    expectSafeError(res2, 400, 'VALIDATION_FAILED');
  });

  it('directory shows other users’ names and account IDs, never balances or self', async () => {
    const alice = await t.createUser('Alice', 5_000);
    const bob = await t.createUser('Bob', 7_000);
    const res = await t.http().get('/api/directory').set(HEADER, alice.id).expect(200);
    expect(res.body).toEqual([{ userId: bob.id, name: 'Bob', accounts: [{ id: bob.mainAccountId, name: 'Main' }] }]);
    expect(JSON.stringify(res.body)).not.toMatch(/balance|7000/i);
  });
});
