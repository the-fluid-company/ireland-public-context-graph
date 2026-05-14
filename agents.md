# Agent Instructions

Agents working in this repository must treat the product as a data/context layer, not an answer engine.

## Mission

Build an open-source Irish public-data context graph with hosted MCP access. The graph links public datasets across domains including transport, roads, collisions, planning, environment, weather, demographics, public services, education, health, infrastructure, and local authorities.

## Hard rules

- Do not add features that generate official-sounding conclusions.
- Do not claim causation, blame, legal fault, engineering fault, safety status, or official blackspot status.
- Do not add panic-oriented frontend copy.
- Do not require users to install npm, Python, Docker, or local MCP clients for basic access.
- Do not introduce project-paid LLM calls unless explicitly requested.
- Do not create persistent user conversations unless authentication and privacy design are explicitly added later.

## Expected outputs

Prefer building:
- dataset catalogue
- source/provenance registry
- schema registry
- entity and relationship indexes
- factual derived datasets
- geospatial exports
- hosted MCP tools
- data coverage/missingness reports
- reusable analysis skills/prompts clearly marked as external guidance

## Hosted MCP behavior

MCP tools should retrieve and relate data. They should not answer causal or liability questions directly.

Good tools:
- list_datasets
- get_dataset_metadata
- get_entity
- search_entities
- get_relationships
- get_context_graph
- get_source_records
- get_data_coverage
- get_layer_manifest
- get_export_links

Avoid tools:
- determine_cause
- assess_fault
- declare_blackspot
- recommend_intervention
- explain_accident
