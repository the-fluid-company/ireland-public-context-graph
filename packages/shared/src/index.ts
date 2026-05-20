import { z } from 'zod';
export const DatasetDomain = z.enum(['transport','roads','collisions','planning','environment','weather','demographics','health','education','public-services','infrastructure','economy','local-government','housing','energy','culture']);
export type DatasetDomain = z.infer<typeof DatasetDomain>;
export const Resource = z.object({ id:z.string(), datasetId:z.string(), name:z.string(), format:z.string(), url:z.string().optional(), description:z.string().optional(), lastModified:z.string().optional(), size:z.number().optional(), mimetype:z.string().optional() });
export type Resource = z.infer<typeof Resource>;
export const Dataset = z.object({ id:z.string(), title:z.string(), publisher:z.string(), publisherId:z.string().optional(), domains:z.array(DatasetDomain), sourceUrl:z.string().url(), license:z.string(), updateCadence:z.string(), geography:z.string(), temporalCoverage:z.string(), formats:z.array(z.string()), description:z.string(), resources:z.array(Resource).default([]), metadataModified:z.string().optional(), provenanceNotes:z.array(z.string()).default([]), quality:z.object({ hasResources:z.boolean(), hasOpenLicense:z.boolean(), hasMachineReadableResource:z.boolean(), resourceCount:z.number(), formatCount:z.number() }).optional() });
export type Dataset = z.infer<typeof Dataset>;
export const EntityType = z.enum(['country','catalog','domain','publisher','dataset','resource','format','geography','integration-layer','place','asset','condition','event','factor','issue','agency','service','network']);
export type EntityType = z.infer<typeof EntityType>;
export const Entity = z.object({ id:z.string(), type:EntityType.or(z.string()), name:z.string(), datasetIds:z.array(z.string()), geometry:z.object({ type:z.string(), coordinates:z.unknown() }).optional(), properties:z.record(z.unknown()).default({}) });
export type Entity = z.infer<typeof Entity>;
export const Relationship = z.object({ id:z.string(), subject:z.string(), predicate:z.string(), object:z.string(), datasetIds:z.array(z.string()), confidence:z.enum(['source','derived-high','derived-medium','derived-low']), validFrom:z.string().optional(), validTo:z.string().optional(), evidence:z.string().optional() });
export type Relationship = z.infer<typeof Relationship>;
export const Observation = z.object({ id:z.string(), entityId:z.string(), metric:z.string(), value:z.union([z.string(), z.number(), z.boolean()]), unit:z.string().optional(), timeStart:z.string().optional(), timeEnd:z.string().optional(), datasetId:z.string(), sourceRecordId:z.string().optional() });
export type Observation = z.infer<typeof Observation>;
export const LayerManifest = z.object({ generatedAt:z.string(), layers:z.array(z.object({ id:z.string(), title:z.string(), domain:DatasetDomain.optional(), description:z.string(), entityIds:z.array(z.string()).default([]), datasetIds:z.array(z.string()).default([]), relationshipPredicates:z.array(z.string()).default([]), formats:z.array(z.string()).default([]), geometryStatus:z.enum(['ready','candidate','metadata-only']), caveats:z.array(z.string()).default([]) })) });
export type LayerManifest = z.infer<typeof LayerManifest>;
export const SourceRecord = z.object({ id:z.string(), datasetId:z.string(), publisher:z.string(), sourceUrl:z.string(), license:z.string(), retrievedAt:z.string(), metadataModified:z.string().optional(), resourceCount:z.number(), formats:z.array(z.string()), resourceUrls:z.array(z.string()).default([]), provenanceNotes:z.array(z.string()).default([]) });
export type SourceRecord = z.infer<typeof SourceRecord>;
export const SourceRegistryEntry = z.object({ id:z.string(), name:z.string(), url:z.string().url(), owner:z.string(), sourceType:z.enum(['official','semi-official','public-web','community','news','research','international']), domains:z.array(DatasetDomain), geography:z.string(), accessMethod:z.enum(['ckan','api','rss','arcgis','download','html','sparql','osm','manual-review']), license:z.string(), updateFrequency:z.string(), parserStatus:z.enum(['implemented','planned','monitor-only','blocked']), reliabilityScore:z.number().min(0).max(1), lastChecked:z.string(), lastIngested:z.string().nullable(), caveats:z.array(z.string()).default([]), agentTasks:z.array(z.string()).default([]) });
export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntry>;
export const CoverageReport = z.object({ generatedAt:z.string(), datasetCount:z.number(), publisherCount:z.number(), domainCounts:z.record(z.number()), formatCounts:z.record(z.number()), licenseCounts:z.record(z.number()), quality:z.object({ withResources:z.number(), withMachineReadableResources:z.number(), withOpenLicense:z.number(), withoutResources:z.number() }), missingness:z.array(z.object({ scope:z.string(), note:z.string(), impact:z.string() })) });
export type CoverageReport = z.infer<typeof CoverageReport>;
export const DerivedFact = z.object({ id:z.string(), title:z.string(), finding:z.string(), evidence:z.array(z.string()), metric:z.record(z.union([z.string(), z.number(), z.boolean()])), caveat:z.string() });
export type DerivedFact = z.infer<typeof DerivedFact>;
export const ForecastCapability = z.object({
  id:z.string(),
  hazard:z.enum(['flooding','rainfall','bad-harvest','slippery-roads']),
  label:z.string(),
  status:z.enum(['evidence-ready','prototype-ready','benchmark-required','not-claimable']),
  target:z.object({ threshold:z.number(), metric:z.string(), window:z.string() }),
  current:z.object({ accuracyClaimed:z.boolean(), validatedAccuracy:z.number().nullable(), benchmarkStatus:z.string() }),
  evidenceSignals:z.array(z.object({ id:z.string(), label:z.string(), datasetIds:z.array(z.string()), strength:z.enum(['strong','medium','weak','missing']), missing:z.boolean(), caveats:z.array(z.string()) })),
  modelPlan:z.array(z.string()),
  blockers:z.array(z.string())
});
export type ForecastCapability = z.infer<typeof ForecastCapability>;
export const ForecastReadiness = z.object({ generatedAt:z.string(), version:z.string(), purpose:z.string(), requiredAccuracy:z.number(), claimStatus:z.enum(['not-achieved','partially-achieved','achieved']), capabilities:z.array(ForecastCapability), benchmarkGates:z.array(z.string()), caveats:z.array(z.string()) });
export type ForecastReadiness = z.infer<typeof ForecastReadiness>;
export const ContextBundle = z.object({ generatedAt:z.string(), version:z.string(), datasets:z.array(Dataset), entities:z.array(Entity), relationships:z.array(Relationship), observations:z.array(Observation), sourceRecords:z.array(SourceRecord).default([]), coverage:CoverageReport.optional(), disclaimers:z.array(z.string()) });
export type ContextBundle = z.infer<typeof ContextBundle>;
export const CLAIM_BOUNDARY = [
  'This project provides public and derived contextual datasets only.',
  'It does not provide official findings, legal opinions, engineering assessments, causation conclusions, safety determinations, or recommendations.',
  'Any interpretation generated by users or third-party AI tools is external to this project.'
] as const;
export function normalizeSearch(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); }
export function slug(value: string): string { return normalizeSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96) || 'unknown'; }
export const MACHINE_READABLE_FORMATS = new Set(['csv','json','geojson','xml','xlsx','xls','zip','api','kml','kmz','shp','gpkg','wms','wfs','rdf','ttl','parquet','geoparquet']);
