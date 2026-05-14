import { Hono } from 'hono';
import { normalizeSearch, type ContextBundle, type Dataset, type SourceRecord, type CoverageReport } from '@ipcg/shared';
import { seedBundle } from './seed-data';

type Env = { DATA_BASE_URL?: string; ARTIFACT_BASE_URL?: string; SERVICE_NAME?: string; SERVICE_VERSION?: string; CONTEXT_DB?: D1Database; DATA_BUCKET?: R2Bucket; CONTEXT_KV?: KVNamespace };
type SearchRow = Pick<Dataset, 'id'|'title'|'publisher'|'domains'|'formats'|'sourceUrl'|'license'|'description'|'quality'> & { resourceCount:number; text:string };
type GraphIndex = { generatedAt:string; nodes:number; edges:number; entityTypes:Record<string,number>; relationshipTypes:Record<string,number>; domains:Record<string,number> };

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
  { name:'get_export_links', description:'Return download links for static data artifacts.', inputSchema:{ type:'object', properties:{} } }
]; }

async function searchCatalog(args: any, env: Env) {
  const b = await loadBundle(env); const rows = await loadSearch(env); const q = args?.query ? normalizeSearch(String(args.query)) : '';
  const domain = args?.domain ? String(args.domain) : ''; const publisher = args?.publisher ? normalizeSearch(String(args.publisher)) : ''; const format = args?.format ? normalizeSearch(String(args.format)) : '';
  const filtered = rows.filter(d => (!q || normalizeSearch(d.text).includes(q)) && (!domain || d.domains.includes(domain as any)) && (!publisher || normalizeSearch(d.publisher).includes(publisher)) && (!format || d.formats.some(f => normalizeSearch(f).includes(format))));
  const start = offset(args); const limit = pageLimit(args, 50, 500);
  return { totalAvailable: rows.length, totalMatched: filtered.length, offset:start, limit, datasets: filtered.slice(start, start+limit).map(({text, ...d}) => d), disclaimers: claim(b.disclaimers) };
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
  if (name === 'get_export_links') { const base = env.ARTIFACT_BASE_URL || 'https://ireland-public-context-graph-mcp.amreshtech.workers.dev/artifacts'; const files = ['context-bundle.json','dataset-catalog.json','source-records.json','coverage-report.json','search-index.json','entities.json','relationships.json','observations.json','graph-index.json','publishers.json','manifest.json']; return { links: files.map(f => ({ name:f, url:`${base}/${f}` })), disclaimers:claim(b.disclaimers) }; }
  throw new Error(`Unknown tool: ${name}`);
}

app.get('/', c => c.json({ name:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph', version:c.env.SERVICE_VERSION ?? '0.1.0', endpoints:['/health','/mcp','/api/search','/api/datasets/:id','/api/entities/:id','/api/context','/api/coverage','/api/exports'], claimBoundary:'data/context only; no conclusions' }));
app.get('/health', c => c.json({ ok:true, service:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph' }));
app.get('/api/search', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), publisher:c.req.query('publisher'), format:c.req.query('format'), limit:c.req.query('limit') ?? 50, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets', async c => c.json(await searchCatalog({ query:c.req.query('q'), domain:c.req.query('domain'), limit:c.req.query('limit') ?? 100, offset:c.req.query('offset') ?? 0 }, c.env)));
app.get('/api/datasets/:id', async c => c.json(await callTool('get_dataset_metadata', { dataset_id:c.req.param('id') }, c.env)));
app.get('/api/sources', async c => c.json(await callTool('get_source_records', { query:c.req.query('q'), dataset_id:c.req.query('dataset_id'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities', async c => c.json(await callTool('search_entities', { query:c.req.query('q') ?? 'ireland', type:c.req.query('type'), limit:c.req.query('limit') ?? 100 }, c.env)));
app.get('/api/entities/:id', async c => c.json(await callTool('get_entity', { entity_id:c.req.param('id') }, c.env)));
app.get('/api/context', async c => c.json(await callTool('get_context_graph', { query:c.req.query('q') ?? 'ireland', limit:c.req.query('limit') ?? 10 }, c.env)));
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
