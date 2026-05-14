import { Hono } from 'hono';
import { normalizeSearch, type ContextBundle } from '@ipcg/shared';
import { seedBundle } from './seed-data';

type Env = { DATA_BASE_URL?: string; SERVICE_NAME?: string; SERVICE_VERSION?: string; CONTEXT_DB?: D1Database; DATA_BUCKET?: R2Bucket; CONTEXT_KV?: KVNamespace };
const app = new Hono<{ Bindings: Env }>();
let cached: ContextBundle | undefined;
async function loadBundle(env: Env): Promise<ContextBundle> {
  if (cached) return cached;
  if (env.DATA_BUCKET) {
    const obj = await env.DATA_BUCKET.get('releases/latest/context-bundle.json');
    if (obj) { cached = await obj.json<ContextBundle>(); return cached; }
  }
  if (env.DATA_BASE_URL) {
    try { const res = await fetch(`${env.DATA_BASE_URL}/context-bundle.json`, { cf: { cacheTtl: 300 } as RequestInitCfProperties }); if (res.ok) { cached = await res.json<ContextBundle>(); return cached; } } catch {}
  }
  cached = seedBundle; return cached;
}
function jsonRpc(id: unknown, result: unknown) { return { jsonrpc: '2.0', id, result }; }
function jsonRpcError(id: unknown, code: number, message: string) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function tools() { return [
  { name:'list_datasets', description:'List available public datasets and provenance metadata. Returns data only, no conclusions.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' }, query:{ type:'string' } } } },
  { name:'get_dataset_metadata', description:'Get metadata, source links, licence notes, formats and provenance for one dataset.', inputSchema:{ type:'object', properties:{ dataset_id:{ type:'string' } }, required:['dataset_id'] } },
  { name:'search_entities', description:'Search graph entities by text and optional entity type.', inputSchema:{ type:'object', properties:{ query:{ type:'string' }, type:{ type:'string' }, limit:{ type:'number' } }, required:['query'] } },
  { name:'get_entity', description:'Get one entity by ID.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' } }, required:['entity_id'] } },
  { name:'get_relationships', description:'Get relationships connected to an entity.', inputSchema:{ type:'object', properties:{ entity_id:{ type:'string' }, predicate:{ type:'string' } }, required:['entity_id'] } },
  { name:'get_context_graph', description:'Get entities, relationships, observations, provenance and claim-boundary notes for a set of entity IDs or a query. No conclusions are generated.', inputSchema:{ type:'object', properties:{ entity_ids:{ type:'array', items:{type:'string'} }, query:{ type:'string' }, limit:{ type:'number' } } } },
  { name:'get_data_coverage', description:'Return dataset/domain coverage and known missingness notes.', inputSchema:{ type:'object', properties:{ domain:{ type:'string' } } } },
  { name:'get_export_links', description:'Return download links for static data artifacts.', inputSchema:{ type:'object', properties:{} } }
]; }
async function callTool(name: string, args: any, env: Env) {
  const b = await loadBundle(env);
  if (name === 'list_datasets') {
    const q = args?.query ? normalizeSearch(String(args.query)) : '';
    const domain = args?.domain ? String(args.domain) : '';
    return { datasets: b.datasets.filter(d => (!domain || d.domains.includes(domain as any)) && (!q || normalizeSearch(`${d.title} ${d.publisher} ${d.description}`).includes(q))), disclaimers: b.disclaimers };
  }
  if (name === 'get_dataset_metadata') return { dataset: b.datasets.find(d => d.id === args.dataset_id) ?? null, disclaimers: b.disclaimers };
  if (name === 'search_entities') {
    const q = normalizeSearch(String(args.query)); const limit = Math.min(Number(args.limit ?? 25), 100);
    return { entities: b.entities.filter(e => normalizeSearch(`${e.id} ${e.name} ${e.type}`).includes(q) && (!args.type || e.type === args.type)).slice(0, limit), disclaimers: b.disclaimers };
  }
  if (name === 'get_entity') return { entity: b.entities.find(e => e.id === args.entity_id) ?? null, observations: b.observations.filter(o => o.entityId === args.entity_id), disclaimers: b.disclaimers };
  if (name === 'get_relationships') return { relationships: b.relationships.filter(r => (r.subject === args.entity_id || r.object === args.entity_id) && (!args.predicate || r.predicate === args.predicate)), disclaimers: b.disclaimers };
  if (name === 'get_context_graph') {
    const ids = new Set<string>(args?.entity_ids ?? []);
    if (args?.query) for (const e of b.entities.filter(e => normalizeSearch(`${e.id} ${e.name} ${e.type}`).includes(normalizeSearch(String(args.query)))).slice(0, Number(args.limit ?? 10))) ids.add(e.id);
    const rels = b.relationships.filter(r => ids.has(r.subject) || ids.has(r.object));
    for (const r of rels) { ids.add(r.subject); ids.add(r.object); }
    return { entities:b.entities.filter(e => ids.has(e.id)), relationships:rels, observations:b.observations.filter(o => ids.has(o.entityId)), datasets:b.datasets, disclaimers:b.disclaimers };
  }
  if (name === 'get_data_coverage') {
    const datasets = args?.domain ? b.datasets.filter(d => d.domains.includes(args.domain)) : b.datasets;
    return { generatedAt:b.generatedAt, datasetCount:datasets.length, domains:[...new Set(datasets.flatMap(d => d.domains))], datasets:datasets.map(d => ({ id:d.id, title:d.title, publisher:d.publisher, updateCadence:d.updateCadence, provenanceNotes:d.provenanceNotes })), caveat:'Coverage is catalogue-driven and uneven across publishers; missingness is expected.', disclaimers:b.disclaimers };
  }
  if (name === 'get_export_links') { const base = env.DATA_BASE_URL || '/data'; return { links: ['context-bundle.json','dataset-catalog.json','entities.json','relationships.json','observations.json','manifest.json'].map(f => ({ name:f, url:`${base}/${f}` })), disclaimers:b.disclaimers }; }
  throw new Error(`Unknown tool: ${name}`);
}
app.get('/', c => c.json({ name:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph', version:c.env.SERVICE_VERSION ?? '0.1.0', endpoints:['/health','/mcp','/api/datasets','/api/entities','/api/context'] }));
app.get('/health', c => c.json({ ok:true, service:c.env.SERVICE_NAME ?? 'Ireland Public Context Graph' }));
app.get('/api/datasets', async c => c.json({ datasets:(await loadBundle(c.env)).datasets, disclaimers:(await loadBundle(c.env)).disclaimers }));
app.get('/api/entities', async c => c.json({ entities:(await loadBundle(c.env)).entities, disclaimers:(await loadBundle(c.env)).disclaimers }));
app.get('/api/context', async c => c.json(await callTool('get_context_graph', { query:c.req.query('q') ?? 'ireland', limit:10 }, c.env)));
app.get('/mcp', c => c.json({ protocol:'MCP Streamable HTTP JSON-RPC endpoint', transport:'streamable-http', methods:['initialize','tools/list','tools/call'], claimBoundary:'data-only; no conclusions' }));
app.post('/mcp', async c => {
  const req = await c.req.json<any>();
  try {
    if (Array.isArray(req)) return c.json(await Promise.all(req.map(async r => jsonRpc(r.id, await handleRpc(r, c.env)))));
    return c.json(await handleRpc(req, c.env));
  } catch (err) { return c.json(jsonRpcError(req?.id ?? null, -32603, err instanceof Error ? err.message : 'Internal error'), 500); }
});
async function handleRpc(req: any, env: Env) {
  if (req.method === 'initialize') return jsonRpc(req.id, { protocolVersion:'2024-11-05', capabilities:{ tools:{} }, serverInfo:{ name:'ireland-public-context-graph', version:'0.1.0' } });
  if (req.method === 'notifications/initialized') return jsonRpc(req.id ?? null, {});
  if (req.method === 'tools/list') return jsonRpc(req.id, { tools: tools() });
  if (req.method === 'tools/call') { const result = await callTool(req.params?.name, req.params?.arguments ?? {}, env); return jsonRpc(req.id, { content:[{ type:'text', text:JSON.stringify(result, null, 2) }] }); }
  return jsonRpcError(req.id, -32601, `Method not found: ${req.method}`);
}
export default app;
