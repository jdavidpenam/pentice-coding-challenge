// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ALICE_MAIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB_MAIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ALICE_SAVINGS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface Call {
  method: string;
  path: string;
  user: string | null;
  key: string | null;
  body: unknown;
}

/** Minimal fake of the API: just enough state to watch the UI follow the server's numbers. */
function fakeApi(options: { paymentStatus?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; transferDelayMs?: number } = {}) {
  let aliceBalance = 10_000;
  let readsFail = false;
  let aliceReserved = 0;
  const payments: unknown[] = [];
  const calls: Call[] = [];
  const json = (status: number, data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status }));

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api/, '');
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, user: headers.get('x-demo-user-id'), key: headers.get('idempotency-key'), body });

    if (readsFail && method === 'GET') return json(500, { error: { code: 'INTERNAL', message: 'Something went wrong.' } });
    if (path === '/users') return json(200, [{ id: ALICE, name: 'Alice' }, { id: BOB, name: 'Bob' }]);
    if (path === '/accounts')
      return json(200, [
        { id: ALICE_MAIN, userId: ALICE, name: 'Main', currency: 'USD', availableMinor: aliceBalance, reservedMinor: aliceReserved, createdAt: '' },
        { id: ALICE_SAVINGS, userId: ALICE, name: 'Savings', currency: 'USD', availableMinor: 0, reservedMinor: 0, createdAt: '' },
      ]);
    if (path === '/directory') return json(200, [{ userId: BOB, name: 'Bob', accounts: [{ id: BOB_MAIN, name: 'Main' }] }]);
    if (path === '/transfers' && method === 'GET') return json(200, []);
    if (path === '/payments' && method === 'GET') return json(200, payments);
    if (path.endsWith('/transactions')) return json(200, []);
    if (path === '/transfers' && method === 'POST') {
      if (options.transferDelayMs) await new Promise((r) => setTimeout(r, options.transferDelayMs));
      const amount = (body as { amountMinor: number }).amountMinor;
      if (amount > aliceBalance) return json(422, { error: { code: 'INSUFFICIENT_FUNDS', message: 'The account does not have enough funds.' } });
      aliceBalance -= amount;
      return json(201, { id: 't1', fromAccountId: ALICE_MAIN, toAccountId: BOB_MAIN, amountMinor: amount, createdAt: '' });
    }
    if (path === '/payments' && method === 'POST') {
      const { amountMinor, reference } = body as { amountMinor: number; reference: string };
      const base = { id: 'p1', accountId: ALICE_MAIN, amountMinor, reference, createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '' };
      const known = payments.find((p) => (p as { key: string }).key === headers.get('idempotency-key'));
      if (known) return json(201, known);
      if (options.paymentStatus === 'UNKNOWN') {
        const unknown = { ...base, key: headers.get('idempotency-key'), status: 'UNKNOWN' };
        aliceBalance -= amountMinor;
        aliceReserved += amountMinor;
        payments.push(unknown);
        return json(201, unknown);
      }
      if (options.paymentStatus === 'FAILED') {
        const failed = { ...base, status: 'FAILED', failureReason: 'Declined by the simulated provider.' };
        payments.push(failed);
        return json(201, failed);
      }
      aliceBalance -= amountMinor;
      const succeeded = { ...base, status: 'SUCCEEDED', providerChargeId: 'sim_ch_1' };
      payments.push(succeeded);
      return json(201, succeeded);
    }
    if (path === '/payments/p1/reconcile' && method === 'POST') {
      const index = payments.findIndex((p) => (p as { id: string }).id === 'p1');
      const current = payments[index] as { amountMinor: number; status: string };
      if (current.status === 'UNKNOWN') {
        aliceReserved -= current.amountMinor;
        payments[index] = { ...current, status: 'SUCCEEDED', providerChargeId: 'sim_ch_1' };
      }
      return json(200, payments[index]);
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  return {
    fetchMock,
    calls,
    posts: () => calls.filter((c) => c.method === 'POST'),
    failReads: () => { readsFail = true; },
  };
}

async function selectAlice() {
  const user = userEvent.setup();
  render(<App />);
  await user.selectOptions(await screen.findByLabelText('Acting as'), ALICE);
  await screen.findByRole('heading', { name: 'My accounts' });
  return user;
}

