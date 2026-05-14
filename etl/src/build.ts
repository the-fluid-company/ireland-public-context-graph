import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLAIM_BOUNDARY, ContextBundle, type ContextBundle as Bundle, type DatasetDomain } from '@ipcg/shared';

const now = new Date().toISOString();
const domains = ['transport','roads','collisions','planning','environment','weather','demographics','health','education','public-services','infrastructure','economy','local-government','housing','energy','culture'] as const;
const seedDatasets: Bundle['datasets'] = [
  { id:'data-gov-ie-catalog', title:'Ireland Open Data Portal catalogue', publisher:'Department of Public Expenditure, NDP Delivery and Reform', domains:['local-government','public-services','transport','environment','planning','health','education','economy'], sourceUrl:'https://data.gov.ie/', license:'Varies per dataset', updateCadence:'continuous', geography:'Ireland', temporalCoverage:'varies', formats:['CKAN API','CSV','GeoJSON','JSON','XML'], description:'Master catalogue used to discover and track public Irish datasets and publisher metadata.', provenanceNotes:['Use CKAN metadata as discovery layer, not as proof of dataset quality.'] },
  { id:'cso-statbank', title:'CSO StatBank and statistical geography', publisher:'Central Statistics Office Ireland', domains:['demographics','economy','housing','local-government'], sourceUrl:'https://data.cso.ie/', license:'CSO open data terms; verify per table', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'varies', formats:['PX','CSV','API','JSON'], description:'Population, labour, housing, commuting, deprivation-adjacent and statistical-area context.', provenanceNotes:['Keep table IDs and retrieval timestamps for every normalized extract.'] },
  { id:'tailte-spatial', title:'Tailte Éireann spatial reference data', publisher:'Tailte Éireann', domains:['roads','planning','infrastructure'], sourceUrl:'https://www.tailte.ie/', license:'Verify per product/source', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current/historic depending source', formats:['SHP','GeoPackage','API'], description:'Roads, place names, boundaries and spatial reference context where public licensing permits.', provenanceNotes:['Do not publish restricted datasets.'] },
  { id:'nta-gtfs', title:'NTA GTFS and public transport data', publisher:'National Transport Authority', domains:['transport','infrastructure'], sourceUrl:'https://www.transportforireland.ie/transitData/PT_Data.html', license:'NTA open-data terms; verify current terms', updateCadence:'frequent', geography:'Ireland', temporalCoverage:'current schedules/realtime where available', formats:['GTFS','GTFS-RT','CSV','Protocol Buffers'], description:'Stops, routes, trips, schedules and realtime public-transport context.', provenanceNotes:['Realtime snapshots must be timestamped and retained only according to permitted terms.'] },
  { id:'tii-traffic-roads', title:'TII traffic and national roads data', publisher:'Transport Infrastructure Ireland', domains:['transport','roads','infrastructure'], sourceUrl:'https://trafficdata.tii.ie/', license:'Verify per TII data source', updateCadence:'daily/monthly/annual depending source', geography:'National roads and counters', temporalCoverage:'varies', formats:['CSV','API','GeoJSON'], description:'Traffic counters, AADT, road network, travel times and national road context.', provenanceNotes:['Exposure metrics are factual context only.'] },
  { id:'rsa-collisions', title:'RSA collision and casualty data', publisher:'Road Safety Authority / Department of Transport', domains:['collisions','roads','transport'], sourceUrl:'https://www.rsa.ie/road-safety/statistics', license:'Verify source and reuse terms', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'historic', formats:['Tableau','CSV','API if available'], description:'Collision and casualty records and aggregates used as one context domain.', provenanceNotes:['No blackspot, fault, causation or recommendation claims are produced by this project.'] },
  { id:'met-eireann', title:'Met Éireann observations, forecasts, warnings and climate data', publisher:'Met Éireann', domains:['weather','environment'], sourceUrl:'https://www.met.ie/climate/available-data', license:'Often CC BY 4.0; verify per endpoint', updateCadence:'hourly/daily/periodic', geography:'Ireland', temporalCoverage:'historic/current', formats:['CSV','API','JSON'], description:'Weather observations and warnings for temporal/spatial context.', provenanceNotes:['Contextual observations only; do not infer causation.'] },
  { id:'opw-flood', title:'OPW flood maps and flood risk datasets', publisher:'Office of Public Works', domains:['environment','planning','infrastructure'], sourceUrl:'https://www.floodinfo.ie/', license:'Verify per dataset', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current/historic modelled extents', formats:['WMS','GeoJSON','SHP'], description:'Flood extents, flood risk context and related environmental layers.', provenanceNotes:['Modelled extents require scale and confidence notes.'] },
  { id:'hse-services', title:'HSE and public health service locations', publisher:'Health Service Executive', domains:['health','public-services'], sourceUrl:'https://www.hse.ie/', license:'Verify per dataset', updateCadence:'periodic', geography:'Ireland', temporalCoverage:'current', formats:['CSV','API','HTML'], description:'Hospitals, urgent care, clinics and health-service access context.', provenanceNotes:['Directory data may lag real-world service changes.'] },
  { id:'education-schools', title:'School locations and education statistics', publisher:'Department of Education / data.gov.ie', domains:['education','demographics','public-services'], sourceUrl:'https://www.gov.ie/en/collection/primary-schools/', license:'Open data terms where published; verify per file', updateCadence:'annual/periodic', geography:'Ireland', temporalCoverage:'current/historic lists', formats:['CSV','XLSX','GeoJSON'], description:'School locations, roll numbers and education context.', provenanceNotes:['Sensitive interpretation around children/schools must remain data-only.'] },
  { id:'local-authority-assets', title:'Local authority infrastructure and civic assets', publisher:'Irish local authorities', domains:['local-government','infrastructure','planning','transport','environment'], sourceUrl:'https://data.gov.ie/dataset', license:'Varies per local authority dataset', updateCadence:'varies', geography:'Local authority areas', temporalCoverage:'varies', formats:['CSV','GeoJSON','SHP','API'], description:'Public lighting, crossings, traffic signals, roadworks, parking, drainage, active travel and civic assets where published.', provenanceNotes:['Coverage is uneven; missingness is a first-class output.'] }
];

type CkanPackage = { name:string; title?:string; notes?:string; license_title?:string; license_id?:string; metadata_modified?:string; organization?:{title?:string; name?:string}; groups?:{name?:string; title?:string}[]; tags?:{name?:string}[]; resources?:{format?:string; url?:string}[] };
function inferDomains(pkg: CkanPackage): DatasetDomain[] {
  const hay = `${pkg.title ?? ''} ${pkg.notes ?? ''} ${pkg.groups?.map(g=>`${g.name} ${g.title}`).join(' ') ?? ''} ${pkg.tags?.map(t=>t.name).join(' ') ?? ''}`.toLowerCase();
  const hits = new Set<DatasetDomain>();
  const add = (d: DatasetDomain, words: string[]) => { if (words.some(w => hay.includes(w))) hits.add(d); };
  add('transport', ['transport','traffic','bus','rail','gtfs','cycle','cycling','journey','vehicle']);
  add('roads', ['road','roads','street','junction','speed','collision','traffic']);
  add('collisions', ['collision','collisions','casualty','casualties','accident','road safety']);
  add('planning', ['planning','zoning','development plan','land use']);
  add('environment', ['environment','flood','water','air','waste','biodiversity','noise']);
  add('weather', ['weather','rainfall','temperature','wind','forecast','climate']);
  add('demographics', ['population','census','demographic','household','commuting']);
  add('health', ['health','hospital','clinic','hse','ambulance']);
  add('education', ['school','education','student','university']);
  add('public-services', ['garda','fire','library','service','public']);
  add('infrastructure', ['infrastructure','lighting','water','energy','broadband','asset']);
  add('economy', ['economy','employment','business','enterprise','income']);
  add('housing', ['housing','dwelling','rent','homeless']);
  add('energy', ['energy','electricity','gas','emissions']);
  return [...hits].length ? [...hits] : ['local-government'];
}
async function fetchCkanDatasets(): Promise<Bundle['datasets']> {
  if (process.env.IPCG_OFFLINE === '1') return [];
  const out: Bundle['datasets'] = [];
  const rows = 100;
  for (let start = 0; start < 5000; start += rows) {
    const url = `https://data.gov.ie/api/3/action/package_search?rows=${rows}&start=${start}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`CKAN fetch failed ${res.status}`);
    const json: any = await res.json();
    const results: CkanPackage[] = json.result?.results ?? [];
    for (const pkg of results) {
      const formats = [...new Set((pkg.resources ?? []).map(r => (r.format || '').trim()).filter(Boolean))].slice(0, 12);
      out.push({
        id: `data-gov-ie:${pkg.name}`,
        title: pkg.title || pkg.name,
        publisher: pkg.organization?.title || pkg.organization?.name || 'Unknown publisher',
        domains: inferDomains(pkg),
        sourceUrl: `https://data.gov.ie/dataset/${pkg.name}`,
        license: pkg.license_title || pkg.license_id || 'Unspecified; verify source metadata',
        updateCadence: 'catalogue metadata; verify source',
        geography: 'Ireland / publisher-specific',
        temporalCoverage: pkg.metadata_modified ? `metadata modified ${pkg.metadata_modified}` : 'varies',
        formats: formats.length ? formats : ['metadata only'],
        description: (pkg.notes || 'Public dataset catalogue record.').replace(/\s+/g, ' ').slice(0, 700),
        provenanceNotes: ['Automatically discovered from data.gov.ie CKAN API.', 'Licence, freshness and field-level quality must be verified per source before downstream reuse.']
      });
    }
    if (start + rows >= Number(json.result?.count ?? 0) || results.length === 0) break;
  }
  return out;
}

