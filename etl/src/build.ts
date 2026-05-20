import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLAIM_BOUNDARY, ContextBundle, MACHINE_READABLE_FORMATS, slug, type ContextBundle as Bundle, type Dataset, type DatasetDomain, type SourceRecord, type CoverageReport, type LayerManifest } from '@ipcg/shared';

const now = new Date().toISOString();
const GEOSPATIAL_FORMATS = new Set(['geojson','shp','gpkg','geopackage','kml','kmz','wms','wfs','arcgis geoservices rest api','esri rest','esri rest service','feature service','pmtiles','geoparquet']);
function hasGeospatialResource(d: Dataset): boolean { return d.formats.some(f => GEOSPATIAL_FORMATS.has(f.toLowerCase())) || d.resources.some(r => GEOSPATIAL_FORMATS.has(r.format.toLowerCase()) || /geo|map|spatial|arcgis|wms|wfs/i.test(`${r.format} ${r.name} ${r.url ?? ''}`)); }
function hasTemporalSignal(d: Dataset): boolean { return Boolean(d.metadataModified) || /daily|weekly|monthly|annual|hourly|periodic|historic|current|realtime/i.test(`${d.updateCadence} ${d.temporalCoverage}`); }
function geographyId(value: string): string { return `geography:${slug(value.replace(/\s*\/.*/, ''))}`; }
const domains = ['transport','roads','collisions','planning','environment','weather','demographics','health','education','public-services','infrastructure','economy','local-government','housing','energy','culture'] as const;
const seedDatasets: Dataset[] = [
  { id:'data-gov-ie-catalog', title:'Ireland Open Data Portal catalogue', publisher:'Department of Public Expenditure, NDP Delivery and Reform', publisherId:'department-of-public-expenditure-ndp-delivery-and-reform', domains:['local-government','public-services','transport','environment','planning','health','education','economy'], sourceUrl:'https://data.gov.ie/', license:'Varies per dataset', updateCadence:'continuous', geography:'Ireland', temporalCoverage:'varies', formats:['CKAN API','CSV','GeoJSON','JSON','XML'], description:'Master catalogue used to discover and track public Irish datasets and publisher metadata.', resources:[], provenanceNotes:['Use CKAN metadata as discovery layer, not as proof of dataset quality.'] },
  { id:'cso-statbank', title:'CSO StatBank and statistical geography', publisher:'Central Statistics Office Ireland', publisherId:'central-statistics-office-ireland', domains:['demographics','economy','housing','local-government'], sourceUrl:'https://data.cso.ie/', license:'CSO open data terms; verify per table', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'varies', formats:['PX','CSV','API','JSON'], description:'Population, labour, housing, commuting, deprivation-adjacent and statistical-area context.', resources:[], provenanceNotes:['Keep table IDs and retrieval timestamps for every normalized extract.'] },
  { id:'tailte-spatial', title:'Tailte Éireann spatial reference data', publisher:'Tailte Éireann', publisherId:'tailte-eireann', domains:['roads','planning','infrastructure'], sourceUrl:'https://www.tailte.ie/', license:'Verify per product/source', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current/historic depending source', formats:['SHP','GeoPackage','API'], description:'Roads, place names, boundaries and spatial reference context where public licensing permits.', resources:[], provenanceNotes:['Do not publish restricted datasets.'] },
  { id:'nta-gtfs', title:'NTA GTFS and public transport data', publisher:'National Transport Authority', publisherId:'national-transport-authority', domains:['transport','infrastructure'], sourceUrl:'https://www.transportforireland.ie/transitData/PT_Data.html', license:'NTA open-data terms; verify current terms', updateCadence:'frequent', geography:'Ireland', temporalCoverage:'current schedules/realtime where available', formats:['GTFS','GTFS-RT','CSV','Protocol Buffers'], description:'Stops, routes, trips, schedules and realtime public-transport context.', resources:[], provenanceNotes:['Realtime snapshots must be timestamped and retained only according to permitted terms.'] },
  { id:'tii-traffic-roads', title:'TII traffic and national roads data', publisher:'Transport Infrastructure Ireland', publisherId:'transport-infrastructure-ireland', domains:['transport','roads','infrastructure'], sourceUrl:'https://trafficdata.tii.ie/', license:'Verify per TII data source', updateCadence:'daily/monthly/annual depending source', geography:'National roads and counters', temporalCoverage:'varies', formats:['CSV','API','GeoJSON'], description:'Traffic counters, AADT, road network, travel times and national road context.', resources:[], provenanceNotes:['Exposure metrics are factual context only.'] },
  { id:'rsa-collisions', title:'RSA collision and casualty data', publisher:'Road Safety Authority / Department of Transport', publisherId:'road-safety-authority-department-of-transport', domains:['collisions','roads','transport'], sourceUrl:'https://www.rsa.ie/road-safety/statistics', license:'Verify source and reuse terms', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'historic', formats:['Tableau','CSV','API if available'], description:'Collision and casualty records and aggregates used as one context domain.', resources:[], provenanceNotes:['No blackspot, fault, causation or recommendation claims are produced by this project.'] },
  { id:'met-eireann', title:'Met Éireann observations, forecasts, warnings and climate data', publisher:'Met Éireann', publisherId:'met-eireann', domains:['weather','environment'], sourceUrl:'https://www.met.ie/climate/available-data', license:'Often CC BY 4.0; verify per endpoint', updateCadence:'hourly/daily/periodic', geography:'Ireland', temporalCoverage:'historic/current', formats:['CSV','API','JSON'], description:'Weather observations and warnings for temporal/spatial context.', resources:[], provenanceNotes:['Contextual observations only; do not infer causation.'] },
  { id:'opw-flood', title:'OPW flood maps and flood risk datasets', publisher:'Office of Public Works', publisherId:'office-of-public-works', domains:['environment','planning','infrastructure'], sourceUrl:'https://www.floodinfo.ie/', license:'Verify per dataset', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current/historic modelled extents', formats:['WMS','GeoJSON','SHP'], description:'Flood extents, flood risk context and related environmental layers.', resources:[], provenanceNotes:['Modelled extents require scale and confidence notes.'] },
  { id:'hse-services', title:'HSE and public health service locations', publisher:'Health Service Executive', publisherId:'health-service-executive', domains:['health','public-services'], sourceUrl:'https://www.hse.ie/', license:'Verify per dataset', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current', formats:['CSV','API','HTML'], description:'Hospitals, urgent care, clinics and health-service access context.', resources:[], provenanceNotes:['Directory data may lag real-world service changes.'] },
  { id:'education-schools', title:'School locations and education statistics', publisher:'Department of Education / data.gov.ie', publisherId:'department-of-education', domains:['education','demographics','public-services'], sourceUrl:'https://www.gov.ie/en/collection/primary-schools/', license:'Open data terms where published; verify per file', updateCadence:'annual/periodic', geography:'Ireland', temporalCoverage:'current/historic lists', formats:['CSV','XLSX','GeoJSON'], description:'School locations, roll numbers and education context.', resources:[], provenanceNotes:['Sensitive interpretation around children/schools must remain data-only.'] },
  { id:'local-authority-assets', title:'Local authority infrastructure and civic assets', publisher:'Irish local authorities', publisherId:'irish-local-authorities', domains:['local-government','infrastructure','planning','transport','environment'], sourceUrl:'https://data.gov.ie/dataset', license:'Varies per local authority dataset', updateCadence:'varies', geography:'Local authority areas', temporalCoverage:'varies', formats:['CSV','GeoJSON','SHP','API'], description:'Public lighting, crossings, traffic signals, roadworks, parking, drainage, active travel and civic assets where published.', resources:[], provenanceNotes:['Coverage is uneven; missingness is a first-class output.'] }
];

type CkanResource = { id?:string; name?:string; description?:string; format?:string; url?:string; last_modified?:string; size?:number; mimetype?:string };
type CkanPackage = { name:string; title?:string; notes?:string; license_title?:string; license_id?:string; metadata_modified?:string; organization?:{title?:string; name?:string}; groups?:{name?:string; title?:string}[]; tags?:{name?:string}[]; resources?:CkanResource[] };
function inferDomains(pkg: CkanPackage): DatasetDomain[] {
  const hay = `${pkg.title ?? ''} ${pkg.notes ?? ''} ${pkg.groups?.map(g=>`${g.name} ${g.title}`).join(' ') ?? ''} ${pkg.tags?.map(t=>t.name).join(' ') ?? ''}`.toLowerCase();
  const hits = new Set<DatasetDomain>();
  const add = (d: DatasetDomain, words: string[]) => { if (words.some(w => hay.includes(w))) hits.add(d); };
  add('transport', ['transport','traffic','bus','rail','gtfs','cycle','cycling','journey','vehicle','parking','taxi']);
  add('roads', ['road','roads','street','junction','speed','collision','traffic','footpath','cycle lane']);
  add('collisions', ['collision','collisions','casualty','casualties','accident','road safety']);
  add('planning', ['planning','zoning','development plan','land use','permission']);
  add('environment', ['environment','flood','water','air','waste','biodiversity','noise','emission']);
  add('weather', ['weather','rainfall','temperature','wind','forecast','climate']);
  add('demographics', ['population','census','demographic','household','commuting']);
  add('health', ['health','hospital','clinic','hse','ambulance']);
  add('education', ['school','education','student','university','college']);
  add('public-services', ['garda','fire','library','service','public','facility']);
  add('infrastructure', ['infrastructure','lighting','water','energy','broadband','asset','network']);
  add('economy', ['economy','employment','business','enterprise','income','trade']);
  add('housing', ['housing','dwelling','rent','homeless','tenure']);
  add('energy', ['energy','electricity','gas','renewable']);
  add('culture', ['culture','heritage','museum','arts','tourism']);
  return [...hits].length ? [...hits] : ['local-government'];
}
function cleanFormat(f?: string): string { return (f || 'unknown').trim().replace(/^\.+/,'').toUpperCase() || 'UNKNOWN'; }
function isOpenLicense(license: string): boolean { return /cc|creative commons|open|ogl|odc|pddl|public/i.test(license); }
function resourceId(datasetId: string, r: CkanResource, i: number): string { return `${datasetId}:resource:${slug(r.id || r.name || r.url || String(i))}`; }
function toDataset(pkg: CkanPackage): Dataset {
  const id = `data-gov-ie:${pkg.name}`;
  const publisher = pkg.organization?.title || pkg.organization?.name || 'Unknown publisher';
  const resources = (pkg.resources ?? []).map((r, i) => ({ id: resourceId(id, r, i), datasetId:id, name:r.name || r.description?.slice(0,80) || r.url || `Resource ${i+1}`, format:cleanFormat(r.format), url:r.url || undefined, description:r.description?.replace(/\s+/g,' ').slice(0,160), lastModified:r.last_modified || undefined, size:typeof r.size === 'number' ? r.size : undefined, mimetype:r.mimetype || undefined })).slice(0, 10);
  const formats = [...new Set(resources.map(r => r.format).filter(Boolean))].slice(0, 20);
  const license = pkg.license_title || pkg.license_id || 'Unspecified; verify source metadata';
  const machine = resources.some(r => MACHINE_READABLE_FORMATS.has(r.format.toLowerCase()));
  return { id, title:pkg.title || pkg.name, publisher, publisherId:slug(publisher), domains:inferDomains(pkg), sourceUrl:`https://data.gov.ie/dataset/${pkg.name}`, license, updateCadence:'catalogue metadata; verify source', geography:'Ireland / publisher-specific', temporalCoverage:pkg.metadata_modified ? `metadata modified ${pkg.metadata_modified}` : 'varies', formats:formats.length ? formats : ['metadata only'], description:(pkg.notes || 'Public dataset catalogue record.').replace(/\s+/g, ' ').slice(0, 500), resources, metadataModified:pkg.metadata_modified, provenanceNotes:['Automatically discovered from data.gov.ie CKAN API.', 'Licence, freshness and field-level quality must be verified per source before downstream reuse.'], quality:{ hasResources:resources.length>0, hasOpenLicense:isOpenLicense(license), hasMachineReadableResource:machine, resourceCount:resources.length, formatCount:formats.length } };
}
async function fetchCkanDatasets(): Promise<Dataset[]> {
  if (process.env.IPCG_OFFLINE === '1') return [];
  const out: Dataset[] = [];
  const rows = 100;
  for (let start = 0; start < 30000; start += rows) {
    const url = `https://data.gov.ie/api/3/action/package_search?rows=${rows}&start=${start}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`CKAN fetch failed ${res.status}`);
    const json: any = await res.json();
    const results: CkanPackage[] = json.result?.results ?? [];
    for (const pkg of results) out.push(toDataset(pkg));
    if (start + rows >= Number(json.result?.count ?? 0) || results.length === 0) break;
  }
  return out;
}
function count<T extends string>(items: T[]): Record<string, number> { const m: Record<string, number> = {}; for (const x of items) m[x] = (m[x] ?? 0) + 1; return Object.fromEntries(Object.entries(m).sort((a,b)=>b[1]-a[1])); }
function buildCoverage(datasets: Dataset[], sourceRecords: SourceRecord[]): CoverageReport {
  return { generatedAt:now, datasetCount:datasets.length, publisherCount:new Set(datasets.map(d=>d.publisherId || slug(d.publisher))).size, domainCounts:count(datasets.flatMap(d=>d.domains)), formatCounts:count(datasets.flatMap(d=>d.formats.map(f=>f.toUpperCase()))), licenseCounts:count(datasets.map(d=>d.license || 'Unspecified')), quality:{ withResources:datasets.filter(d=>d.quality?.hasResources).length, withMachineReadableResources:datasets.filter(d=>d.quality?.hasMachineReadableResource).length, withOpenLicense:datasets.filter(d=>d.quality?.hasOpenLicense).length, withoutResources:datasets.filter(d=>!d.quality?.hasResources).length }, missingness:[
    { scope:'catalogue', note:'Catalogue records do not guarantee current source availability, licence validity or schema stability.', impact:'MCP clients should inspect source records and provenance before relying on a dataset.' },
    { scope:'geospatial', note:'This release now flags geospatial candidate datasets and layer manifests, but source-specific geometry adapters are still required for precise joins.', impact:'Nearby-entity and map-layer answers should use geometryStatus and caveats before treating links as spatially complete.' },
    { scope:'temporal', note:'Metadata timestamps and cadence signals are captured; source-level historical snapshots remain adapter-dependent.', impact:'Change-over-time reasoning should use versioned releases and source-specific temporal fields where available.' },
    { scope:'licensing', note:`${sourceRecords.filter(s=>/unspecified|verify|varies/i.test(s.license)).length} source records require licence verification.`, impact:'Reuse/export decisions should be conservative until source-level terms are confirmed.' }
  ] };
}
let discovered: Dataset[] = [];
try { discovered = await fetchCkanDatasets(); } catch (err) { console.warn('CKAN discovery failed; using seed catalogue only:', err instanceof Error ? err.message : String(err)); }
const seen = new Set<string>();
const datasets = [...seedDatasets, ...discovered].filter(d => seen.has(d.id) ? false : (seen.add(d.id), true));
const publishers = [...new Map(datasets.map(d => [d.publisherId || slug(d.publisher), d.publisher])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
const sourceRecords: SourceRecord[] = datasets.map(d => ({ id:`source:${d.id}`, datasetId:d.id, publisher:d.publisher, sourceUrl:d.sourceUrl, license:d.license, retrievedAt:now, metadataModified:d.metadataModified, resourceCount:d.resources.length, formats:d.formats, resourceUrls:d.resources.map(r=>r.url).filter(Boolean).slice(0,15) as string[], provenanceNotes:d.provenanceNotes }));
const coverage = buildCoverage(datasets, sourceRecords);
const formatValues = [...new Set(datasets.flatMap(d => d.formats.map(f => cleanFormat(f))))].sort();
const geographyValues = [...new Set(datasets.map(d => d.geography || 'Ireland'))].sort();
const resourceEntities: Bundle['entities'] = datasets.flatMap(d => d.resources.map(r => ({
  id:`resource:${r.id}`, type:'resource', name:r.name, datasetIds:[d.id], properties:{ datasetId:d.id, format:r.format, url:r.url, lastModified:r.lastModified, mimetype:r.mimetype, size:r.size }
})));
const layerDomains = domains.filter(d => ['roads','collisions','transport','planning','environment','weather','demographics','health','education','housing','energy','infrastructure','local-government'].includes(d));
const integrationLayerEntities: Bundle['entities'] = layerDomains.map(d => ({
  id:`layer:${d}`, type:'integration-layer', name:`${d.replace('-', ' ')} public context layer`, datasetIds:datasets.filter(ds => ds.domains.includes(d)).slice(0,500).map(ds=>ds.id), properties:{ domain:d, datasetCount:coverage.domainCounts[d] ?? 0, geospatialCandidateCount:datasets.filter(ds => ds.domains.includes(d) && hasGeospatialResource(ds)).length }
}));
const entities: Bundle['entities'] = [
  { id:'country:ie', type:'country', name:'Ireland', datasetIds:['cso-statbank'], properties:{ iso2:'IE', datasetCount:datasets.length } },
  { id:'catalog:data-gov-ie', type:'catalog', name:'data.gov.ie', datasetIds:['data-gov-ie-catalog'], properties:{ endpoint:'https://data.gov.ie/api/3/action/package_search', discoveredDatasetCount: discovered.length } },
  ...domains.map(d => ({ id:`domain:${d}`, type:'domain', name:d.replace('-', ' '), datasetIds:['data-gov-ie-catalog'], properties:{ datasetCount:coverage.domainCounts[d] ?? 0, geospatialCandidateCount:datasets.filter(ds => ds.domains.includes(d) && hasGeospatialResource(ds)).length } })),
  ...publishers.map(([id,name]) => ({ id:`publisher:${id}`, type:'publisher', name, datasetIds:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).slice(0,200).map(d=>d.id), properties:{ datasetCount:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).length } })),
  ...formatValues.map(f => ({ id:`format:${slug(f)}`, type:'format', name:f, datasetIds:datasets.filter(d => d.formats.map(cleanFormat).includes(f)).slice(0,200).map(d=>d.id), properties:{ datasetCount:datasets.filter(d => d.formats.map(cleanFormat).includes(f)).length, geospatial:GEOSPATIAL_FORMATS.has(f.toLowerCase()) } })),
  ...geographyValues.slice(0,500).map(g => ({ id:geographyId(g), type:'geography', name:g, datasetIds:datasets.filter(d => d.geography === g).slice(0,200).map(d=>d.id), properties:{ datasetCount:datasets.filter(d => d.geography === g).length } })),
  ...integrationLayerEntities,
  ...datasets.map(d => ({ id:`dataset:${d.id}`, type:'dataset', name:d.title, datasetIds:[d.id], properties:{ publisher:d.publisher, publisherId:d.publisherId, formats:d.formats, updateCadence:d.updateCadence, sourceUrl:d.sourceUrl, quality:d.quality, geospatialCandidate:hasGeospatialResource(d), temporalSignal:hasTemporalSignal(d) } })),
  ...resourceEntities
];
const relationships: Bundle['relationships'] = [];
for (const ds of datasets) {
  for (const domain of ds.domains) {
    relationships.push({ id:`rel:${ds.id}:domain:${domain}`, subject:`dataset:${ds.id}`, predicate:'belongs_to_domain', object:`domain:${domain}`, datasetIds:[ds.id], confidence:'source', evidence:'Dataset catalogue domain classification' });
    relationships.push({ id:`rel:${ds.id}:layer:${domain}`, subject:`dataset:${ds.id}`, predicate:'contributes_to_layer', object:`layer:${domain}`, datasetIds:[ds.id], confidence:'derived-high', evidence:'Layer membership derived from dataset domain classification' });
  }
  const pub = `publisher:${ds.publisherId || slug(ds.publisher)}`;
  relationships.push({ id:`rel:${ds.id}:publisher`, subject:`dataset:${ds.id}`, predicate:'published_by', object:pub, datasetIds:[ds.id], confidence:'source', evidence:'CKAN organization metadata or seed source metadata' });
  relationships.push({ id:`rel:${ds.id}:geography`, subject:`dataset:${ds.id}`, predicate:'covers_geography', object:geographyId(ds.geography), datasetIds:[ds.id], confidence:'derived-medium', evidence:'Dataset geography metadata; verify precise coverage per source record' });
  for (const f of ds.formats.map(cleanFormat)) relationships.push({ id:`rel:${ds.id}:format:${slug(f)}`, subject:`dataset:${ds.id}`, predicate:'available_as_format', object:`format:${slug(f)}`, datasetIds:[ds.id], confidence:'source', evidence:'Dataset resource format metadata' });
  for (const r of ds.resources) relationships.push({ id:`rel:${r.id}:dataset`, subject:`dataset:${ds.id}`, predicate:'has_resource', object:`resource:${r.id}`, datasetIds:[ds.id], confidence:'source', evidence:'CKAN resource metadata or seed source metadata' });
  if (hasGeospatialResource(ds)) relationships.push({ id:`rel:${ds.id}:spatial-candidate`, subject:`dataset:${ds.id}`, predicate:'has_geospatial_join_potential', object:'country:ie', datasetIds:[ds.id], confidence:'derived-medium', evidence:'Derived from geospatial resource formats or spatial metadata keywords; geometry adapter required before precise spatial joins' });
  if (hasTemporalSignal(ds)) relationships.push({ id:`rel:${ds.id}:temporal-signal`, subject:`dataset:${ds.id}`, predicate:'has_temporal_context', object:'country:ie', datasetIds:[ds.id], confidence:'derived-medium', evidence:'Derived from update cadence, temporal coverage or metadata modified timestamp' });
}
relationships.push({ id:'rel:catalog:indexes-country', subject:'catalog:data-gov-ie', predicate:'indexes_public_data_for', object:'country:ie', datasetIds:['data-gov-ie-catalog'], confidence:'source' });
const observations: Bundle['observations'] = [
  { id:'obs:dataset-count', entityId:'country:ie', metric:'dataset_count', value:datasets.length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:publisher-count', entityId:'country:ie', metric:'publisher_count', value:publishers.length, unit:'publishers', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:domain-count', entityId:'country:ie', metric:'domain_count', value:domains.length, unit:'domains', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:machine-readable-count', entityId:'country:ie', metric:'machine_readable_dataset_count', value:coverage.quality.withMachineReadableResources, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:geospatial-candidate-count', entityId:'country:ie', metric:'geospatial_candidate_dataset_count', value:datasets.filter(hasGeospatialResource).length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  ...domains.map(d => ({ id:`obs:domain:${d}:dataset-count`, entityId:`domain:${d}`, metric:'dataset_count', value:coverage.domainCounts[d] ?? 0, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' })),
  ...domains.map(d => ({ id:`obs:domain:${d}:geospatial-candidate-count`, entityId:`domain:${d}`, metric:'geospatial_candidate_dataset_count', value:datasets.filter(ds => ds.domains.includes(d) && hasGeospatialResource(ds)).length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' }))
];
const layerManifest: LayerManifest = { generatedAt:now, layers: layerDomains.map(domain => {
  const layerDatasets = datasets.filter(ds => ds.domains.includes(domain));
  const spatial = layerDatasets.filter(hasGeospatialResource);
  return { id:`layer:${domain}`, title:`${domain.replace('-', ' ')} public context layer`, domain, description:`Datasets, entities and source records relevant to ${domain.replace('-', ' ')} context in Ireland.`, entityIds:[`domain:${domain}`, `layer:${domain}`, ...spatial.slice(0,100).map(ds => `dataset:${ds.id}`)], datasetIds:layerDatasets.slice(0,1000).map(ds=>ds.id), relationshipPredicates:['belongs_to_domain','published_by','covers_geography','available_as_format','has_resource','has_geospatial_join_potential','has_temporal_context'], formats:[...new Set(layerDatasets.flatMap(ds => ds.formats.map(cleanFormat)))].sort(), geometryStatus: spatial.length ? 'candidate' : 'metadata-only', caveats: spatial.length ? ['Geospatial candidate status is inferred from formats/metadata; source-specific adapters must validate CRS, precision and geometry semantics before spatial joins.'] : ['No geospatial resource candidate detected from catalogue metadata.'] };
}) };
const bundle = ContextBundle.parse({ generatedAt:now, version:now.slice(0,10), datasets, entities, relationships, observations, sourceRecords, coverage, disclaimers:[...CLAIM_BOUNDARY] });
const searchIndex = datasets.map(d => ({ id:d.id, title:d.title, publisher:d.publisher, domains:d.domains, formats:d.formats, sourceUrl:d.sourceUrl, license:d.license, description:d.description.slice(0,300), resourceCount:d.resources.length, quality:d.quality, text: `${d.title} ${d.publisher} ${d.domains.join(' ')} ${d.formats.join(' ')} ${d.description}`.toLowerCase().slice(0,2000) }));
const graphIndex = { generatedAt:now, nodes:entities.length, edges:relationships.length, entityTypes:count(entities.map(e=>e.type)), relationshipTypes:count(relationships.map(r=>r.predicate)), domains:coverage.domainCounts };
const publisherIndex = publishers.map(([id,name]) => ({ id, name, datasetCount:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).length })).sort((a,b)=>b.datasetCount-a.datasetCount);

type BrainFactor = { id:string; label:string; relationship:string; domains:DatasetDomain[]; keywords:string[]; requiredEvidence:string[]; missingIfAbsent:string; description:string };
type BrainIssue = { id:string; label:string; examples:string[]; factors:BrainFactor[] };
type BrainEvidenceDataset = { datasetId:string; title:string; publisher:string; domains:DatasetDomain[]; formats:string[]; sourceUrl:string; license:string; score:number; evidenceStrength:'strong'|'medium'|'weak'; reasons:string[]; caveats:string[] };
type BrainFactorCard = BrainFactor & { evidenceDatasets:BrainEvidenceDataset[]; evidenceCount:number; strongestEvidence:'strong'|'medium'|'weak'|'missing'; missing:boolean };
type BrainIssueCard = { id:string; label:string; examples:string[]; factors:BrainFactorCard[]; missingEvidence:string[]; relationshipTypes:string[]; agentPrompt:string };
const brainIssues: BrainIssue[] = [
  { id:'flood-context', label:'Flood context', examples:['Why is flooding happening here?','What factors could contribute to flood risk around this place?'], factors:[
    { id:'rainfall-intensity', label:'Rainfall intensity and duration', relationship:'candidate_contributing_factor', domains:['weather','environment'], keywords:['rainfall','precipitation','rain','weather','storm','met eireann','forecast'], requiredEvidence:['current and recent rainfall','forecast rainfall','station or gridded weather coverage'], missingIfAbsent:'No rainfall/precipitation source is connected yet.', description:'Heavy or prolonged rainfall can increase runoff and river levels.' },
    { id:'river-level-upstream', label:'River level and upstream/downstream cascade', relationship:'candidate_contributing_factor', domains:['environment','infrastructure'], keywords:['river','gauge','water level','hydrometric','opw','catchment','stream','upstream','downstream'], requiredEvidence:['gauge readings','river network topology','upstream/downstream travel time'], missingIfAbsent:'River gauge and cascade evidence is incomplete.', description:'Upstream river levels can propagate downstream over time.' },
    { id:'soil-saturation', label:'Soil saturation and infiltration capacity', relationship:'candidate_contributing_factor', domains:['weather','environment'], keywords:['soil','saturation','groundwater','infiltration','moisture','karst','peat'], requiredEvidence:['soil moisture','groundwater probability','soil/geology layer'], missingIfAbsent:'Soil/groundwater evidence is missing or not yet joined.', description:'Saturated or low-infiltration ground increases surface runoff.' },
    { id:'terrain-flow-path', label:'Elevation, slope and flow paths', relationship:'candidate_contributing_factor', domains:['environment','planning','infrastructure'], keywords:['lidar','elevation','dem','slope','topographic','flow','terrain'], requiredEvidence:['DEM/LiDAR','slope','flow accumulation'], missingIfAbsent:'DEM/LiDAR flow-path processing is not yet available.', description:'Low elevation and local slope determine where water can accumulate or move.' },
    { id:'impervious-surface', label:'Impervious surface and land cover', relationship:'candidate_contributing_factor', domains:['planning','environment','housing'], keywords:['land cover','corine','impervious','built up','urban','surface','development','zoning'], requiredEvidence:['land cover','built-up surfaces','planning/development change'], missingIfAbsent:'Land-cover/impervious-surface evidence is incomplete.', description:'Built surfaces reduce absorption and increase runoff.' },
    { id:'drainage-road-barriers', label:'Drainage, culverts and road barriers', relationship:'candidate_contributing_factor', domains:['roads','infrastructure','local-government'], keywords:['drainage','culvert','road','roads','bridge','stormwater','gully','asset','public lighting','crossing'], requiredEvidence:['drainage assets','culvert/bridge data','road network barriers'], missingIfAbsent:'Drainage/culvert data is often missing from public catalogues.', description:'Roads, embankments and drainage capacity can redirect or block flows.' }
  ]},
  { id:'road-safety-context', label:'Road safety context', examples:['Is this road unsafe?','What public evidence explains collision concentration here?'], factors:[
    { id:'collision-history', label:'Collision and casualty history', relationship:'supporting_context', domains:['collisions','roads','transport'], keywords:['collision','casualty','accident','road safety','rsa'], requiredEvidence:['collision records','severity','date/time'], missingIfAbsent:'Collision source is missing or not granular enough.', description:'Historic collisions are evidence of prior safety performance, not proof of current fault.' },
    { id:'traffic-exposure', label:'Traffic volume and exposure', relationship:'normalisation_factor', domains:['transport','roads'], keywords:['traffic','aadt','counter','vehicle','volume','tii'], requiredEvidence:['traffic counts','road segment','time period'], missingIfAbsent:'Exposure denominator is missing.', description:'Collision counts need traffic exposure to avoid misleading comparisons.' },
    { id:'road-design-context', label:'Road layout and vulnerable-user infrastructure', relationship:'candidate_contributing_factor', domains:['roads','transport','infrastructure'], keywords:['junction','crossing','cycle','footpath','speed','lighting','traffic signal','pedestrian'], requiredEvidence:['junctions','speed limits','crossings','lighting/cycle/footpath data'], missingIfAbsent:'Road-design asset evidence is incomplete.', description:'Layout and infrastructure affect how people move through a road environment.' },
    { id:'nearby-vulnerable-assets', label:'Nearby schools, hospitals and public places', relationship:'exposure_context', domains:['education','health','public-services'], keywords:['school','hospital','clinic','library','public facility','child','elderly'], requiredEvidence:['asset locations','distance to road','opening hours/population served'], missingIfAbsent:'Vulnerable asset locations are not fully joined.', description:'Nearby vulnerable users change the interpretation of road context.' }
  ]},
  { id:'public-service-access', label:'Public service access', examples:['What services are missing here?','Which areas have poor access to hospitals, schools or transport?'], factors:[
    { id:'service-locations', label:'Service and facility locations', relationship:'access_context', domains:['health','education','public-services','local-government'], keywords:['hospital','clinic','school','library','garda','fire','facility','service'], requiredEvidence:['facility locations','service type','operating status'], missingIfAbsent:'Service directories are incomplete or stale.', description:'Access starts with reliable location and service data.' },
    { id:'transport-connectivity', label:'Transport connectivity', relationship:'access_context', domains:['transport','roads'], keywords:['bus','rail','gtfs','route','stop','journey','timetable','transport'], requiredEvidence:['stops','routes','frequency','walk/drive travel time'], missingIfAbsent:'Transport frequency and travel-time evidence is incomplete.', description:'Public transport determines whether services are practically reachable.' },
    { id:'population-need', label:'Population need and demographics', relationship:'demand_context', domains:['demographics','housing','economy'], keywords:['population','census','age','disability','household','deprivation','income'], requiredEvidence:['population by area','age/need indicators','time period'], missingIfAbsent:'Demographic need data is missing at the right geography.', description:'Service access must be compared with who lives nearby and what they need.' }
  ]},
  { id:'planning-development-context', label:'Planning and development context', examples:['What changed around this neighbourhood?','What public evidence relates to this planning decision?'], factors:[
    { id:'zoning-land-use', label:'Zoning and land-use policy', relationship:'policy_context', domains:['planning','housing','environment'], keywords:['planning','zoning','development plan','land use','myplan'], requiredEvidence:['zoning layer','development plan','valid date'], missingIfAbsent:'Zoning and plan layers are incomplete.', description:'Planning policy defines what development is permitted or encouraged.' },
    { id:'nearby-environmental-constraints', label:'Nearby environmental constraints', relationship:'constraint_context', domains:['environment','energy','planning'], keywords:['protected','habitat','flood','water','biodiversity','noise','air'], requiredEvidence:['constraint layers','distance/overlap','licence/scale notes'], missingIfAbsent:'Environmental constraint layers are not fully connected.', description:'Environmental overlaps can shape planning interpretation.' },
    { id:'infrastructure-capacity', label:'Infrastructure capacity and public assets', relationship:'capacity_context', domains:['infrastructure','transport','public-services'], keywords:['water','wastewater','road','traffic','school','health','broadband','energy'], requiredEvidence:['capacity indicators','assets','service catchments'], missingIfAbsent:'Capacity datasets are partial or absent.', description:'Development pressure should be read against infrastructure and service capacity.' }
  ]}
];
function datasetText(d: Dataset): string { return `${d.id} ${d.title} ${d.publisher} ${d.domains.join(' ')} ${d.formats.join(' ')} ${d.description} ${d.resources.map(r=>`${r.name} ${r.description ?? ''} ${r.format}`).join(' ')}`.toLowerCase(); }
function evidenceForFactor(f: BrainFactor): BrainEvidenceDataset[] {
  return datasets.map(d => {
    const text = datasetText(d); const reasons: string[] = []; let score = 0;
    const domainHits = d.domains.filter(x => f.domains.includes(x));
    if (domainHits.length) { score += domainHits.length * 8; reasons.push(`domain match: ${domainHits.join(', ')}`); }
    const keywordHits = f.keywords.filter(k => text.includes(k.toLowerCase())).slice(0,8);
    if (keywordHits.length) { score += keywordHits.length * 4; reasons.push(`keyword match: ${keywordHits.join(', ')}`); }
    if (hasGeospatialResource(d)) { score += 3; reasons.push('geospatial join candidate'); }
    if (hasTemporalSignal(d)) { score += 2; reasons.push('temporal context signal'); }
    if (d.quality?.hasMachineReadableResource) { score += 1; reasons.push('machine-readable resource'); }
    const caveats = [...d.provenanceNotes.slice(0,2)];
    if (!hasGeospatialResource(d)) caveats.push('No precise geometry detected yet; spatial relationship needs adapter validation.');
    if (!hasTemporalSignal(d)) caveats.push('No strong temporal signal detected from catalogue metadata.');
    const evidenceStrength = score >= 18 ? 'strong' : score >= 10 ? 'medium' : 'weak';
    return { datasetId:d.id, title:d.title, publisher:d.publisher, domains:d.domains, formats:d.formats, sourceUrl:d.sourceUrl, license:d.license, score, evidenceStrength, reasons, caveats } satisfies BrainEvidenceDataset;
  }).filter(e => e.score >= 8).sort((a,b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0,12);
}
function buildBrainIndex() {
  const issues: BrainIssueCard[] = brainIssues.map(issue => {
    const factors = issue.factors.map(f => {
      const evidenceDatasets = evidenceForFactor(f);
      const strongestEvidence: BrainFactorCard['strongestEvidence'] = evidenceDatasets[0]?.evidenceStrength ?? 'missing';
      return { ...f, evidenceDatasets, evidenceCount:evidenceDatasets.length, strongestEvidence, missing:evidenceDatasets.length === 0 };
    });
    return { id:issue.id, label:issue.label, examples:issue.examples, factors, missingEvidence:factors.filter(f=>f.missing).map(f=>f.missingIfAbsent), relationshipTypes:[...new Set(factors.map(f=>f.relationship))], agentPrompt:`Use this as an evidence graph for ${issue.label}. Return candidate factors, supporting datasets, confidence/missingness, and avoid causal/legal/safety conclusions unless externally validated.` };
  });
  const factorEdges = issues.flatMap(issue => issue.factors.flatMap(f => f.evidenceDatasets.map(e => ({
    id:`brain:${issue.id}:${f.id}:${slug(e.datasetId)}`, issueId:issue.id, factorId:f.id, datasetId:e.datasetId, predicate:f.relationship, confidence:e.evidenceStrength === 'strong' ? 'derived-high' : e.evidenceStrength === 'medium' ? 'derived-medium' : 'derived-low', reasons:e.reasons, caveats:e.caveats
  }))));
  const questionIndex = issues.flatMap(issue => issue.examples.map(q => ({ question:q, issueId:issue.id, text:`${q} ${issue.label} ${issue.factors.map(f=>`${f.label} ${f.keywords.join(' ')}`).join(' ')}`.toLowerCase() })));
  return { generatedAt:now, version:now.slice(0,10), purpose:'Domain-agnostic public-context brain: connects questions to candidate real-world factors, supporting public datasets, confidence and missing evidence. It retrieves evidence; it does not issue official conclusions.', architecture:{ rawStorage:'R2/S3 snapshots and GeoParquet releases', batchProcessing:['DuckDB','GeoPandas','Shapely','Rasterio/GDAL','WhiteboxTools','NetworkX/OSMnx','H3'], serving:['Cloudflare Pages','Cloudflare Worker MCP/API'], graphCore:['entity resolution','spatial joins','temporal joins','evidence weighting','provenance','missingness tracking'] }, issueCount:issues.length, factorCount:issues.reduce((n,i)=>n+i.factors.length,0), evidenceEdgeCount:factorEdges.length, issues, factorEdges, questionIndex, learningLoop:['ingest new public datasets and snapshots','resolve entities to canonical places/assets/events/agencies','infer candidate spatial/temporal/factor relationships','score evidence and record caveats/missingness','expire or supersede stale edges as source data changes','expose updated graph through MCP/API for AI agents'] };
}
const brainIndex = buildBrainIndex();
const out=resolve('dist/public-data'); mkdirSync(out,{recursive:true});
const web=resolve('../apps/web/public/data'); mkdirSync(web,{recursive:true});
const files: Record<string, unknown> = {
  'context-bundle.json':bundle,
  'dataset-catalog.json':datasets,
  'source-records.json':sourceRecords,
  'coverage-report.json':coverage,
  'search-index.json':searchIndex,
  'entities.json':entities,
  'relationships.json':relationships,
  'observations.json':observations,
  'graph-index.json':graphIndex,
  'layer-manifest.json':layerManifest,
  'publishers.json':publisherIndex,
  'brain-index.json':brainIndex,
  'manifest.json':{version:bundle.version,generatedAt:bundle.generatedAt,files:['context-bundle.json','dataset-catalog.json','source-records.json','coverage-report.json','search-index.json','entities.json','relationships.json','observations.json','graph-index.json','layer-manifest.json','publishers.json','brain-index.json'], discoveredFromDataGovIe:discovered.length, datasetCount:datasets.length, publisherCount:publishers.length, entityCount:entities.length, relationshipCount:relationships.length, layerCount:layerManifest.layers.length, brainIssueCount:brainIndex.issueCount, brainFactorCount:brainIndex.factorCount, brainEvidenceEdgeCount:brainIndex.evidenceEdgeCount}
};
for (const [name, data] of Object.entries(files)) {
  const json=JSON.stringify(data);
  writeFileSync(resolve(out,name),json);
  if (['manifest.json','coverage-report.json','graph-index.json','layer-manifest.json','publishers.json','search-index.json','brain-index.json'].includes(name)) writeFileSync(resolve(web,name),json);
}
console.log(`Generated ${datasets.length} catalogue datasets, ${publishers.length} publishers, ${entities.length} entities, ${relationships.length} relationships`);
