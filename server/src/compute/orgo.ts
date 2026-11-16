import { ComputeError, type Computer, type ComputeProvider, type Screen } from './types.js';

export interface OrgoConfig {
  apiKey: string;
  /** REST base, default https://www.orgo.ai/api. Point it at any Orgo-compatible API. */
  baseUrl?: string;
  /** Desktop websocket base, default derived from baseUrl (https://host/api -> wss://host). */
  wsBaseUrl?: string;
  ramGb: number;
  cpu: number;
  resolution: string;
  fetch?: typeof fetch;
}

export const ORGO_DEFAULT_BASE = 'https://www.orgo.ai/api';

export function orgoWsBase(baseUrl: string): string {
  const u = new URL(baseUrl);
  return `${u.protocol === 'http:' ? 'ws' : 'wss'}://${u.host}`;
}

/** Hosted Orgo (orgo.ai), or any server that speaks the same API. */
export function createOrgoProvider(cfg: OrgoConfig): ComputeProvider {
  const base = (cfg.baseUrl || ORGO_DEFAULT_BASE).replace(/\/+$/, '');
  const wsBase = (cfg.wsBaseUrl || orgoWsBase(base)).replace(/\/+$/, '');
  const doFetch = cfg.fetch ?? fetch;

  async function call<T = any>(method: string, path: string, body?: unknown, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
    try {
      const res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: any = undefined;
      try { json = text ? JSON.parse(text) : undefined; } catch { json = { raw: text }; }
      if (!res.ok) {
        const err = json?.error;
        const msg = typeof err === 'string' ? err : err?.message ?? `${res.status} ${res.statusText}`;
        throw new ComputeError(res.status, json?.code ?? err?.code, `Orgo ${method} ${path}: ${msg}`, json);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  const extra = (screen?: string) => !!screen && screen !== 'default';
  const q = (screen?: string) => (extra(screen) ? `?screen=${encodeURIComponent(screen!)}` : '');

  return {
    name: 'orgo',
    capabilities: { maxScreens: 4, suspend: true, fileExport: true },

    workspaces: async () => {
      const ws = await call<any>('GET', '/workspaces');
      return Array.isArray(ws) ? ws : ws?.workspaces ?? ws?.projects ?? [];
    },

    createComputer: async ({ name, idempotencyKey, workspaceId }) => {
      if (!workspaceId) throw new Error('No Orgo workspace available for this key');
      return call<Computer>(
        'POST',
        '/computers',
        { workspace_id: workspaceId, name, os: 'linux', ram: cfg.ramGb, cpu: cfg.cpu, resolution: cfg.resolution },
        { timeoutMs: 300_000, headers: { 'Idempotency-Key': idempotencyKey } },
      );
    },
    getComputer: (id) => call<Computer>('GET', `/computers/${id}`),
    start: (id) => call('POST', `/computers/${id}/start`, {}, { timeoutMs: 320_000 }),
    resume: (id) => call('POST', `/computers/${id}/resume`, {}, { timeoutMs: 200_000 }),
    suspend: (id) => call('POST', `/computers/${id}/suspend`, {}),
    vncUpstream: async (id, screen) => {
      const { password } = await call<{ password: string; desktop_api_token: string }>('GET', `/computers/${id}/vnc-password`);
      return {
        url: `${wsBase}/desktops/${id}/ws/websockify?token=${encodeURIComponent(password)}${extra(screen) ? `&screen=${encodeURIComponent(screen!)}` : ''}`,
        password,
        protocols: ['binary'],
      };
    },

    listScreens: (id) => call<{ screens: Screen[] } | Screen[]>('GET', `/computers/${id}/screens`).then((r) => (Array.isArray(r) ? r : r.screens ?? [])),
    createScreen: (id) => call<Screen>('POST', `/computers/${id}/screens`, {}),
    getScreen: (id, screen) => call<Screen>('GET', `/computers/${id}/screens/${screen}`),
    deleteScreen: (id, screen) => call<void>('DELETE', `/computers/${id}/screens/${screen}`),

    screenshot: (id, screen) => call('GET', `/computers/${id}/screenshot${q(screen)}${extra(screen) ? '&' : '?'}response_format=base64&format=jpeg&quality=75`),
    click: (id, screen, b) => call('POST', `/computers/${id}/click${q(screen)}`, b),
    move: (id, screen, b) => call('POST', `/computers/${id}/mouse-move${q(screen)}`, b),
    drag: (id, screen, b) => call('POST', `/computers/${id}/drag${q(screen)}`, b),
    type: (id, screen, text) => call('POST', `/computers/${id}/type${q(screen)}`, { text }),
    key: (id, screen, key) => call('POST', `/computers/${id}/key${q(screen)}`, { key }),
    scroll: (id, screen, b) => call('POST', `/computers/${id}/scroll${q(screen)}`, b),
    bash: (id, screen, command, timeout = 120) => call('POST', `/computers/${id}/bash${q(screen)}`, { command, timeout }, { timeoutMs: (timeout + 40) * 1000 }),
    exportFile: (id, path) => call('POST', '/files/export', { desktopId: id, path }, { timeoutMs: 180_000 }),
  };
}
