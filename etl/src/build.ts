import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLAIM_BOUNDARY, ContextBundle, MACHINE_READABLE_FORMATS, slug, type ContextBundle as Bundle, type Dataset, type DatasetDomain, type SourceRecord, type CoverageReport } from '@ipcg/shared';

const now = new Date().toISOString();
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
  const resources = (pkg.resources ?? []).map((r, i) => ({ id: resourceId(id, r, i), datasetId:id, name:r.name || r.description?.slice(0,80) || r.url || `Resource ${i+1}`, format:cleanFormat(r.format), url:r.url, description:r.description?.replace(/\s+/g,' ').slice(0,160), lastModified:r.last_modified, size:r.size, mimetype:r.mimetype })).slice(0, 10);
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
    { scope:'geospatial', note:'Only catalogue metadata is automatically geocoded in this release; dataset-level geometries require source-specific adapters.', impact:'Nearby-entity and map-layer answers are incomplete until geospatial adapters are added for each source.' },
    { scope:'temporal', note:'Metadata timestamps are captured, but full historical snapshots require scheduled persisted releases.', impact:'Change-over-time reasoning should use release versions rather than assuming live catalogue values are historical truth.' },
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
const entities: Bundle['entities'] = [
  { id:'country:ie', type:'country', name:'Ireland', datasetIds:['cso-statbank'], properties:{ iso2:'IE', datasetCount:datasets.length } },
  { id:'catalog:data-gov-ie', type:'catalog', name:'data.gov.ie', datasetIds:['data-gov-ie-catalog'], properties:{ endpoint:'https://data.gov.ie/api/3/action/package_search', discoveredDatasetCount: discovered.length } },
  ...domains.map(d => ({ id:`domain:${d}`, type:'domain', name:d.replace('-', ' '), datasetIds:['data-gov-ie-catalog'], properties:{ datasetCount:coverage.domainCounts[d] ?? 0 } })),
  ...publishers.map(([id,name]) => ({ id:`publisher:${id}`, type:'publisher', name, datasetIds:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).slice(0,200).map(d=>d.id), properties:{ datasetCount:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).length } })),
  ...datasets.map(d => ({ id:`dataset:${d.id}`, type:'dataset', name:d.title, datasetIds:[d.id], properties:{ publisher:d.publisher, publisherId:d.publisherId, formats:d.formats, updateCadence:d.updateCadence, sourceUrl:d.sourceUrl, quality:d.quality } }))
];
const relationships: Bundle['relationships'] = [];
for (const ds of datasets) {
  for (const domain of ds.domains) relationships.push({ id:`rel:${ds.id}:domain:${domain}`, subject:`dataset:${ds.id}`, predicate:'belongs_to_domain', object:`domain:${domain}`, datasetIds:[ds.id], confidence:'source', evidence:'Dataset catalogue domain classification' });
  const pub = `publisher:${ds.publisherId || slug(ds.publisher)}`;
  relationships.push({ id:`rel:${ds.id}:publisher`, subject:`dataset:${ds.id}`, predicate:'published_by', object:pub, datasetIds:[ds.id], confidence:'source', evidence:'CKAN organization metadata or seed source metadata' });
}
relationships.push({ id:'rel:catalog:indexes-country', subject:'catalog:data-gov-ie', predicate:'indexes_public_data_for', object:'country:ie', datasetIds:['data-gov-ie-catalog'], confidence:'source' });
const observations: Bundle['observations'] = [
  { id:'obs:dataset-count', entityId:'country:ie', metric:'dataset_count', value:datasets.length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:publisher-count', entityId:'country:ie', metric:'publisher_count', value:publishers.length, unit:'publishers', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:domain-count', entityId:'country:ie', metric:'domain_count', value:domains.length, unit:'domains', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:machine-readable-count', entityId:'country:ie', metric:'machine_readable_dataset_count', value:coverage.quality.withMachineReadableResources, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' }
];
const bundle = ContextBundle.parse({ generatedAt:now, version:now.slice(0,10), datasets:seedDatasets, entities, relationships, observations, sourceRecords:sourceRecords.slice(0, 250), coverage, disclaimers:[...CLAIM_BOUNDARY] });
const searchIndex = datasets.map(d => ({ id:d.id, title:d.title, publisher:d.publisher, domains:d.domains, formats:d.formats, sourceUrl:d.sourceUrl, license:d.license, description:d.description.slice(0,300), resourceCount:d.resources.length, quality:d.quality, text: `${d.title} ${d.publisher} ${d.domains.join(' ')} ${d.formats.join(' ')} ${d.description}`.toLowerCase().slice(0,2000) }));
const graphIndex = { generatedAt:now, nodes:entities.length, edges:relationships.length, entityTypes:count(entities.map(e=>e.type)), relationshipTypes:count(relationships.map(r=>r.predicate)), domains:coverage.domainCounts };
const publisherIndex = publishers.map(([id,name]) => ({ id, name, datasetCount:datasets.filter(d => (d.publisherId || slug(d.publisher)) === id).length })).sort((a,b)=>b.datasetCount-a.datasetCount);
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
  'publishers.json':publisherIndex,
  'manifest.json':{version:bundle.version,generatedAt:bundle.generatedAt,files:['context-bundle.json','dataset-catalog.json','source-records.json','coverage-report.json','search-index.json','entities.json','relationships.json','observations.json','graph-index.json','publishers.json'], discoveredFromDataGovIe:discovered.length, datasetCount:datasets.length, publisherCount:publishers.length, entityCount:entities.length, relationshipCount:relationships.length}
};
for (const [name, data] of Object.entries(files)) {
  const json=JSON.stringify(data);
  writeFileSync(resolve(out,name),json);
  if (['manifest.json','coverage-report.json','graph-index.json','publishers.json','search-index.json'].includes(name)) writeFileSync(resolve(web,name),json);
}
console.log(`Generated ${datasets.length} catalogue datasets, ${publishers.length} publishers, ${entities.length} entities, ${relationships.length} relationships`);
