import { Hono } from 'hono';
import { normalizeSearch, type ContextBundle, type Dataset, type SourceRecord, type CoverageReport, type LayerManifest } from '@ipcg/shared';
import { seedBundle } from './seed-data';

type Env = { DATA_BASE_URL?: string; ARTIFACT_BASE_URL?: string; SERVICE_NAME?: string; SERVICE_VERSION?: string; CONTEXT_DB?: D1Database; DATA_BUCKET?: R2Bucket; CONTEXT_KV?: KVNamespace };
type SearchRow = Pick<Dataset, 'id'|'title'|'publisher'|'domains'|'formats'|'sourceUrl'|'license'|'description'|'quality'> & { resourceCount:number; text:string };
type GraphIndex = { generatedAt:string; nodes:number; edges:number; entityTypes:Record<string,number>; relationshipTypes:Record<string,number>; domains:Record<string,number> };
type BrainIndex = { generatedAt:string; purpose:string; issueCount:number; factorCount:number; evidenceEdgeCount:number; issues:any[]; factorEdges:any[]; questionIndex:any[]; learningLoop:string[]; architecture?:Record<string, unknown> };
type RealWorldGraph = { generatedAt:string; version:string; purpose:string; nodes:any[]; relationships:any[]; counts:{ nodes:number; relationships:number; nodeTypes:Record<string,number>; relationshipTypes:Record<string,number> }; caveats:string[] };
type DerivedFact = { id:string; title:string; finding:string; evidence:string[]; metric:Record<string, string | number | boolean>; caveat:string };
type ForecastReadiness = { generatedAt:string; version:string; purpose:string; requiredAccuracy:number; claimStatus:string; capabilities:any[]; benchmarkGates:string[]; caveats:string[] };
type SourceRegistryEntry = { id:string; name:string; url:string; owner:string; sourceType:string; domains:string[]; geography:string; accessMethod:string; license:string; updateFrequency:string; parserStatus:string; reliabilityScore:number; lastChecked:string; lastIngested:string | null; caveats:string[]; agentTasks:string[] };
type RelatedDataset = Pick<Dataset, 'id'|'title'|'publisher'|'domains'|'formats'|'sourceUrl'|'license'|'description'|'quality'> & { score:number; reasons:string[] };

const app = new Hono<{ Bindings: Env }>();
app.use('*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'content-type, accept, authorization, mcp-session-id');
  c.header('Access-Control-Expose-Headers', 'mcp-session-id');
});
app.options('*', c => new Response(null, { status: 204 }));