const accountsTable = () => within(screen.getByRole('region', { name: 'My accounts' })).getByRole('table');

describe('App', () => {
  let api: ReturnType<typeof fakeApi>;
  const install = (options?: Parameters<typeof fakeApi>[0]) => {
    api = fakeApi(options);
    vi.stubGlobal('fetch', api.fetchMock);
  };
  beforeEach(() => { install(); });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('states that the user selector is not authentication', () => {
    render(<App />);
    expect(screen.getByRole('note').textContent).toMatch(/not.*authentication/i);
  });

  it('shows the selected user’s balances from the server and sends the demo identity header', async () => {
    await selectAlice();
    expect(within(accountsTable()).getByText('$100.00')).toBeTruthy();
    expect(within(accountsTable()).getByRole('columnheader', { name: 'Reserved' })).toBeTruthy();
    expect(api.calls.filter((c) => c.path === '/accounts').every((c) => c.user === ALICE)).toBe(true);
  });

  it('rejects an invalid amount in the browser without calling the API', async () => {
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), BOB_MAIN);
    await user.type(form.getByLabelText(/Amount/), '1.234');
    await user.click(form.getByRole('button', { name: 'Send money' }));

    expect(form.getByText(/at most 2 decimals/)).toBeTruthy();
    expect(form.getByLabelText(/Amount/).getAttribute('aria-invalid')).toBe('true');
    expect(api.posts()).toEqual([]);
  });

  it('sends integer cents, then shows the balance the server reports', async () => {
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), BOB_MAIN);
    await user.type(form.getByLabelText(/Amount/), '0.29');
    await user.click(form.getByRole('button', { name: 'Send money' }));

    expect(await form.findByRole('status')).toHaveProperty('textContent', 'Sent $0.29.');
    expect(api.posts()).toEqual([
      { method: 'POST', path: '/transfers', user: ALICE, key: null, body: { fromAccountId: ALICE_MAIN, toAccountId: BOB_MAIN, amountMinor: 29 } },
    ]);
    expect(await within(accountsTable()).findByText('$99.71')).toBeTruthy();
  });

  it('shows server errors such as insufficient funds', async () => {
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), BOB_MAIN);
    await user.type(form.getByLabelText(/Amount/), '500');
    await user.click(form.getByRole('button', { name: 'Send money' }));
    expect((await form.findByRole('alert')).textContent).toBe('The account does not have enough funds.');
  });

  it('blocks a repeated click while a transfer is in flight (UI guard only)', async () => {
    cleanup();
    install({ transferDelayMs: 50 });
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), BOB_MAIN);
    await user.type(form.getByLabelText(/Amount/), '1');
    const button = form.getByRole('button', { name: 'Send money' });
    await user.dblClick(button);
    await form.findByRole('status');
    expect(api.posts()).toHaveLength(1);
  });

  it('reports a declined payment as an error, not as paid', async () => {
    cleanup();
    install({ paymentStatus: 'FAILED' });
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Pay for a room' }));
    await user.selectOptions(form.getByLabelText('Pay from'), ALICE_MAIN);
    await user.type(form.getByLabelText(/Amount/), '20');
    await user.type(form.getByLabelText('Booking reference'), 'Room 9');
    await user.click(form.getByRole('button', { name: 'Pay' }));
    expect((await form.findByRole('alert')).textContent).toMatch(/declined.*funds were returned/i);
    const payments = within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('table').at(-1);
    if (!payments) throw new Error('payments table missing');
    const row = await within(payments).findByRole('row', { name: /Room 9/ });
    expect(row.textContent).toContain('Declined');
    expect(row.textContent).not.toContain('Paid');
  });

  it('moves money between the user’s own accounts and clears a To that matches the new From', async () => {
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), ALICE_SAVINGS);
    await user.selectOptions(form.getByLabelText('From'), ALICE_SAVINGS);
    // The stale "To" must not survive: submitting now may not send Savings -> Savings.
    await user.type(form.getByLabelText(/Amount/), '1');
    await user.click(form.getByRole('button', { name: 'Send money' }));
    expect(api.posts().filter((c) => (c.body as { toAccountId: string }).toAccountId === ALICE_SAVINGS)).toEqual([]);
    await user.clear(form.getByLabelText(/Amount/));

    // Switching back makes Savings a valid option again; a stale value would silently reappear as the recipient.
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    expect(form.getByLabelText<HTMLSelectElement>('To').value).toBe('');
    await user.selectOptions(form.getByLabelText('To'), ALICE_SAVINGS);
    await user.type(form.getByLabelText(/Amount/), '12.5');
    await user.click(form.getByRole('button', { name: 'Send money' }));
    await form.findByRole('status');
    expect(api.posts()).toEqual([
      { method: 'POST', path: '/transfers', user: ALICE, key: null, body: { fromAccountId: ALICE_MAIN, toAccountId: ALICE_SAVINGS, amountMinor: 1250 } },
    ]);
  });

  it('keeps the last good data visible when a refresh fails', async () => {
    const user = await selectAlice();
    api.failReads();
    const form = within(screen.getByRole('region', { name: 'Transfer' }));
    await user.selectOptions(form.getByLabelText('From'), ALICE_MAIN);
    await user.selectOptions(form.getByLabelText('To'), BOB_MAIN);
    await user.type(form.getByLabelText(/Amount/), '1');
    await user.click(form.getByRole('button', { name: 'Send money' }));
    expect((await screen.findByText(/Could not refresh/)).textContent).toMatch(/Showing the last loaded data/);
    expect(screen.getByRole('region', { name: 'My accounts' })).toBeTruthy();
  });

  it('shows an unconfirmed payment as unresolved with funds reserved, and a retry reuses the same Idempotency-Key', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Pay for a room' }));
    await user.selectOptions(form.getByLabelText('Pay from'), ALICE_MAIN);
    await user.type(form.getByLabelText(/Amount/), '20');
    await user.type(form.getByLabelText('Booking reference'), 'Room 9');
    await user.click(form.getByRole('button', { name: 'Pay' }));

    expect((await form.findByRole('alert')).textContent).toMatch(/Not confirmed yet.*reserved/);
    expect(await within(accountsTable()).findByText('$20.00')).toBeTruthy(); // reserved column
    const row = await within(screen.getByRole('region', { name: 'Activity' })).findByRole('row', { name: /Room 9/ });
    expect(row.textContent).toContain('Unconfirmed');
    expect(row.textContent).not.toContain('Paid');

    await user.click(form.getByRole('button', { name: 'Pay' })); // retry the same payment
    await form.findByRole('alert');
    const payPosts = api.posts().filter((c) => c.path === '/payments');
    expect(payPosts).toHaveLength(2);
    expect(payPosts[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(payPosts[1]?.key).toBe(payPosts[0]?.key);
  });

  it('uses a new Idempotency-Key for a different payment after a definitive result', async () => {
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Pay for a room' }));
    await user.selectOptions(form.getByLabelText('Pay from'), ALICE_MAIN);
    for (const amount of ['1', '1']) {
      await user.type(form.getByLabelText(/Amount/), amount);
      await user.type(form.getByLabelText('Booking reference'), 'Room 2');
      await user.click(form.getByRole('button', { name: 'Pay' }));
      await form.findByRole('status');
    }
    const keys = api.posts().filter((c) => c.path === '/payments').map((c) => c.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('“Check status” reconciles the same payment by ID and shows the resolved outcome', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await selectAlice();
    const form = within(screen.getByRole('region', { name: 'Pay for a room' }));
    await user.selectOptions(form.getByLabelText('Pay from'), ALICE_MAIN);
    await user.type(form.getByLabelText(/Amount/), '20');
    await user.type(form.getByLabelText('Booking reference'), 'Room 9');
    await user.click(form.getByRole('button', { name: 'Pay' }));

    await user.click(await screen.findByRole('button', { name: 'Check status of payment Room 9' }));
    const activity = within(screen.getByRole('region', { name: 'Activity' }));
    expect((await activity.findByRole('status')).textContent).toMatch(/Paid \$20\.00/);
    expect(api.posts().filter((c) => c.path === '/payments/p1/reconcile')).toHaveLength(1);
    const row = await activity.findByRole('row', { name: /Room 9.*Paid/ });
    expect(within(row).queryByRole('button')).toBeNull();
  });
});
