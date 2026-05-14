import { describe, expect, it } from 'vitest';
import app from './index';
describe('worker', () => {
  it('responds to health', async () => { const res = await app.request('/health', {}, {} as any); expect(res.status).toBe(200); const body: any = await res.json(); expect(body.ok).toBe(true); });
  it('lists MCP tools', async () => { const res = await app.request('/mcp', { method:'POST', body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'tools/list' }) }, {} as any); const json:any = await res.json(); expect(json.result.tools.length).toBeGreaterThan(3); });
});