const cache = new Map<string, unknown>();
async function loadJson<T>(env: Env, file: string, fallback: T): Promise<T> {
  if (cache.has(file)) return cache.get(file) as T;
  if (env.DATA_BUCKET) {
    const obj = await env.DATA_BUCKET.get(`releases/latest/${file}`);
    if (obj) { const value = await obj.json<T>(); cache.set(file, value); return value; }
  }
  if (env.DATA_BASE_URL) {
    try { const res = await fetch(`${env.DATA_BASE_URL}/${file}`, { cf: { cacheTtl: 300 } as RequestInitCfProperties }); if (res.ok) { const value = await res.json<T>(); cache.set(file, value); return value; } } catch {}
  }
  cache.set(file, fallback); return fallback;
}
async function loadBundle(env: Env): Promise<ContextBundle> { return loadJson(env, 'context-bundle.json', seedBundle as ContextBundle); }
async function loadDatasets(env: Env): Promise<Dataset[]> { return loadJson(env, 'dataset-catalog.json', seedBundle.datasets as Dataset[]); }
async function loadSearch(env: Env): Promise<SearchRow[]> { return loadJson(env, 'search-index.json', seedBundle.datasets.map(d => ({...d, resourceCount:0, text:`${d.title} ${d.publisher} ${d.description}`.toLowerCase()})) as SearchRow[]); }
async function loadSources(env: Env): Promise<SourceRecord[]> { return loadJson(env, 'source-records.json', [] as SourceRecord[]); }
async function loadCoverage(env: Env): Promise<CoverageReport | undefined> { return loadJson(env, 'coverage-report.json', undefined as CoverageReport | undefined); }
async function loadGraphIndex(env: Env): Promise<GraphIndex | undefined> { return loadJson(env, 'graph-index.json', undefined as GraphIndex | undefined); }
async function loadLayerManifest(env: Env): Promise<LayerManifest | undefined> { return loadJson(env, 'layer-manifest.json', undefined as LayerManifest | undefined); }
async function loadBrainIndex(env: Env): Promise<BrainIndex | undefined> { return loadJson(env, 'brain-index.json', undefined as BrainIndex | undefined); }
function fallbackDerivedFacts(): DerivedFact[] {
  return [
    { id:'fact:fallback-catalog', title:'Seed graph connects public data domains', finding:'The fallback bundle connects national catalog, weather, flood, transport, roads, collisions, demographics and services metadata.', evidence:['seed-data'], metric:{ seedDatasetCount:seedBundle.datasets.length }, caveat:'Deploy generated derived-facts.json for full catalogue facts.' },
    { id:'fact:fallback-flood', title:'Flood context needs rainfall, rivers and terrain', finding:'Flood questions require linked rainfall, hydrometric, terrain, land-cover and drainage evidence.', evidence:['seed-data'], metric:{ requiredSignals:5 }, caveat:'Fallback fact is a readiness statement, not a prediction.' },
    { id:'fact:fallback-roads', title:'Road-condition context needs weather and road labels', finding:'Slippery-road forecasting needs surface weather joined to road network and incident or road-surface validation labels.', evidence:['seed-data'], metric:{ requiredSignals:3 }, caveat:'No 99% accuracy is claimed.' },
    { id:'fact:fallback-harvest', title:'Harvest context is cross-domain', finding:'Bad-harvest forecasting needs growing-season weather, soil/land context and crop outcome labels.', evidence:['seed-data'], metric:{ requiredSignals:3 }, caveat:'Crop-yield labels are required for scoring.' },
    { id:'fact:fallback-licence', title:'Licensing remains a graph property', finding:'Source licences and reuse caveats are carried with dataset metadata.', evidence:['seed-data'], metric:{ hasLicenceMetadata:true }, caveat:'Verify source-level terms before reuse.' },
    { id:'fact:fallback-machine-readable', title:'Automation depends on machine-readable sources', finding:'The graph separates datasets, resources and formats so ingestion can prioritize machine-readable sources.', evidence:['seed-data'], metric:{ formatAware:true }, caveat:'Format metadata does not guarantee schema stability.' },
    { id:'fact:fallback-geospatial', title:'Spatial joins need validated geometry', finding:'Geospatial candidate datasets are not treated as exact spatial joins until adapters validate geometry semantics.', evidence:['seed-data'], metric:{ geometryValidationRequired:true }, caveat:'Candidate status is not spatial proof.' },
    { id:'fact:fallback-temporal', title:'Freshness needs temporal signals', finding:'Update cadence and retrieval timestamps are part of provenance for self-updating releases.', evidence:['seed-data'], metric:{ temporalMetadata:true }, caveat:'Event-time fields are adapter-dependent.' },
    { id:'fact:fallback-services', title:'Service access needs transport and population context', finding:'Public service locations become more useful when linked to transport connectivity and demographics.', evidence:['seed-data'], metric:{ linkedDomains:3 }, caveat:'Access conclusions need travel-time adapters.' },
    { id:'fact:fallback-claim-boundary', title:'The graph is context, not conclusions', finding:'The claim boundary prevents public metadata links from becoming unsupported legal, safety or causal findings.', evidence:['seed-data'], metric:{ claimBoundary:true }, caveat:'External validated models may add conclusions outside this layer.' }
  ];
}
function fallbackForecastReadiness(): ForecastReadiness {
  const capability = (hazard: string, label: string) => ({ id:`forecast:${hazard}`, hazard, label, status:'benchmark-required', target:{ threshold:0.99, metric:'holdout event accuracy', window:'hazard-specific' }, current:{ accuracyClaimed:false, validatedAccuracy:null, benchmarkStatus:'generated forecast-readiness.json artifact unavailable; fallback contract only' }, evidenceSignals:[], modelPlan:['load generated forecast-readiness.json','run source-specific adapters','publish temporal holdout benchmark'], blockers:['benchmark artifact unavailable'] });
  return { generatedAt:seedBundle.generatedAt, version:'seed', purpose:'Fallback forecast readiness contract.', requiredAccuracy:0.99, claimStatus:'not-achieved', capabilities:[capability('flooding','Flooding forecast readiness'), capability('rainfall','Rainfall forecast readiness'), capability('bad-harvest','Bad-harvest forecast readiness'), capability('slippery-roads','Slippery-road forecast readiness')], benchmarkGates:['temporal holdout','validated labels','calibration report'], caveats:['Fallback readiness only. No 99% forecast accuracy is claimed.'] };
}
async function loadDerivedFacts(env: Env): Promise<DerivedFact[]> { return loadJson(env, 'derived-facts.json', fallbackDerivedFacts()); }
async function loadForecastReadiness(env: Env): Promise<ForecastReadiness | undefined> { return loadJson(env, 'forecast-readiness.json', fallbackForecastReadiness()); }
async function loadSourceRegistry(env: Env): Promise<SourceRegistryEntry[]> { return loadJson(env, 'source-registry.json', [] as SourceRegistryEntry[]); }
async function loadAgentControlPlane(env: Env): Promise<Record<string, unknown>> { return loadJson(env, 'agent-control-plane.json', { generatedAt:seedBundle.generatedAt, purpose:'Fallback agent control plane unavailable until generated artifact is deployed.', agents:[], loop:[], selfHealing:[] } as Record<string, unknown>); }
function fallbackRealWorldGraph(): RealWorldGraph {
  const nodes = [
    { id:'place:ireland', type:'place', label:'Ireland', description:'National coverage fallback place.', datasetIds:seedBundle.datasets.map(d=>d.id), domains:['transport','roads','public-services'] },
    { id:'asset:public-transport', type:'asset', label:'Public transport stops and routes', description:'Stops, routes and timetables.', datasetIds:['nta-gtfs'], domains:['transport'] },
    { id:'event:collision-events', type:'event', label:'Road collisions and casualties', description:'Historic collision and casualty context.', datasetIds:['rsa-collisions'], domains:['collisions','roads','transport'] },
    { id:'condition:population-need', type:'condition', label:'Population need and demographics', description:'Population and service need context.', datasetIds:['cso-statbank'], domains:['demographics','housing'] },
    { id:'agency:national-transport-authority', type:'agency', label:'National Transport Authority', description:'Public data publisher.', datasetIds:['nta-gtfs'], domains:['transport'] }
  ];
  const relationships = [
    { id:'rw:fallback:transport-place', subject:'asset:public-transport', predicate:'located_in', object:'place:ireland', datasetIds:['nta-gtfs'], confidence:'derived-medium', evidence:'Seed dataset geography.', caveats:['Fallback graph only.'] },
    { id:'rw:fallback:collisions-place', subject:'event:collision-events', predicate:'observed_in', object:'place:ireland', datasetIds:['rsa-collisions'], confidence:'derived-medium', evidence:'Seed dataset geography.', caveats:['Fallback graph only.'] },
    { id:'rw:fallback:population-spatial', subject:'condition:population-need', predicate:'can_be_joined_spatially_with', object:'place:ireland', datasetIds:['cso-statbank'], confidence:'derived-low', evidence:'Statistical geography can support joins after adapters.', caveats:['Fallback graph only.'] },
    { id:'rw:fallback:nta-describes', subject:'dataset:nta-gtfs', predicate:'describes', object:'asset:public-transport', datasetIds:['nta-gtfs'], confidence:'source', evidence:'Seed dataset description.', caveats:[] }
  ];
  return { generatedAt:seedBundle.generatedAt, version:'seed', purpose:'Fallback real-world graph connecting places, assets, conditions, events, agencies and datasets.', nodes, relationships, counts:{ nodes:nodes.length, relationships:relationships.length, nodeTypes:{ place:1, asset:1, event:1, condition:1, agency:1 }, relationshipTypes:{ located_in:1, observed_in:1, can_be_joined_spatially_with:1, describes:1 } }, caveats:['Fallback graph is small; deploy real-world-graph.json for full generated relationships.'] };
}
async function loadRealWorldGraph(env: Env): Promise<RealWorldGraph> { return loadJson(env, 'real-world-graph.json', fallbackRealWorldGraph()); }
function jsonRpc(id: unknown, result: unknown) { return { jsonrpc: '2.0', id, result }; }
function jsonRpcError(id: unknown, code: number, message: string) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function claim(disclaimers?: string[]) { return disclaimers ?? seedBundle.disclaimers; }
function pageLimit(args: any, fallback = 50, max = 500) { return Math.max(1, Math.min(Number(args?.limit ?? fallback), max)); }
function offset(args: any) { return Math.max(0, Number(args?.offset ?? 0)); }

