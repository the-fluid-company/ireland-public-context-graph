import { Hono } from 'hono';
import { normalizeSearch, type ContextBundle, type Dataset, type SourceRecord, type CoverageReport, type LayerManifest } from '@ipcg/shared';
import { seedBundle } from './seed-data';

type Env = { DATA_BASE_URL?: string; ARTIFACT_BASE_URL?: string; SERVICE_NAME?: string; SERVICE_VERSION?: string; CONTEXT_DB?: D1Database; DATA_BUCKET?: R2Bucket; CONTEXT_KV?: KVNamespace };
type SearchRow = Pick<Dataset, 'id'|'title'|'publisher'|'domains'|'formats'|'sourceUrl'|'license'|'description'|'quality'> & { resourceCount:number; text:string };
type GraphIndex = { generatedAt:string; nodes:number; edges:number; entityTypes:Record<string,number>; relationshipTypes:Record<string,number>; domains:Record<string,number> };
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
  { name:'get_export_links', description:'Return download links for static data artifacts.', inputSchema:{ type:'object', properties:{} } }
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

async function callTool(name: string, args: any, env: Env) {
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
  if (name === 'get_layer_manifest') {
    const loaded = await loadLayerManifest(env);
    const fallbackDomains = [...new Set(b.datasets.flatMap(d => d.domains))];
    const manifest = loaded ?? { generatedAt:b.generatedAt, layers:fallbackDomains.map(domain => ({ id:`layer:${domain}`, title:`${domain.replace('-', ' ')} public context layer`, domain, description:`Fallback layer generated from seed bundle for ${domain.replace('-', ' ')}.`, entityIds:[`domain:${domain}`], datasetIds:b.datasets.filter(d => d.domains.includes(domain as any)).map(d => d.id), relationshipPredicates:['belongs_to_domain','published_by'], formats:[...new Set(b.datasets.filter(d => d.domains.includes(domain as any)).flatMap(d => d.formats))], geometryStatus:'metadata-only' as const, caveats:['Full layer-manifest.json artifact was not available; using seed bundle fallback.'] })) };
    return { layerManifest: args?.domain ? { ...manifest, layers: manifest.layers.filter(l => l.domain === args.domain || l.id === `layer:${args.domain}`) } : manifest, disclaimers:claim(b.disclaimers) };
  }
  if (name === 'find_related_datasets') return findRelatedDatasets(args, env);
  if (name === 'get_entity_neighborhood') { const limit = pageLimit(args, 200, 1000); const center = b.entities.find(e => e.id === args.entity_id) ?? null; const relationships = b.relationships.filter(r => (r.subject === args.entity_id || r.object === args.entity_id) && (!args.predicate || r.predicate === args.predicate)).slice(0, limit); const ids = new Set([args.entity_id, ...relationships.flatMap(r => [r.subject, r.object])]); return { center, entities:b.entities.filter(e => ids.has(e.id)), relationships, observations:b.observations.filter(o => ids.has(o.entityId)), disclaimers:claim(b.disclaimers) }; }
  if (name === 'get_export_links') { const base = env.ARTIFACT_BASE_URL || 'https://ireland-public-context-graph-mcp.amreshtech.workers.dev/artifacts'; const files = ['context-bundle.json','dataset-catalog.json','source-records.json','coverage-report.json','search-index.json','entities.json','relationships.json','observations.json','graph-index.json','layer-manifest.json','publishers.json','manifest.json']; return { links: files.map(f => ({ name:f, url:`${base}/${f}` })), disclaimers:claim(b.disclaimers) }; }
  throw new Error(`Unknown tool: ${name}`);
}

app.get('/', c => c.json({ name:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph', version:c.env.SERVICE_VERSION ?? '0.1.0', endpoints:['/health','/mcp','/api/search','/api/datasets/:id','/api/entities/:id','/api/context','/api/layers','/api/related/:dataset_id','/api/coverage','/api/exports'], claimBoundary:'data/context only; no conclusions' }));
app.get('/health', c => c.json({ ok:true, service:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph' }));
app.get('/api/search', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), publisher:c.req.query('publisher'), format:c.req.query('format'), limit:c.req.query('limit') ?? 50, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), limit:c.req.query('limit') ?? 100, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets/:id', async c => c.json(await callTool('get_dataset_metadata', { dataset_id:c.req.param('id') }, c.env)));
app.get('/api/sources', async c => c.json(await callTool('get_source_records', { query:c.req.query('q'), dataset_id:c.req.query('dataset_id'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities', async c => c.json(await callTool('search_entities', { query:c.req.query('q') ?? 'ireland', type:c.req.query('type'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities/:id', async c => c.json(await callTool('get_entity', { entity_id:c.req.param('id') }, c.env)));
app.get('/api/context', async c => c.json(await callTool('get_context_graph', { query:c.req.query('q') ?? 'ireland', limit:c.req.query('limit') ?? 10 }, c.env)));
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
