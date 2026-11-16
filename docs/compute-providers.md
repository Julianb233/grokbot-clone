# Computer providers

Bot computers come from one service at a time, chosen with `COMPUTE_PROVIDER`. Everything the
app needs from a computer goes through one interface, `ComputeProvider` in
`server/src/compute/types.ts`, so the agent loop, the routes and the viewer do not know which
service is behind it.

| `COMPUTE_PROVIDER` | Service | Status |
|---|---|---|
| `orgo` (default) | Hosted Orgo, or any API that speaks the same routes | Built in |

## Orgo settings

| Variable | Purpose |
|---|---|
| `ORGO_API_KEY` | Required when the provider is `orgo` |
| `ORGO_WORKSPACE_ID` | Workspace that holds every user's computer. Empty means the first one the key can see |
| `ORGO_RAM_GB`, `ORGO_CPU`, `ORGO_RESOLUTION` | Size of new computers |
| `ORGO_BASE_URL` | Optional. An Orgo-compatible API other than `https://www.orgo.ai/api` |
| `ORGO_WS_BASE_URL` | Optional. Its desktop websocket base. Defaults to the same host as `ORGO_BASE_URL` |

## Adding a provider

1. Add `server/src/compute/<name>.ts` that returns a `ComputeProvider`.
2. Add its settings to `ComputeConfig` and one line to the registry in
   `server/src/compute/providers.ts`, then pass the settings in `server/src/compute/index.ts`.
3. Set its `capabilities` honestly. The rest of the app adapts to them:
   - `maxScreens: 1` means the service has no extra screens, so every Bot of a user shares the
     computer's one desktop. Giving each Bot its own computer instead is not built yet.
   - `suspend: false` means idle computers are left running rather than put to sleep.
   - `fileExport: false` means the Library download is unavailable.
4. `vncUpstream()` must return a websockify address that speaks RFB, plus the VNC password. The
   relay in `server/src/vnc.ts` signs in upstream so the password never reaches the browser.
5. Keep the shapes the app already relies on: `key` takes X11 keysyms joined by `+`, `bash`
   returns `{ success, output, exit_code }`, and `screenshot` returns a base64 image with its
   width and height. The Bot's files live in `/root/grokbot` on the computer, and the image needs
   Chrome or Chromium.

Run `npm test` for the provider tests.
