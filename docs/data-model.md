# Data model

## Core tables/artifacts

- datasets: source metadata, publisher, licence, formats, geography, cadence.
- source_records: source URL, file, row ID, retrieval time, checksum and mapping.
- entities: canonical graph nodes such as country, county, road segment, school, transport stop, dataset, station, public service or statistical area.
- relationships: typed graph edges between entities.
- observations: factual measurements connected to an entity and source.
- coverage: source availability, missingness, staleness and quality notes.

## Claim-safe relationship examples

- dataset belongs_to_domain domain
- bus_route serves bus_stop
- observation measured_at entity
- public_service located_in area
- road_segment intersects flood_extent
- collision occurred_on road_segment

These are factual relationships, not conclusions.
