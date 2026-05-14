# Cloudflare deployment

## Prerequisites

- Cloudflare account with Pages/Workers enabled.
- `CLOUDFLARE_API_TOKEN` or Wrangler login.
- Replace placeholder D1/KV IDs in `apps/worker/wrangler.toml` after provisioning resources.

## Build

```bash
pnpm install
pnpm build:data
pnpm check
pnpm test
pnpm build
```

## Deploy Pages

```bash
pnpm --filter @ipcg/web deploy
```

## Deploy Worker

```bash
pnpm --filter @ipcg/worker deploy
```

## Smoke tests

```bash
curl -fsS https://<pages-url>/data/manifest.json
curl -fsS https://<worker-url>/health
curl -fsS -X POST https://<worker-url>/mcp   -H 'content-type: application/json'   --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
