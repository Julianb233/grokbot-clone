import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrgoProvider, orgoWsBase } from '../src/compute/orgo.js';
import { createProvider, providerNames } from '../src/compute/providers.js';
import { ComputeError } from '../src/compute/types.js';

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

function stub(reply: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: any, init: any = {}) => {
    const c: Call = { url: String(url), method: init.method, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(c);
    const r = reply(c);
    return new Response(r.json === undefined ? '' : JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

const cfg = (f: typeof fetch, extra = {}) => ({ apiKey: 'sk_test', ramGb: 8, cpu: 2, resolution: '1280x800x24', fetch: f, ...extra });

test('registry: orgo is the default provider and unknown names fail clearly', () => {
  assert.deepEqual(providerNames(), ['orgo']);
  assert.equal(createProvider(' Orgo ', { orgo: cfg(fetch) }).name, 'orgo');
  assert.throws(() => createProvider('nope', { orgo: cfg(fetch) }), /Unknown COMPUTE_PROVIDER "nope". Available: orgo/);
});

test('orgo: create sends size, workspace, bearer key and idempotency key', async () => {
  const { f, calls } = stub(() => ({ json: { id: 'c1', status: 'running', name: 'n' } }));
  const p = createOrgoProvider(cfg(f));
  const c = await p.createComputer({ name: 'box', idempotencyKey: 'k1', workspaceId: 'ws1' });
  assert.equal(c.id, 'c1');
  assert.equal(calls[0].url, 'https://www.orgo.ai/api/computers');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer sk_test');
  assert.equal(calls[0].headers['Idempotency-Key'], 'k1');
  assert.deepEqual(calls[0].body, { workspace_id: 'ws1', name: 'box', os: 'linux', ram: 8, cpu: 2, resolution: '1280x800x24' });
  await assert.rejects(p.createComputer({ name: 'box', idempotencyKey: 'k1' }), /No Orgo workspace/);
});

test('orgo: actions address the default screen plainly and extra screens by query', async () => {
  const { f, calls } = stub(() => ({ json: { image: 'x', width: 1, height: 1, success: true, output: '', exit_code: 0 } }));
  const p = createOrgoProvider(cfg(f));
  await p.screenshot('c1');
  await p.screenshot('c1', 'screen-2');
  await p.click('c1', 'default', { x: 1, y: 2 });
  await p.key('c1', 'screen-2', 'ctrl+l');
  await p.bash('c1', undefined, 'echo hi', 30);
  assert.deepEqual(calls.map((c) => c.url.replace('https://www.orgo.ai/api', '')), [
    '/computers/c1/screenshot?response_format=base64&format=jpeg&quality=75',
    '/computers/c1/screenshot?screen=screen-2&response_format=base64&format=jpeg&quality=75',
    '/computers/c1/click',
    '/computers/c1/key?screen=screen-2',
    '/computers/c1/bash',
  ]);
  assert.deepEqual(calls[3].body, { key: 'ctrl+l' });
  assert.deepEqual(calls[4].body, { command: 'echo hi', timeout: 30 });
});

test('orgo: workspaces and screens accept both list and wrapped shapes', async () => {
  const a = createOrgoProvider(cfg(stub(() => ({ json: [{ id: 'w' }] })).f));
  assert.deepEqual(await a.workspaces(), [{ id: 'w' }]);
  const b = createOrgoProvider(cfg(stub((c) => ({ json: c.url.endsWith('/workspaces') ? { projects: [{ id: 'p' }] } : { screens: [{ id: 'default' }] } })).f));
  assert.deepEqual(await b.workspaces(), [{ id: 'p' }]);
  assert.deepEqual(await b.listScreens('c1'), [{ id: 'default' }]);
});

test('orgo: viewer address follows the base URL, and the password is url-encoded', async () => {
  assert.equal(orgoWsBase('https://www.orgo.ai/api'), 'wss://www.orgo.ai');
  assert.equal(orgoWsBase('http://localhost:3000/api'), 'ws://localhost:3000');
  const reply = () => ({ json: { password: 'p w/1', desktop_api_token: 't' } });
  const hosted = await createOrgoProvider(cfg(stub(reply).f)).vncUpstream('c1', 'default');
  assert.equal(hosted.url, 'wss://www.orgo.ai/desktops/c1/ws/websockify?token=p%20w%2F1');
  assert.equal(hosted.password, 'p w/1');
  const { f, calls } = stub(reply);
  const own = await createOrgoProvider(cfg(f, { baseUrl: 'http://localhost:3000/api/' })).vncUpstream('c1', 'screen-3');
  assert.equal(calls[0].url, 'http://localhost:3000/api/computers/c1/vnc-password');
  assert.equal(own.url, 'ws://localhost:3000/desktops/c1/ws/websockify?token=p%20w%2F1&screen=screen-3');
});

test('orgo: failures become ComputeError with status and code', async () => {
  const p = createOrgoProvider(cfg(stub(() => ({ status: 404, json: { error: { message: 'gone', code: 'not_found' } } })).f));
  await assert.rejects(p.getComputer('c1'), (e: any) => e instanceof ComputeError && e.status === 404 && e.code === 'not_found' && /gone/.test(e.message));
});
