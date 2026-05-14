# Operating model

Ireland Public Context Graph is a data-only contextual intelligence layer.

## Boundary

The project collates, normalizes, versions and links public Irish datasets. It exposes source records, entities, relationships, observations, data coverage and export artifacts. It does not produce causation, fault, legal, engineering, official safety or recommendation conclusions.

## Hosted services

- Cloudflare Pages: public static portal.
- Cloudflare Workers: read-only hosted MCP and REST API.
- Cloudflare R2: raw snapshots and release artifacts.
- Cloudflare D1: future serving index for compact graph metadata.
- Cloudflare KV: future manifest/cache pointers.
- GitHub Actions: scheduled ingestion and release publishing.

## Update flow

1. Scheduled workflow checks public sources and catalogues.
2. Raw source snapshots are archived where permitted.
3. Normalizers produce open artifacts: JSON, CSV, Parquet/GeoParquet, PMTiles and KML/KMZ as relevant.
4. Entity resolution generates graph nodes and edges.
5. Artifacts are versioned and published.
6. MCP/API indexes point to the latest validated release.

## Liability posture

All product-owned outputs are data, metadata or factual transformations. Interpretation is performed by external users/tools.
