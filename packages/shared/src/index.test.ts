import { describe, expect, it } from 'vitest';
import { ContextBundle, CLAIM_BOUNDARY } from './index';
describe('shared schemas', () => { it('validates a minimal context bundle', () => { const parsed = ContextBundle.parse({ generatedAt: new Date().toISOString(), version: 'test', datasets: [], entities: [], relationships: [], observations: [], disclaimers: [...CLAIM_BOUNDARY] }); expect(parsed.version).toBe('test'); }); });
