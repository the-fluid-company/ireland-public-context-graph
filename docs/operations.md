# Data refresh and production operation

Ireland Public Context Graph is designed as an automatically refreshed contextual data layer.

## Refresh pipeline

1. Pull catalogue metadata from `data.gov.ie` CKAN API.
2. Infer broad domains from source metadata.
3. Normalize dataset, resource, publisher, source-record, coverage and graph-index artifacts.
4. Validate artifacts through shared Zod schemas.
5. Build the static site and Worker bundle.
6. Publish artifacts to Cloudflare Pages/R2 and serve them through the hosted MCP/API.

## GitHub Actions

- `CI` runs on push/PR and validates data build, typecheck, tests and production build.
- `Refresh data and deploy` runs nightly and can be started manually.

Required repository secrets for automatic deploys:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow still refreshes and commits data artifacts if Cloudflare deploy secrets are absent; deployment steps are skipped.

## Claim boundary

The system must remain a data/context/provenance layer only. It may expose facts, source records, graph relationships, coverage and missingness. It must not produce causation, blame, legal, engineering, safety or policy conclusions.
