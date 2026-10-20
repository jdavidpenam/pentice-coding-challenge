// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearIntents } from './lib/payment-intents';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ALICE_MAIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALICE_SAVINGS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BOB_MAIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEMO_NOTICE = 'Demo only — picking a user is not authentication; payments use a simulated provider, no real money moves.';

interface Call {
  method: string;
  path: string;
  user: string | null;
  key: string | null;
  body: unknown;
}
type PaymentStatus = 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

/** Minimal fake of the API: just enough state to watch the UI follow the server's numbers. */
function fakeApi(options: { paymentStatus?: PaymentStatus; transferDelayMs?: number; paymentDelayMs?: number } = {}) {
  let available = 10_000;
  let reserved = 0;
  let readsFail = false;
  let paymentSeq = 0;
  const payments: Record<string, unknown>[] = [];
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
        { id: ALICE_MAIN, userId: ALICE, name: 'Main', currency: 'USD', availableMinor: available, reservedMinor: reserved, createdAt: '' },
        { id: ALICE_SAVINGS, userId: ALICE, name: 'Savings', currency: 'USD', availableMinor: 0, reservedMinor: 0, createdAt: '' },
      ]);
    if (path === '/directory') return json(200, [{ userId: BOB, name: 'Bob', accounts: [{ id: BOB_MAIN, name: 'Main' }] }]);
    if (path === '/transfers' && method === 'GET') return json(200, []);
    if (path === '/payments' && method === 'GET') return json(200, [...payments].reverse());
    if (path.endsWith('/transactions')) return json(200, []);
    if (path === '/transfers' && method === 'POST') {
      if (options.transferDelayMs) await new Promise((r) => setTimeout(r, options.transferDelayMs));
      const amount = (body as { amountMinor: number }).amountMinor;
      if (amount > available) return json(422, { error: { code: 'INSUFFICIENT_FUNDS', message: 'The account does not have enough available funds.' } });
      available -= amount;
      return json(201, { id: 't1', fromAccountId: ALICE_MAIN, toAccountId: BOB_MAIN, amountMinor: amount, createdAt: '2026-10-20T00:00:00.000Z' });
    }
    if (path === '/payments' && method === 'POST') {
      if (options.paymentDelayMs) await new Promise((r) => setTimeout(r, options.paymentDelayMs));
      const known = payments.find((p) => p['key'] === headers.get('idempotency-key'));
      if (known) return json(201, known);
      const { amountMinor, reference } = body as { amountMinor: number; reference: string };
      if (amountMinor > available) return json(422, { error: { code: 'INSUFFICIENT_FUNDS', message: 'The account does not have enough available funds.' } });
      paymentSeq += 1;
      const base = { id: `p${paymentSeq}`, key: headers.get('idempotency-key'), accountId: ALICE_MAIN, amountMinor, reference, createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '' };
      const status = options.paymentStatus ?? 'SUCCEEDED';
      const payment =
        status === 'SUCCEEDED' ? { ...base, status, providerChargeId: 'ch' } : status === 'FAILED' ? { ...base, status, failureReason: 'Card declined.' } : { ...base, status };
      if (status === 'SUCCEEDED') available -= amountMinor;
      if (status === 'UNKNOWN') { available -= amountMinor; reserved += amountMinor; }
      payments.push(payment);
      return json(201, payment);
    }
    const reconcile = /^\/payments\/(p\d+)\/reconcile$/.exec(path);
    if (reconcile && method === 'POST') {
      const index = payments.findIndex((p) => p['id'] === reconcile[1]);
      const current = payments[index];
      if (!current) return json(404, { error: { code: 'NOT_FOUND', message: 'Payment not found.' } });
      if (current['status'] === 'UNKNOWN') {
        reserved -= current['amountMinor'] as number;
        payments[index] = { ...current, status: 'SUCCEEDED', providerChargeId: 'ch' };
      }
      return json(200, payments[index]);
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  return {
    fetchMock,
    calls,
    posts: (path?: string) => calls.filter((c) => c.method === 'POST' && (path === undefined || c.path === path)),
    failReads: (on = true) => { readsFail = on; },
  };
}

