import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_BALANCE_MINOR, MAX_OPERATION_MINOR } from '../src/common/money.js';
import { createTestApp, expectSafeError, HEADER, type TestApp, type TestUser } from './helpers.js';

describe('transfers', () => {
  let t: TestApp;
  let alice: TestUser;
  let bob: TestUser;
  let aliceSavings: string;

  beforeEach(async () => {
    t = await createTestApp();
    alice = await t.createUser('Alice', 10_000);
    bob = await t.createUser('Bob', 2_000);
    aliceSavings = await t.openAccount(alice, 'Savings');
  });
  afterEach(async () => {
    t.expectLedgerConsistent();
    await t.app.close();
  });

  const transfer = (actor: TestUser, body: object) => t.http().post('/api/transfers').set(HEADER, actor.id).send(body);

  it('AC4: moves money between the user’s own accounts and conserves the total', async () => {
    const total = t.totalFunds();
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: aliceSavings, amountMinor: 2_550 }).expect(201);

    expect(t.balance(alice.mainAccountId)).toBe(7_450);
    expect(t.balance(aliceSavings)).toBe(2_550);
    expect(t.totalFunds()).toBe(total);

    const transferId = (res.body as { id: string }).id;
    const entries = t.store.ledger.filter((e) => e.referenceId === transferId);
    expect(entries.map((e) => [e.accountId, e.kind, e.amountMinor])).toEqual([
      [alice.mainAccountId, 'TRANSFER_OUT', -2_550],
      [aliceSavings, 'TRANSFER_IN', 2_550],
    ]);
  });

  it('AC5: moves money to another user’s account without revealing their balance', async () => {
    const total = t.totalFunds();
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId, amountMinor: 1_000 }).expect(201);

    expect(t.balance(alice.mainAccountId)).toBe(9_000);
    expect(t.balance(bob.mainAccountId)).toBe(3_000);
    expect(t.totalFunds()).toBe(total);
    expect(JSON.stringify(res.body)).not.toMatch(/balance/i);

    // Both sides can see the transfer record; a third user cannot.
    const carol = await t.createUser('Carol');
    const seenBy = async (u: TestUser) =>
      ((await t.http().get('/api/transfers').set(HEADER, u.id).expect(200)).body as { id: string }[]).map((x) => x.id);
    const id = (res.body as { id: string }).id;
    expect(await seenBy(alice)).toContain(id);
    expect(await seenBy(bob)).toContain(id);
    expect(await seenBy(carol)).toEqual([]);
  });

  it('allows spending the exact balance', async () => {
    await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId, amountMinor: 10_000 }).expect(201);
    expect(t.balance(alice.mainAccountId)).toBe(0);
  });

  describe('AC6: rejected transfers change nothing', () => {
    it.each([
      ['insufficient funds', () => ({ fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId, amountMinor: 10_001 }), 422, 'INSUFFICIENT_FUNDS'],
      ['same account', () => ({ fromAccountId: alice.mainAccountId, toAccountId: alice.mainAccountId, amountMinor: 100 }), 422, 'SAME_ACCOUNT'],
      ['unknown destination', () => ({ fromAccountId: alice.mainAccountId, toAccountId: randomUUID(), amountMinor: 100 }), 404, 'NOT_FOUND'],
      ['unknown source', () => ({ fromAccountId: randomUUID(), toAccountId: bob.mainAccountId, amountMinor: 100 }), 404, 'NOT_FOUND'],
      ['source owned by someone else (unauthorized debit)', () => ({ fromAccountId: bob.mainAccountId, toAccountId: alice.mainAccountId, amountMinor: 100 }), 404, 'NOT_FOUND'],
    ] as const)('%s', async (_label, body, status, code) => {
      const before = t.snapshot();
      const res = await transfer(alice, body());
      expectSafeError(res, status, code);
      expect(t.snapshot()).toEqual(before);
    });

    it('unauthorized debit gives the same response as a non-existent source', async () => {
      const notOwned = await transfer(alice, { fromAccountId: bob.mainAccountId, toAccountId: alice.mainAccountId, amountMinor: 100 });
      const missing = await transfer(alice, { fromAccountId: randomUUID(), toAccountId: alice.mainAccountId, amountMinor: 100 });
      expect(notOwned.body).toEqual(missing.body);
    });
  });

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['fractional cents', 10.5],
    ['numeric string', '100'],
    ['decimal string', '1.00'],
    ['null', null],
    ['boolean', true],
    ['above the per-operation cap', MAX_OPERATION_MINOR + 1],
    ['unsafe integer', 2 ** 53],
    ['exponent overflow', 1e308],
  ])('AC7: rejects malformed amount (%s) with 400 and no state change', async (_label, amountMinor) => {
    const before = t.snapshot();
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId, amountMinor });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
  });

  it('AC7: rejects a missing amount', async () => {
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
  });

  it.each([
    ['balanceMinor', 1_000_000],
    ['userId', '00000000-0000-4000-8000-000000000000'],
    ['initiatedByUserId', '00000000-0000-4000-8000-000000000000'],
    ['status', 'COMPLETED'],
    ['id', '00000000-0000-4000-8000-000000000000'],
  ])('AC8: rejects server-controlled field %s', async (field, value) => {
    const before = t.snapshot();
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: bob.mainAccountId, amountMinor: 100, [field]: value });
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.snapshot()).toEqual(before);
  });

  it('rejects a credit that would push the destination over the balance limit', async () => {
    const whale = await t.createUser('Whale');
    t.ledger.seed(whale.mainAccountId, MAX_BALANCE_MINOR - 50);
    const before = t.snapshot();
    const res = await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: whale.mainAccountId, amountMinor: 51 });
    expectSafeError(res, 422, 'BALANCE_LIMIT_EXCEEDED');
    expect(t.snapshot()).toEqual(before);
    await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: whale.mainAccountId, amountMinor: 50 }).expect(201);
    expect(t.balance(whale.mainAccountId)).toBe(MAX_BALANCE_MINOR);
  });

  it('many sequential transfers conserve the total and keep every balance equal to its ledger', async () => {
    const total = t.totalFunds();
    for (let i = 0; i < 20; i += 1) {
      await transfer(alice, { fromAccountId: alice.mainAccountId, toAccountId: i % 2 ? bob.mainAccountId : aliceSavings, amountMinor: 123 }).expect(201);
    }
    expect(t.totalFunds()).toBe(total);
    expect(t.balance(alice.mainAccountId)).toBe(10_000 - 20 * 123);
  });
});
