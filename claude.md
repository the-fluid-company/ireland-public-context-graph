# Claude Instructions

This repository builds a public-data contextual intelligence layer for Ireland.

## Product boundary

The system provides data, metadata, provenance, relationships, and factual derived datasets. It must not produce conclusions, causation, legal opinions, engineering assessments, fault claims, official designations, or recommendations.

External tools such as Claude, Codex, Hermes, public agencies, researchers, and users may reason over the exposed data, but any interpretation belongs to those external users/tools, not this project.

## Preferred framing

Use terms such as:
- public data context layer
- context graph
- source provenance
- linked entities
- factual relationships
- data coverage
- derived dataset
- correlation
- evidence record

Avoid product-owned claims such as:
- faulty design
- cause of accident
- unsafe road
- official blackspot
- blame
- recommendation
- probable cause

## Architecture preference

Keep the project simple, hosted, open-source friendly, and phone-friendly:
- Cloudflare-first hosted stack
- hosted remote MCP, not local-only MCP
- no user installs for basic use
- no persistent conversations
- no project-paid LLM tokens
- no unnecessary backend complexity

## Data principles

- Preserve raw source snapshots when possible.
- Normalize into open formats.
- Track source URLs, licences, retrieval time, checksums, and schema versions.
- Model entities and relationships separately from raw data.
- Keep derived transformations factual and reproducible.
- Make missingness and coverage visible.