function tools() { return [
  { name:'search_catalog', description:'Search all catalogued Irish public datasets. Returns evidence metadata only; no conclusions.', inputSchema:{ type:'object', properties:{ query:{ type:'string' }, domain:{ type:'string' }, publisher:{ type:'string' }, format:{ type:'string' }, limit:{ type:'number' }, offset:{ type:'number' } } } },
  { name:'list_datasets', description:'Alias for search_catalog with optional domain/query filters.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' }, query:{ type:'string' }, limit:{ type:'number' }, offset:{ type:'number' } } } },
  { name:'get_dataset_metadata', description:'Get metadata, resources, source links, licence notes and provenance for one dataset.', inputSchema:{ type:'object', properties:{ dataset_id:{ type:'string' } }, required:['dataset_id'] } },
  { name:'get_source_records', description:'Get source/provenance records for a dataset or query.', inputSchema:{ type:'object', properties:{ dataset_id:{ type:'string' }, query:{ type:'string' }, limit:{ type:'number' } } } },
  { name:'search_entities', description:'Search graph entities by text and optional entity type.', inputSchema:{ type:'object', properties:{ query:{ type:'string' }, type:{ type:'string' }, limit:{ type:'number' } }, required:['query'] } },
  { name:'get_entity', description:'Get one graph entity by ID.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' } }, required:['entity_id'] } },
  { name:'get_relationships', description:'Get graph relationships connected to an entity.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' }, predicate:{ type:'string' }, limit:{ type:'number' } }, required:['entity_id'] } },
  { name:'get_context_graph', description:'Get entities, relationships, observations, provenance and claim-boundary notes for entity IDs or a query. No conclusions are generated.', inputSchema:{ type:'object', properties:{ entity_ids:{ type:'array', items:{type:'string'} }, query:{ type:'string' }, limit:{ type:'number' } } } },
  { name:'get_data_coverage', description:'Return dataset/domain/source coverage and known missingness notes.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' } } } },
  { name:'get_graph_index', description:'Return graph-size and relationship/domain summaries.', inputSchema:{ type:'object', properties:{} } },
  { name:'get_layer_manifest', description:'Return public context layers, candidate geospatial joins, formats and caveats.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' } } } },
  { name:'find_related_datasets', description:'Find datasets related by shared domains, publisher, formats, geospatial readiness and graph relationships. Returns evidence only, not conclusions.', inputSchema:{ type:'object', properties:{ dataset_id:{ type:'string' }, limit:{ type:'number' } }, required:['dataset_id'] } },
  { name:'get_entity_neighborhood', description:'Return one-hop graph neighborhood around an entity with observations and provenance notes.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' }, predicate:{ type:'string' }, limit:{ type:'number' } }, required:['entity_id'] } },
  { name:'get_export_links', description:'Return download links for static data artifacts.', inputSchema:{ type:'object', properties:{} } },
  { name:'get_brain_index', description:'Return the public-context brain issue/factor index, learning loop and evidence-edge counts.', inputSchema:{ type:'object', properties:{} } },
  { name:'ask_public_context', description:'Match a plain-English civic question to issue factors, supporting datasets, evidence strength and missing evidence. Returns context only; no causal/legal/safety conclusions.', inputSchema:{ type:'object', properties:{ question:{ type:'string' }, place:{ type:'string' }, limit:{ type:'number' } }, required:['question'] } },
  { name:'find_contributing_factors', description:'Return candidate contributing/context factors for an issue such as flood, road safety, planning, public services, transport or health access.', inputSchema:{ type:'object', properties:{ issue:{ type:'string' }, place:{ type:'string' }, limit:{ type:'number' } }, required:['issue'] } },
  { name:'get_missing_evidence', description:'Return missing evidence and caveats for a public-context question or issue.', inputSchema:{ type:'object', properties:{ question:{ type:'string' }, issue:{ type:'string' } } } },
  { name:'get_real_world_graph', description:'Return the real-world intelligence graph linking places, assets, conditions, events, agencies, issues, factors and supporting public datasets. Context only; no conclusions.', inputSchema:{ type:'object', properties:{ query:{ type:'string' }, type:{ type:'string' }, limit:{ type:'number' } } } },
  { name:'search_real_world_entities', description:'Search real-world graph nodes such as places, roads, schools, services, conditions, events, factors and agencies.', inputSchema:{ type:'object', properties:{ query:{ type:'string' }, type:{ type:'string' }, limit:{ type:'number' } }, required:['query'] } },
  { name:'get_real_world_entity', description:'Get a real-world graph node and its direct relationships.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' }, limit:{ type:'number' } }, required:['entity_id'] } },
  { name:'get_derived_facts', description:'Return interesting derived facts uncovered by linking Irish public datasets. Facts include evidence and caveats.', inputSchema:{ type:'object', properties:{ limit:{ type:'number' } } } },
  { name:'get_forecast_readiness', description:'Return hazard forecast readiness, evidence signals, benchmark gates and current 99% accuracy claim status.', inputSchema:{ type:'object', properties:{ hazard:{ type:'string' } } } },
  { name:'get_source_registry', description:'Return Ireland source registry entries with ownership, access method, parser status, reliability, caveats and agent tasks.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' }, sourceType:{ type:'string' }, parserStatus:{ type:'string' }, limit:{ type:'number' } } } },
  { name:'get_agent_control_plane', description:'Return the self-driven agent loop, roles and self-healing policy for the Irish Public Brain.', inputSchema:{ type:'object', properties:{} } }
]; }

