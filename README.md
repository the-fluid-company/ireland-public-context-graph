# Ireland Public Context Graph

A hosted, open-source contextual intelligence layer for publicly available Irish datasets.

Live site: https://ireland-public-context-graph.pages.dev  
Hosted MCP: https://ireland-public-context-graph-mcp.amreshtech.workers.dev/mcp

## Purpose

The project collates, normalizes, versions, and links public Irish data across domains such as transport, roads, planning, environment, weather, demographics, health, education, public services, infrastructure, economy, housing, energy, and local government. Road safety is one domain inside the broader public context layer.

## Product boundary

This project provides data, metadata, provenance, schemas, factual derived datasets, entities, relationships, observations, downloads, and hosted MCP access.

It does **not** provide conclusions, causation, legal opinions, engineering assessments, official designations, fault claims, safety determinations, or recommendations. Interpretation by users or third-party AI tools is external to this project.

## Current production services

- Cloudflare Pages: public static portal
- Cloudflare Workers: read-only hosted MCP/REST endpoint
- Cloudflare R2: release artifact storage
- Cloudflare D1: compact graph/index schema
- Cloudflare KV: manifest/cache binding
- GitHub Actions: CI and scheduled data-build workflow

## MCP endpoint

Remote MCP URL:

```text
https://ireland-public-context-graph-mcp.amreshtech.workers.dev/mcp
```

The hosted MCP exposes read-only data tools:

- `list_datasets`
- `get_dataset_metadata`
- `search_entities`
- `get_entity`
- `get_relationships`
- `get_context_graph`
- `get_data_coverage`
- `get_export_links`

## Data artifacts

The site publishes static JSON artifacts under `/data/`:

- `manifest.json`
- `context-bundle.json`
- `dataset-catalog.json`
- `entities.json`
- `relationships.json`
- `observations.json`

## Development

```bash
pnpm install
pnpm build:data
pnpm check
pnpm test
pnpm build
```

## Deployment

```bash
pnpm --filter @ipcg/web run deploy
pnpm --filter @ipcg/worker run deploy
```

See `docs/cloudflare-deployment.md` for Cloudflare resource details and smoke tests.

## Licence

MIT.
