import { describe, expect, it } from 'vitest';
import app from './index';

describe('worker', () => {
  it('responds to health', async () => {
    const res = await app.request('/health', {}, {} as any);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
  });

  it('lists MCP tools', async () => {
    const res = await app.request('/mcp', { method:'POST', body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'tools/list' }) }, {} as any);
    const json:any = await res.json();
    expect(json.result.tools.length).toBeGreaterThan(8);
    const names = json.result.tools.map((t:any)=>t.name);
    expect(names).toContain('search_catalog');
    expect(names).toContain('get_layer_manifest');
    expect(names).toContain('find_related_datasets');
    expect(names).toContain('get_real_world_graph');
    expect(names).toContain('search_real_world_entities');
    expect(names).toContain('get_derived_facts');
    expect(names).toContain('get_forecast_readiness');
    expect(names).toContain('get_source_registry');
    expect(names).toContain('get_horizon_signals');
    expect(names).toContain('get_agent_control_plane');
    expect(names).toContain('get_causal_tooling');
    expect(names).toContain('get_housing_planning_layers');
  });

  it('searches datasets through REST fallback', async () => {
    const res = await app.request('/api/search?q=Ireland&limit=2', {}, {} as any);
    expect(res.status).toBe(200);
    const json:any = await res.json();
    expect(json.datasets.length).toBeGreaterThan(0);
    expect(json.disclaimers.join(' ')).toContain('does not provide official findings');
  });

  it('returns source/coverage tools without conclusions', async () => {
    const res = await app.request('/mcp', { method:'POST', body: JSON.stringify({ jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:'get_data_coverage', arguments:{} } }) }, {} as any);
    const json:any = await res.json();
    const text = json.result.content[0].text;
    expect(text).toContain('missingness');
    expect(text).toContain('does not provide official findings');
  });

  it('returns layer manifest and related dataset evidence', async () => {
    const layer = await app.request('/api/layers?domain=roads', {}, {} as any);
    expect(layer.status).toBe(200);
    const layerJson:any = await layer.json();
    expect(layerJson.layerManifest.layers[0].id).toBe('layer:roads');

    const related = await app.request('/api/related/data-gov-ie-catalog?limit=3', {}, {} as any);
    expect(related.status).toBe(200);
    const relatedJson:any = await related.json();
    expect(relatedJson.related.length).toBeGreaterThan(0);
    expect(relatedJson.caveat).toContain('metadata-derived');
  });

  it('serves a real-world intelligence graph with place asset condition event relationships', async () => {
    const res = await app.request('/api/real-world-graph?q=transport&limit=20', {}, {} as any);
    expect(res.status).toBe(200);
    const json:any = await res.json();
    expect(json.graph.nodes.some((n:any) => n.type === 'place')).toBe(true);
    expect(json.graph.nodes.some((n:any) => n.type === 'asset' || n.type === 'condition' || n.type === 'event')).toBe(true);
    expect(json.graph.relationships.some((r:any) => ['located_in','describes','can_be_joined_spatially_with','supports_factor'].includes(r.predicate))).toBe(true);
    expect(json.claimBoundary).toContain('not an official conclusion');
  });

  it('serves source registry and agent control plane', async () => {
    const registry = await app.request('/api/source-registry?limit=5', {}, {} as any);
    expect(registry.status).toBe(200);
    const registryJson:any = await registry.json();
    expect(registryJson.sources.length).toBeGreaterThanOrEqual(0);
    expect(registryJson.claimBoundary).toContain('Source registry');

    const control = await app.request('/api/agent-control-plane', {}, {} as any);
    expect(control.status).toBe(200);
    const controlJson:any = await control.json();
    expect(controlJson.controlPlane).toBeTruthy();
    expect(controlJson.claimBoundary).toContain('Agentic loops');
  });

  it('serves current horizon signals as weak evidence', async () => {
    const res = await app.request('/api/horizon-signals?limit=5', {}, {} as any);
    expect(res.status).toBe(200);
    const json:any = await res.json();
    expect(Array.isArray(json.signals)).toBe(true);
    expect(Array.isArray(json.sourceStatus)).toBe(true);
    expect(json.claimBoundary).toContain('weak current-event metadata');
  });

  it('serves housing and planning layer artifact without conclusions', async () => {
    const res = await app.request('/api/housing-planning-layers?includeSamples=false', {}, {} as any);
    expect(res.status).toBe(200);
    const json:any = await res.json();
    expect(Array.isArray(json.layers)).toBe(true);
    expect(json.claimBoundary).toContain('no planning, legal');
  });

  it('serves derived facts and forecast readiness without unsupported accuracy claims', async () => {
    const facts = await app.request('/api/derived-facts?limit=10', {}, {} as any);
    expect(facts.status).toBe(200);
    const factJson:any = await facts.json();
    expect(factJson.facts.length).toBeGreaterThanOrEqual(10);
    expect(factJson.facts[0].evidence.length).toBeGreaterThan(0);

    const forecast = await app.request('/api/forecast-readiness?hazard=flooding', {}, {} as any);
    expect(forecast.status).toBe(200);
    const forecastJson:any = await forecast.json();
    expect(forecastJson.forecastReadiness.requiredAccuracy).toBe(0.99);
    expect(forecastJson.forecastReadiness.claimStatus).toBe('not-achieved');
    expect(forecastJson.forecastReadiness.capabilities[0].current.accuracyClaimed).toBe(false);
    expect(forecastJson.claimBoundary).toContain('No 99% forecast accuracy is claimed');
  });
});
