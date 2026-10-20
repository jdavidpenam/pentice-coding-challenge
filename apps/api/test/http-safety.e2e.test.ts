import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createTestApp, expectSafeError, HEADER, type TestApp } from './helpers.js';

describe('HTTP safety', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.app.close();
  });

  it('malformed JSON gets a safe 400', async () => {
    const res = await t.http().post('/api/users').set('content-type', 'application/json').send('{"name": ');
    expectSafeError(res, 400, 'BAD_REQUEST');
  });

  it('oversized bodies are rejected with 413', async () => {
    const res = await t.http().post('/api/users').send({ name: 'x'.repeat(20_000) });
    expectSafeError(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('non-JSON bodies fail validation instead of being parsed', async () => {
    const res = await t.http().post('/api/users').set('content-type', 'text/plain').send('name=Eve');
    expectSafeError(res, 400, 'VALIDATION_FAILED');
    expect(t.store.users.size).toBe(0);
  });

  it('JSON arrays and prototype keys are rejected', async () => {
    expectSafeError(await t.http().post('/api/users').send([{ name: 'Eve' }]), 400, 'VALIDATION_FAILED');
    const res = await t.http().post('/api/users').set('content-type', 'application/json').send('{"name":"Eve","__proto__":{"admin":true}}');
    expect(res.status).toBe(400);
  });

  it('unknown routes return a safe 404', async () => {
    expectSafeError(await t.http().get('/api/nope'), 404, 'NOT_FOUND');
  });

  it('sets basic security headers and hides the framework', async () => {
    const alice = await t.createUser('Alice');
    const res = await t.http().get('/api/accounts').set(HEADER, alice.id).expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('dev tools are off by default and can never be enabled in production', () => {
    expect(loadConfig({}).devTools).toBe(false);
    expect(loadConfig({ DEV_TOOLS: 'true', NODE_ENV: 'production' }).devTools).toBe(false);
    expect(loadConfig({ DEV_TOOLS: 'true' }).devTools).toBe(true);
  });
});