let discovered: Bundle['datasets'] = [];
try { discovered = await fetchCkanDatasets(); } catch (err) { console.warn('CKAN discovery failed; using seed catalogue only:', err instanceof Error ? err.message : String(err)); }
const seen = new Set<string>();
const datasets = [...seedDatasets, ...discovered].filter(d => seen.has(d.id) ? false : (seen.add(d.id), true));
const entities: Bundle['entities'] = [
  { id:'country:ie', type:'country', name:'Ireland', datasetIds:['cso-statbank'], properties:{ iso2:'IE' } },
  { id:'catalog:data-gov-ie', type:'catalog', name:'data.gov.ie', datasetIds:['data-gov-ie-catalog'], properties:{ endpoint:'https://data.gov.ie/api/3/action/package_search', discoveredDatasetCount: discovered.length } },
  ...domains.map(d => ({ id:`domain:${d}`, type:'domain', name:d.replace('-', ' '), datasetIds:['data-gov-ie-catalog'], properties:{} })),
  ...datasets.map(d => ({ id:`dataset:${d.id}`, type:'dataset', name:d.title, datasetIds:[d.id], properties:{ publisher:d.publisher, formats:d.formats, updateCadence:d.updateCadence, sourceUrl:d.sourceUrl } }))
];
const relationships: Bundle['relationships'] = [];
for (const ds of datasets) for (const domain of ds.domains) relationships.push({ id:`rel:${ds.id}:domain:${domain}`, subject:`dataset:${ds.id}`, predicate:'belongs_to_domain', object:`domain:${domain}`, datasetIds:[ds.id], confidence:'source', evidence:'Dataset catalogue domain classification' });
relationships.push({ id:'rel:catalog:indexes-country', subject:'catalog:data-gov-ie', predicate:'indexes_public_data_for', object:'country:ie', datasetIds:['data-gov-ie-catalog'], confidence:'source' });
const observations: Bundle['observations'] = [
  { id:'obs:seed-dataset-count', entityId:'country:ie', metric:'dataset_count', value:datasets.length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:discovered-data-gov-ie-count', entityId:'catalog:data-gov-ie', metric:'discovered_dataset_count', value:discovered.length, unit:'datasets', timeStart:now, datasetId:'data-gov-ie-catalog' },
  { id:'obs:domain-count', entityId:'country:ie', metric:'domain_count', value:domains.length, unit:'domains', timeStart:now, datasetId:'data-gov-ie-catalog' }
];
const bundle = ContextBundle.parse({ generatedAt:now, version:now.slice(0,10), datasets, entities, relationships, observations, disclaimers:[...CLAIM_BOUNDARY] });
const out=resolve('dist/public-data'); mkdirSync(out,{recursive:true});
const web=resolve('../apps/web/public/data'); mkdirSync(web,{recursive:true});
for (const [name, data] of Object.entries({ 'context-bundle.json':bundle, 'dataset-catalog.json':bundle.datasets, 'entities.json':bundle.entities, 'relationships.json':bundle.relationships, 'observations.json':bundle.observations, 'manifest.json':{version:bundle.version,generatedAt:bundle.generatedAt,files:['context-bundle.json','dataset-catalog.json','entities.json','relationships.json','observations.json'], discoveredFromDataGovIe:discovered.length} })) {
  const json=JSON.stringify(data,null,2); writeFileSync(resolve(out,name),json); writeFileSync(resolve(web,name),json);
}
console.log(`Generated ${datasets.length} datasets (${discovered.length} from data.gov.ie), ${entities.length} entities, ${relationships.length} relationships`);