async function searchCatalog(args: any, env: Env) {
  const b = await loadBundle(env); const rows = await loadSearch(env); const q = args?.query ? normalizeSearch(String(args.query)) : '';
  const domain = args?.domain ? String(args.domain) : ''; const publisher = args?.publisher ? normalizeSearch(String(args.publisher)) : ''; const format = args?.format ? normalizeSearch(String(args.format)) : '';
  const filtered = rows.filter(d => (!q || normalizeSearch(d.text).includes(q)) && (!domain || d.domains.includes(domain as any)) && (!publisher || normalizeSearch(d.publisher).includes(publisher)) && (!format || d.formats.some(f => normalizeSearch(f).includes(format))));
  const start = offset(args); const limit = pageLimit(args, 50, 500);
  return { totalAvailable: rows.length, totalMatched: filtered.length, offset:start, limit, datasets: filtered.slice(start, start+limit).map(({text, ...d}) => d), disclaimers: claim(b.disclaimers) };
}


async function findRelatedDatasets(args: any, env: Env) {
  const b = await loadBundle(env); const datasets = await loadDatasets(env); const target = datasets.find(d => d.id === args.dataset_id);
  if (!target) return { dataset:null, related:[], disclaimers:claim(b.disclaimers) };
  const targetFormats = new Set(target.formats.map(f => normalizeSearch(f)));
  const targetDomains = new Set(target.domains);
  const rows: RelatedDataset[] = datasets.filter(d => d.id !== target.id).map(d => {
    const reasons: string[] = []; let score = 0;
    const sharedDomains = d.domains.filter(x => targetDomains.has(x));
    if (sharedDomains.length) { score += sharedDomains.length * 5; reasons.push(`shared domain: ${sharedDomains.join(', ')}`); }
    if ((d.publisherId || normalizeSearch(d.publisher)) === (target.publisherId || normalizeSearch(target.publisher))) { score += 4; reasons.push('same publisher'); }
    const sharedFormats = d.formats.filter(f => targetFormats.has(normalizeSearch(f))).slice(0,5);
    if (sharedFormats.length) { score += Math.min(sharedFormats.length, 3); reasons.push(`shared format: ${sharedFormats.join(', ')}`); }
    if (d.quality?.hasMachineReadableResource && target.quality?.hasMachineReadableResource) { score += 1; reasons.push('both machine-readable'); }
    if ((d as any).properties?.geospatialCandidate || d.formats.some(f => /geo|shp|kml|wms|wfs|arcgis/i.test(f))) { score += target.formats.some(f => /geo|shp|kml|wms|wfs|arcgis/i.test(f)) ? 2 : 0; if (target.formats.some(f => /geo|shp|kml|wms|wfs|arcgis/i.test(f))) reasons.push('both geospatial candidates'); }
    return { id:d.id, title:d.title, publisher:d.publisher, domains:d.domains, formats:d.formats, sourceUrl:d.sourceUrl, license:d.license, description:d.description, quality:d.quality, score, reasons };
  }).filter(r => r.score > 0).sort((a,b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, pageLimit(args, 25, 100));
  return { dataset:target, related:rows, caveat:'Relatedness is metadata-derived. Use source records and geospatial adapters before treating relationships as spatial or causal.', disclaimers:claim(b.disclaimers) };
}


function scoreIssue(issue: any, query: string): number {
  const q = normalizeSearch(query);
  const issueText = normalizeSearch(`${issue.id} ${issue.label} ${(issue.examples ?? []).join(' ')} ${(issue.factors ?? []).map((f:any)=>`${f.label} ${f.description} ${(f.keywords ?? []).join(' ')}`).join(' ')}`);
  let score = 0;
  for (const term of q.split(/[^a-z0-9-]+/).filter(Boolean)) if (issueText.includes(term)) score += term.length > 3 ? 3 : 1;
  if (issueText.includes(q)) score += 10;
  return score;
}
function trimIssue(issue: any, limit: number) {
  return { ...issue, factors:(issue.factors ?? []).slice(0, limit).map((f:any) => ({ ...f, evidenceDatasets:(f.evidenceDatasets ?? []).slice(0, Math.min(8, limit)) })) };
}
async function askPublicContext(args: any, env: Env) {
  const brain = await loadBrainIndex(env);
  if (!brain) return { question:args?.question ?? args?.issue ?? '', matchedIssue:null, factors:[], missingEvidence:['brain-index.json artifact unavailable'], disclaimers:claim() };
  const query = String(args?.question ?? args?.issue ?? '');
  const limit = pageLimit(args, 6, 20);
  const ranked = [...(brain.issues ?? [])].map(issue => ({ issue, score:scoreIssue(issue, query) })).sort((a,b)=>b.score-a.score);
  const first = ranked[0];
  const matched = first && first.score > 0 ? first.issue : (brain.issues?.[0] ?? null);
  if (!matched) return { question:query, matchedIssue:null, factors:[], missingEvidence:['No brain issues are indexed.'], disclaimers:claim() };
  const out = trimIssue(matched, limit);
  return { question:query, place:args?.place ?? null, matchedIssue:{ id:out.id, label:out.label, score:ranked[0]?.score ?? 0 }, factors:out.factors, missingEvidence:out.missingEvidence ?? [], evidenceEdgeCount:brain.factorEdges?.filter((e:any)=>e.issueId === out.id).length ?? 0, claimBoundary:'Candidate public-context factors and evidence links only. This is not a finding, causation assessment, legal opinion, safety determination or recommendation.', disclaimers:claim() };
}
async function missingEvidence(args: any, env: Env) {
  const answer = await askPublicContext({ question:args?.question ?? args?.issue ?? '', limit:20 }, env);
  return { issue:answer.matchedIssue, missingEvidence:answer.missingEvidence, factorCaveats:(answer.factors ?? []).map((f:any) => ({ factorId:f.id, label:f.label, strongestEvidence:f.strongestEvidence, missing:f.missing, requiredEvidence:f.requiredEvidence, missingIfAbsent:f.missingIfAbsent, caveats:[...(f.evidenceDatasets ?? []).flatMap((e:any)=>e.caveats ?? [])].slice(0,5) })), disclaimers:claim() };
}
function realWorldText(n: any) { return normalizeSearch(`${n.id} ${n.type} ${n.label ?? n.name ?? ''} ${n.description ?? ''} ${(n.domains ?? []).join(' ')}`); }
function trimRealWorldNode(n: any) { return { ...n, matchedDatasetCount:(n.datasetIds ?? []).length, datasetIds:(n.datasetIds ?? []).slice(0,20) }; }
async function realWorldGraph(args: any, env: Env) {
  const graph = await loadRealWorldGraph(env);
  const q = args?.query ? normalizeSearch(String(args.query)) : '';
  const type = args?.type ? String(args.type) : '';
  const limit = pageLimit(args, 100, 1000);
  const matched = graph.nodes.filter(n => (!q || realWorldText(n).includes(q)) && (!type || n.type === type)).slice(0, limit);
  const ids = new Set(matched.map(n => n.id));
  const relationships = graph.relationships.filter(r => ids.has(r.subject) || ids.has(r.object)).slice(0, Math.min(limit * 10, 5000));
  for (const r of relationships) { ids.add(r.subject); ids.add(r.object); }
  return { graph:{ ...graph, nodes:graph.nodes.filter(n => ids.has(n.id)).slice(0, limit * 2).map(trimRealWorldNode), relationships }, claimBoundary:'Real-world relationships are candidate public-context links, not an official conclusion, causation finding, safety determination or recommendation.', disclaimers:claim() };
}
async function searchRealWorldEntities(args: any, env: Env) {
  const graph = await loadRealWorldGraph(env);
  const q = normalizeSearch(String(args?.query ?? ''));
  const type = args?.type ? String(args.type) : '';
  const limit = pageLimit(args, 50, 500);
  return { entities:graph.nodes.filter(n => (!q || realWorldText(n).includes(q)) && (!type || n.type === type)).slice(0, limit).map(trimRealWorldNode), counts:graph.counts, caveats:graph.caveats, disclaimers:claim() };
}
async function getRealWorldEntity(args: any, env: Env) {
  const graph = await loadRealWorldGraph(env);
  const limit = pageLimit(args, 100, 1000);
  const entity = graph.nodes.find(n => n.id === args?.entity_id) ?? null;
  const relationships = graph.relationships.filter(r => r.subject === args?.entity_id || r.object === args?.entity_id).slice(0, limit);
  const ids = new Set([args?.entity_id, ...relationships.flatMap(r => [r.subject, r.object])]);
  return { entity:entity ? trimRealWorldNode(entity) : null, neighbors:graph.nodes.filter(n => ids.has(n.id) && n.id !== args?.entity_id).map(trimRealWorldNode), relationships, caveats:graph.caveats, disclaimers:claim() };
}
async function getDerivedFacts(args: any, env: Env) {
  const facts = await loadDerivedFacts(env);
  return { generatedAt:facts[0] ? undefined : null, count:facts.length, facts:facts.slice(0, pageLimit(args, 25, 100)), claimBoundary:'Derived facts are computed from public metadata and graph artifacts with caveats; they are not official conclusions.', disclaimers:claim() };
}
async function getForecastReadiness(args: any, env: Env) {
  const readiness = await loadForecastReadiness(env);
  if (!readiness) return { forecastReadiness:null, missing:['forecast-readiness.json artifact unavailable'], disclaimers:claim() };
  const hazard = args?.hazard ? String(args.hazard) : '';
  const capabilities = hazard ? readiness.capabilities.filter((c:any) => c.hazard === hazard || c.id === `forecast:${hazard}`) : readiness.capabilities;
  return { forecastReadiness:{ ...readiness, capabilities }, claimBoundary:'No 99% forecast accuracy is claimed unless validatedAccuracy and benchmark gates prove it.', disclaimers:claim() };
}
async function getSourceRegistry(args: any, env: Env) {
  const rows = await loadSourceRegistry(env);
  const domain = args?.domain ? String(args.domain) : '';
  const sourceType = args?.sourceType ? String(args.sourceType) : '';
  const parserStatus = args?.parserStatus ? String(args.parserStatus) : '';
  const filtered = rows.filter(r => (!domain || r.domains.includes(domain)) && (!sourceType || r.sourceType === sourceType) && (!parserStatus || r.parserStatus === parserStatus));
  return { generatedAt:rows[0]?.lastChecked ?? null, count:filtered.length, sources:filtered.slice(0, pageLimit(args, 100, 500)), claimBoundary:'Source registry is a discovery and ingestion-control surface. Verify source terms before use.', disclaimers:claim() };
}
async function getAgentControlPlane(_args: any, env: Env) {
  return { controlPlane:await loadAgentControlPlane(env), claimBoundary:'Agentic loops propose, test and publish evidence-backed artifacts only; no invented facts or official conclusions.', disclaimers:claim() };
}

async function callTool(name: string, args: any, env: Env) {
  if (name === 'get_real_world_graph') return realWorldGraph(args, env);
  if (name === 'search_real_world_entities') return searchRealWorldEntities(args, env);
  if (name === 'get_real_world_entity') return getRealWorldEntity(args, env);
  if (name === 'get_derived_facts') return getDerivedFacts(args, env);
  if (name === 'get_forecast_readiness') return getForecastReadiness(args, env);
  if (name === 'get_source_registry') return getSourceRegistry(args, env);
  if (name === 'get_agent_control_plane') return getAgentControlPlane(args, env);
  const b = await loadBundle(env);
  if (name === 'search_catalog' || name === 'list_datasets') return searchCatalog(args, env);
  if (name === 'get_dataset_metadata') { const datasets = await loadDatasets(env); const dataset = datasets.find(d => d.id === args.dataset_id) ?? null; return { dataset, sourceRecord:(await loadSources(env)).find(s => s.datasetId === args.dataset_id) ?? null, disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_source_records') { const sources = await loadSources(env); const q = args?.query ? normalizeSearch(String(args.query)) : ''; const out = sources.filter(s => (!args?.dataset_id || s.datasetId === args.dataset_id) && (!q || normalizeSearch(`${s.datasetId} ${s.publisher} ${s.sourceUrl} ${s.formats.join(' ')}`).includes(q))).slice(0, pageLimit(args, 50, 500)); return { sourceRecords:out, totalAvailable:sources.length, disclaimers:claim(b.disclaimers) }; }
  if (name === 'search_entities') { const q = normalizeSearch(String(args.query)); const limit = pageLimit(args, 25, 200); return { entities: b.entities.filter(e => normalizeSearch(`${e.id} ${e.name} ${e.type}`).includes(q) && (!args.type || e.type === args.type)).slice(0, limit), disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_entity') return { entity: b.entities.find(e => e.id === args.entity_id) ?? null, observations: b.observations.filter(o => o.entityId === args.entity_id), disclaimers:claim(b.disclaimers) };
  if (name === 'get_relationships') { const limit = pageLimit(args, 200, 1000); const rels = b.relationships.filter(r => (r.subject === args.entity_id || r.object === args.entity_id) && (!args.predicate || r.predicate === args.predicate)); return { totalMatched:rels.length, relationships:rels.slice(0,limit), disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_context_graph') {
    const ids = new Set<string>(args?.entity_ids ?? []); const entityLimit = pageLimit(args, 10, 100);
    if (args?.query) for (const e of b.entities.filter(e => normalizeSearch(`${e.id} ${e.name} ${e.type}`).includes(normalizeSearch(String(args.query)))).slice(0, entityLimit)) ids.add(e.id);
    const rels = b.relationships.filter(r => ids.has(r.subject) || ids.has(r.object)).slice(0, 2000); for (const r of rels) { ids.add(r.subject); ids.add(r.object); }
    return { entities:b.entities.filter(e => ids.has(e.id)).slice(0,1000), relationships:rels, observations:b.observations.filter(o => ids.has(o.entityId)), graphIndex:await loadGraphIndex(env), disclaimers:claim(b.disclaimers) };
  }
  if (name === 'get_data_coverage') { const coverage = await loadCoverage(env); if (!coverage) return { generatedAt:b.generatedAt, datasetCount:b.datasets.length, missingness:[{ scope:'runtime', note:'Full coverage-report.json artifact was not available; using seed bundle fallback.', impact:'Coverage is incomplete until data artifacts are loaded from R2 or Pages.' }], disclaimers:claim(b.disclaimers) }; return { ...coverage, disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_graph_index') return { graphIndex:await loadGraphIndex(env), disclaimers:claim(b.disclaimers) };
  if (name === 'get_brain_index') return { brainIndex:await loadBrainIndex(env), disclaimers:claim(b.disclaimers) };
  if (name === 'ask_public_context') return askPublicContext(args, env);
  if (name === 'find_contributing_factors') return askPublicContext({ question:args?.issue, place:args?.place, limit:args?.limit }, env);
  if (name === 'get_missing_evidence') return missingEvidence(args, env);
  if (name === 'get_real_world_graph') return realWorldGraph(args, env);
  if (name === 'search_real_world_entities') return searchRealWorldEntities(args, env);
  if (name === 'get_real_world_entity') return getRealWorldEntity(args, env);
  if (name === 'get_derived_facts') return getDerivedFacts(args, env);
  if (name === 'get_forecast_readiness') return getForecastReadiness(args, env);
  if (name === 'get_source_registry') return getSourceRegistry(args, env);
  if (name === 'get_agent_control_plane') return getAgentControlPlane(args, env);
  if (name === 'get_layer_manifest') {
    const loaded = await loadLayerManifest(env);
    const fallbackDomains = [...new Set(b.datasets.flatMap(d => d.domains))];
    const manifest = loaded ?? { generatedAt:b.generatedAt, layers:fallbackDomains.map(domain => ({ id:`layer:${domain}`, title:`${domain.replace('-', ' ')} public context layer`, domain, description:`Fallback layer generated from seed bundle for ${domain.replace('-', ' ')}.`, entityIds:[`domain:${domain}`], datasetIds:b.datasets.filter(d => d.domains.includes(domain as any)).map(d => d.id), relationshipPredicates:['belongs_to_domain','published_by'], formats:[...new Set(b.datasets.filter(d => d.domains.includes(domain as any)).flatMap(d => d.formats))], geometryStatus:'metadata-only' as const, caveats:['Full layer-manifest.json artifact was not available; using seed bundle fallback.'] })) };
    return { layerManifest: args?.domain ? { ...manifest, layers: manifest.layers.filter(l => l.domain === args.domain || l.id === `layer:${args.domain}`) } : manifest, disclaimers:claim(b.disclaimers) };
  }
  if (name === 'find_related_datasets') return findRelatedDatasets(args, env);
  if (name === 'get_entity_neighborhood') { const limit = pageLimit(args, 200, 1000); const center = b.entities.find(e => e.id === args.entity_id) ?? null; const relationships = b.relationships.filter(r => (r.subject === args.entity_id || r.object === args.entity_id) && (!args.predicate || r.predicate === args.predicate)).slice(0, limit); const ids = new Set([args.entity_id, ...relationships.flatMap(r => [r.subject, r.object])]); return { center, entities:b.entities.filter(e => ids.has(e.id)), relationships, observations:b.observations.filter(o => ids.has(o.entityId)), disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_export_links') { const base = env.ARTIFACT_BASE_URL || 'https://ireland-public-context-graph-mcp.amreshtech.workers.dev/artifacts'; const files = ['context-bundle.json','dataset-catalog.json','source-records.json','coverage-report.json','search-index.json','entities.json','relationships.json','observations.json','graph-index.json','layer-manifest.json','publishers.json','brain-index.json','real-world-graph.json','real-world-graph-full.json','derived-facts.json','forecast-readiness.json','source-registry.json','agent-control-plane.json','manifest.json']; return { links: files.map(f => ({ name:f, url:`${base}/${f}` })), disclaimers:claim(b.disclaimers) }; }
  throw new Error(`Unknown tool: ${name}`);
}

app.get('/', c => c.json({ name:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph', version:c.env.SERVICE_VERSION ?? '0.1.0', endpoints:['/health','/mcp','/api/search','/api/datasets/:id','/api/entities/:id','/api/context','/api/brain','/api/ask','/api/factors','/api/missing-evidence','/api/real-world-graph','/api/real-world-entities','/api/derived-facts','/api/forecast-readiness','/api/source-registry','/api/agent-control-plane','/api/layers','/api/related/:dataset_id','/api/coverage','/api/exports'], claimBoundary:'data/context only; no conclusions' }));
app.get('/health', c => c.json({ ok:true, service:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph' }));
app.get('/api/search', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), publisher:c.req.query('publisher'), format:c.req.query('format'), limit:c.req.query('limit') ?? 50, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), limit:c.req.query('limit') ?? 100, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets/:id', async c => c.json(await callTool('get_dataset_metadata', { dataset_id:c.req.param('id') }, c.env)));
app.get('/api/sources', async c => c.json(await callTool('get_source_records', { query:c.req.query('q'), dataset_id:c.req.query('dataset_id'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities', async c => c.json(await callTool('search_entities', { query:c.req.query('q') ?? 'ireland', type:c.req.query('type'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities/:id', async c => c.json(await callTool('get_entity', { entity_id:c.req.param('id') }, c.env)));
app.get('/api/context', async c => c.json(await callTool('get_context_graph', { query:c.req.query('q') ?? 'ireland', limit:c.req.query('limit') ?? 10 }, c.env)));
app.get('/api/brain', async c => c.json(await callTool('get_brain_index', {}, c.env)));
app.get('/api/ask', async c => c.json(await callTool('ask_public_context', { question:c.req.query('q') ?? 'What public context is connected?', place:c.req.query('place'), limit:c.req.query('limit') ?? 6 }, c.env)));
app.get('/api/factors', async c => c.json(await callTool('find_contributing_factors', { issue:c.req.query('issue') ?? c.req.query('q') ?? 'flood', place:c.req.query('place'), limit:c.req.query('limit') ?? 8 }, c.env)));
app.get('/api/missing-evidence', async c => c.json(await callTool('get_missing_evidence', { question:c.req.query('q'), issue:c.req.query('issue') }, c.env)));
app.get('/api/real-world-graph', async c => c.json(await callTool('get_real_world_graph', { query:c.req.query('q'), type:c.req.query('type'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/real-world-entities', async c => c.json(await callTool('search_real_world_entities', { query:c.req.query('q') ?? '', type:c.req.query('type'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/real-world-entities/:id', async c => c.json(await callTool('get_real_world_entity', { entity_id:c.req.param('id'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/derived-facts', async c => c.json(await callTool('get_derived_facts', { limit:c.req.query('limit') ?? 25 }, c.env)));
app.get('/api/forecast-readiness', async c => c.json(await callTool('get_forecast_readiness', { hazard:c.req.query('hazard') }, c.env)));
app.get('/api/source-registry', async c => c.json(await callTool('get_source_registry', { domain:c.req.query('domain'), sourceType:c.req.query('sourceType'), parserStatus:c.req.query('parserStatus'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/agent-control-plane', async c => c.json(await callTool('get_agent_control_plane', {}, c.env)));
app.get('/api/layers', async c => c.json(await callTool('get_layer_manifest', { domain:c.req.query('domain') }, c.env)));
app.get('/api/related/:dataset_id', async c => c.json(await callTool('find_related_datasets', { dataset_id:c.req.param('dataset_id'), limit:c.req.query('limit') ?? 25 }, c.env)));
app.get('/api/coverage', async c => c.json(await callTool('get_data_coverage', {}, c.env)));
app.get('/api/exports', async c => c.json(await callTool('get_export_links', {}, c.env)));
app.get('/artifacts/:file', async c => {
  const file = c.req.param('file');
  if (!/^[a-z0-9-]+\.json$/.test(file)) return c.json({ error:'invalid artifact name' }, 400);
  if (c.env.DATA_BUCKET) {
    const obj = await c.env.DATA_BUCKET.get(`releases/latest/${file}`);
    if (obj) return new Response(obj.body, { headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'public, max-age=300' } });
  }
  if (c.env.DATA_BASE_URL) return Response.redirect(`${c.env.DATA_BASE_URL}/${file}`, 302);
  return c.json({ error:'artifact not found' }, 404);
});
app.get('/mcp', c => c.json({ protocol:'MCP Streamable HTTP JSON-RPC endpoint', transport:'streamable-http', methods:['initialize','tools/list','tools/call'], claimBoundary:'data-only; no conclusions' }));
app.post('/mcp', async c => {
  const req = await c.req.json<any>();
  try { if (Array.isArray(req)) return c.json(await Promise.all(req.map(async r => handleRpc(r, c.env)))); return c.json(await handleRpc(req, c.env)); }
  catch (err) { return c.json(jsonRpcError(req?.id ?? null, -32603, err instanceof Error ? err.message : 'Internal error'), 500); }
});
async function handleRpc(req: any, env: Env) {
  if (req.method === 'initialize') return jsonRpc(req.id, { protocolVersion:'2024-11-05', capabilities:{ tools:{} }, serverInfo:{ name:'ireland-public-context-graph', version:'0.2.0' } });
  if (req.method === 'notifications/initialized') return jsonRpc(req.id ?? null, {});
  if (req.method === 'tools/list') return jsonRpc(req.id, { tools: tools() });
  if (req.method === 'tools/call') { const result = await callTool(req.params?.name, req.params?.arguments ?? {}, env); return jsonRpc(req.id, { content:[{ type:'text', text:JSON.stringify(result, null, 2) }] }); }
  return jsonRpcError(req.id, -32601, `Method not found: ${req.method}`);
}
export default app;
