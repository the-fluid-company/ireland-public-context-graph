import { describe, expect, it } from 'vitest';
import { ContextBundle, normalizeSearch, slug } from './index';
describe('shared schema', () => {
  it('validates an empty context bundle with claim boundaries', () => {
    const parsed = ContextBundle.parse({ generatedAt:'2026-01-01T00:00:00Z', version:'2026-01-01', datasets:[], entities:[], relationships:[], observations:[], sourceRecords:[], disclaimers:['data only'] });
    expect(parsed.version).toBe('2026-01-01');
  });
  it('normalizes search and stable slugs', () => {
    expect(normalizeSearch('Dún Laoghaire')).toContain('dun');
    expect(slug('Central Statistics Office Ireland')).toBe('central-statistics-office-ireland');
  });
});
