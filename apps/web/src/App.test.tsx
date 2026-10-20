// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ALICE_MAIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB_MAIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface Call {
  method: string;
  path: string;
  user: string | null;
  body: unknown;
}

/** Minimal fake of the API: just enough state to watch the UI follow the server's numbers. */
function fakeApi(options: { paymentStatus?: 'SUCCEEDED' | 'FAILED'; transferDelayMs?: number } = {}) {
  let aliceBalance = 10_000;
  const calls: Call[] = [];
  const json = (status: number, data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status }));

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api/, '');
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, user: headers.get('x-demo-user-id'), body });

    if (path === '/users') return json(200, [{ id: ALICE, name: 'Alice' }, { id: BOB, name: 'Bob' }]);
    if (path === '/accounts')
      return json(200, [{ id: ALICE_MAIN, userId: ALICE, name: 'Main', currency: 'USD', balanceMinor: aliceBalance, createdAt: '' }]);
    if (path === '/directory') return json(200, [{ userId: BOB, name: 'Bob', accounts: [{ id: BOB_MAIN, name: 'Main' }] }]);
    if (path === '/transfers' && method === 'GET') return json(200, []);
    if (path === '/payments' && method === 'GET') return json(200, []);
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
      const base = { id: 'p1', accountId: ALICE_MAIN, amountMinor, reference, createdAt: '', updatedAt: '' };
      if (options.paymentStatus === 'FAILED') return json(201, { ...base, status: 'FAILED', failureReason: 'Declined by the simulated provider.' });
      aliceBalance -= amountMinor;
      return json(201, { ...base, status: 'SUCCEEDED', providerChargeId: 'sim_ch_1' });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  return { fetchMock, calls, posts: () => calls.filter((c) => c.method === 'POST') };
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
      { method: 'POST', path: '/transfers', user: ALICE, body: { fromAccountId: ALICE_MAIN, toAccountId: BOB_MAIN, amountMinor: 29 } },
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
    expect((await form.findByRole('alert')).textContent).toMatch(/Declined.*funds were returned/);
  });
});