let api: ReturnType<typeof fakeApi>;
function install(options?: Parameters<typeof fakeApi>[0]) {
  api = fakeApi(options);
  vi.stubGlobal('fetch', api.fetchMock);
}

async function start() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Hi, Alice' });
  await screen.findByRole('region', { name: 'Balance summary' });
  return user;
}
const main = () => within(screen.getByRole('main'));
const transferForm = () => within(screen.getByRole('form', { name: 'Transfer money' }));
const payForm = () => within(screen.getByRole('form', { name: 'Pay for a room' }));
const nav = () => within(screen.getByRole('navigation', { name: 'Main' }));
async function goTo(user: ReturnType<typeof userEvent.setup>, tab: 'Accounts' | 'Transfer' | 'Pay' | 'Activity') {
  await user.click(nav().getByRole('button', { name: tab }));
}

async function fillPay(user: ReturnType<typeof userEvent.setup>, amount: string, reference = 'Room 204') {
  await goTo(user, 'Pay');
  const m = payForm();
  await user.clear(m.getByLabelText('Booking reference'));
  await user.type(m.getByLabelText('Booking reference'), reference);
  await user.clear(m.getByLabelText('Amount (USD)'));
  await user.type(m.getByLabelText('Amount (USD)'), amount);
}

describe('Calm wallet UI', () => {
  beforeEach(() => { install(); });
  afterEach(() => {
    cleanup();
    clearIntents();
    vi.unstubAllGlobals();
  });

  it('1: shows the demo identity chip and the exact demo notice', async () => {
    const user = await start();
    expect(screen.getByRole('button', { name: "Demo user: Alice. Change who you're acting as." }).textContent).toContain('DEMO USER');
    expect(main().getByText(DEMO_NOTICE)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Demo user: Alice/ }));
    expect(within(screen.getByRole('dialog', { name: 'Who are you acting as?' })).getByText(DEMO_NOTICE)).toBeTruthy();
  });

  it('2: shows available and reserved separately, with the word Reserved and the explainer', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await start();
    await fillPay(user, '20');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    await main().findByText(/held in Reserved/);
    await goTo(user, 'Accounts');
    const summary = within(screen.getByRole('region', { name: 'Balance summary' }));
    expect(await summary.findByText('$80.00')).toBeTruthy(); // available
    expect(summary.getByText('$20.00')).toBeTruthy(); // reserved, never merged into one number
    expect(summary.getByText('$20.00').closest('.balance__reserved')?.textContent).toMatch(/^\s*Reserved \$20\.00$/);
    expect(summary.getByText(/Reserved is held for hotel payments the provider hasn't confirmed/)).toBeTruthy();
    expect(main().getByText('1 payment not confirmed yet')).toBeTruthy();
  });

  it('3: validates amounts with the exact copy after blur, linked by aria-describedby, without calling the API', async () => {
    const user = await start();
    await goTo(user, 'Transfer');
    const input = transferForm().getByLabelText('Amount (USD)');
    await user.type(input, '1.234');
    expect(input.getAttribute('aria-invalid')).toBeNull(); // not on first keystroke
    await user.tab();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(message?.textContent).toContain('Use numbers with up to 2 decimals, like 12.34.');
    await user.clear(input);
    await user.type(input, '0');
    await user.click(transferForm().getByRole('button', { name: 'Review transfer' }));
    expect(message?.textContent).toContain('Enter an amount greater than $0.00.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.posts()).toEqual([]);
  });

  it('transfer: review, then send integer cents, then show the server’s new balance', async () => {
    const user = await start();
    await goTo(user, 'Transfer');
    await user.click(transferForm().getByRole('radio', { name: 'Another person' }));
    await user.type(transferForm().getByLabelText('Amount (USD)'), '0.29');
    await user.click(transferForm().getByRole('button', { name: 'Review transfer' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Review transfer' }));
    expect(dialog.getByText('Bob · Main')).toBeTruthy();
    expect(api.posts()).toEqual([]); // nothing moves before confirming
    await user.click(dialog.getByRole('button', { name: 'Send $0.29' }));

    const done = within(await screen.findByRole('dialog', { name: 'Transfer sent' }));
    expect(done.getByText('Sent $0.29')).toBeTruthy();
    expect(await done.findByText('Main now has $99.71 available')).toBeTruthy();
    expect(api.posts('/transfers')).toEqual([
      { method: 'POST', path: '/transfers', user: ALICE, key: null, body: { fromAccountId: ALICE_MAIN, toAccountId: BOB_MAIN, amountMinor: 29 } },
    ]);
  });

  it('4: the Send button disables and reads “Sending…” in flight; a double click sends once', async () => {
    cleanup();
    install({ transferDelayMs: 60 });
    const user = await start();
    await goTo(user, 'Transfer');
    await user.type(transferForm().getByLabelText('Amount (USD)'), '1');
    await user.click(transferForm().getByRole('button', { name: 'Review transfer' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Review transfer' }));
    await user.dblClick(dialog.getByRole('button', { name: 'Send $1.00' }));
    const sending = dialog.getByRole('button', { name: 'Sending…' });
    expect(sending).toHaveProperty('disabled', true);
    await screen.findByRole('dialog', { name: 'Transfer sent' });
    expect(api.posts('/transfers')).toHaveLength(1);
  });

  it('5: shows the server’s insufficient-funds message in the review sheet', async () => {
    const user = await start();
    await goTo(user, 'Transfer');
    await user.type(transferForm().getByLabelText('Amount (USD)'), '500');
    expect(transferForm().getByText("That's more than Main's $100.00 available.")).toBeTruthy();
    await user.click(transferForm().getByRole('button', { name: 'Review transfer' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Review transfer' }));
    await user.click(dialog.getByRole('button', { name: 'Send $500.00' }));
    const alert = await dialog.findByRole('alert');
    expect(alert.textContent).toContain('Transfer not sent');
    expect(alert.textContent).toContain('The account does not have enough available funds.');
  });

  it('5: shows the insufficient-funds message above the Pay button', async () => {
    const user = await start();
    await fillPay(user, '500');
    await user.click(payForm().getByRole('button', { name: 'Pay $500.00' }));
    expect((await main().findByRole('alert')).textContent).toContain('The account does not have enough available funds.');
  });

  it('6: Paid and Declined use the exact outcome copy', async () => {
    const user = await start();
    await fillPay(user, '20');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    expect(await main().findByText("Paid from Main. It's in your payments as Paid.")).toBeTruthy();

    cleanup();
    install({ paymentStatus: 'FAILED' });
    const user2 = await start();
    await fillPay(user2, '20');
    await user2.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    expect(await main().findByText('The provider declined this payment. $20.00 is back in Available in Main.')).toBeTruthy();
  });

  it('6: an Unconfirmed payment says funds are reserved; paying again with the same details reuses the key and does not charge twice', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await start();
    await fillPay(user, '20');
    const payButton = payForm().getByRole('button', { name: 'Pay $20.00' });
    await user.click(payButton);
    expect(await main().findByText(/The provider didn't reply, so we don't know yet if it charged\. \$20\.00 is held in Reserved — not lost\./)).toBeTruthy();
    expect(main().getAllByText('Unconfirmed').length).toBeGreaterThan(0);

    await user.click(payButton);
    expect(await main().findByText('You already had this payment in progress, so we checked its status instead of charging again.')).toBeTruthy();
    const posts = api.posts('/payments');
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
  });

  it('6: the same-details retry still reuses the key after switching user and back (Pay screen remounted)', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await start();
    await fillPay(user, '20');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    await main().findByText(/The provider didn't reply/);

    await user.click(screen.getByRole('button', { name: /Demo user: Alice/ }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Demo users' })).getByRole('radio', { name: /Bob/ }));
    await user.click(await screen.findByRole('button', { name: /Demo user: Bob/ }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Demo users' })).getByRole('radio', { name: /Alice/ }));
    await screen.findByRole('button', { name: /Demo user: Alice/ });
    await screen.findByRole('form', { name: 'Pay for a room' });

    await fillPay(user, '20');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    expect(await main().findByText('You already had this payment in progress, so we checked its status instead of charging again.')).toBeTruthy();
    const posts = api.posts('/payments');
    expect(posts).toHaveLength(2);
    expect(posts[1]?.key).toBe(posts[0]?.key);
  });

  it('after Check status settles an Unconfirmed payment, paying again with the same details is a new payment with a new key', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await start();
    await fillPay(user, '20');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    await main().findByText(/The provider didn't reply/);
    await user.click(main().getByRole('button', { name: 'Check status' }));
    await main().findByText(/^Checked \d\d:\d\d/);

    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    await waitFor(() => { expect(api.posts('/payments')).toHaveLength(2); });
    const keys = api.posts('/payments').map((c) => c.key);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('4: the Pay button disables and reads “Contacting provider…” in flight; a double click pays once', async () => {
    cleanup();
    install({ paymentDelayMs: 60 });
    const user = await start();
    await fillPay(user, '1');
    await user.dblClick(payForm().getByRole('button', { name: 'Pay $1.00' }));
    expect(payForm().getByRole('button', { name: 'Contacting provider…' })).toHaveProperty('disabled', true);
    await main().findByText(/Paid from Main/);
    expect(api.posts('/payments')).toHaveLength(1);
  });

  it('a different payment after a final result gets a new Idempotency-Key', async () => {
    const user = await start();
    await fillPay(user, '1', 'Room 2');
    await user.click(payForm().getByRole('button', { name: 'Pay $1.00' }));
    await main().findByText(/Paid from Main/);
    await fillPay(user, '2', 'Room 3');
    await user.click(payForm().getByRole('button', { name: 'Pay $2.00' }));
    await main().findByText('Room 3');
    const keys = api.posts('/payments').map((c) => c.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('7: a Check status result stays visible after the row re-renders with its new status', async () => {
    cleanup();
    install({ paymentStatus: 'UNKNOWN' });
    const user = await start();
    await fillPay(user, '20', 'Room 9');
    await user.click(payForm().getByRole('button', { name: 'Pay $20.00' }));
    await main().findByText(/held in Reserved/);
    await goTo(user, 'Activity');
    await user.click(main().getByRole('tab', { name: 'Payments' }));
    await user.click(main().getByRole('button', { name: 'Check status of Room 9' }));

    const matches = await main().findAllByText(/the provider confirmed the charge\. \$20\.00 left Reserved as a payment\./);
    const row = matches.map((el) => el.closest('li')).find((li) => li !== null);
    if (!row) throw new Error('row missing');
    expect(await within(row).findByText('Paid')).toBeTruthy(); // status changed…
    expect(within(row).getByText(/^Checked \d\d:\d\d$/)).toBeTruthy(); // …and the result is still shown
    expect(within(row).queryByRole('button', { name: /Check status/ })).toBeNull();
    expect(api.posts('/payments/p1/reconcile')).toHaveLength(1);
  });

  it('8: a failed refresh shows the non-blocking banner with Retry and keeps the last data', async () => {
    const user = await start();
    api.failReads();
    await fillPay(user, '5');
    await user.click(payForm().getByRole('button', { name: 'Pay $5.00' }));
    expect(await screen.findByText('Could not refresh — showing last loaded data.')).toBeTruthy();
    expect(main().getByText(/Paid from Main/)).toBeTruthy();
    await goTo(user, 'Accounts');
    expect(within(screen.getByRole('region', { name: 'Balance summary' })).getByText('$100.00')).toBeTruthy(); // last loaded data kept
    api.failReads(false);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await within(screen.getByRole('region', { name: 'Balance summary' })).findByText('$95.00');
    expect(screen.queryByText('Could not refresh — showing last loaded data.')).toBeNull();
  });

  it('9: statuses show a glyph and a word; account cards read as full sentences', async () => {
    const user = await start();
    expect(main().getByRole('button', { name: 'Main: $100.00 available, nothing reserved. Open history.' })).toBeTruthy();
    await fillPay(user, '3');
    await user.click(payForm().getByRole('button', { name: 'Pay $3.00' }));
    const badge = (await main().findAllByText('Paid'))[0]?.closest('.badge');
    expect(badge?.textContent).toBe('✓Paid');
  });
});
