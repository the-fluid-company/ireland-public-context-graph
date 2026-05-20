import { describe, expect, it } from 'vitest';
import { ContextBundle, EntityType, ForecastReadiness, SourceRegistryEntry, normalizeSearch, slug } from './index';

describe('shared schema', () => {
  it('validates an empty context bundle with claim boundaries', () => {
    const parsed = ContextBundle.parse({ generatedAt:'2026-01-01T00:00:00Z', version:'2026-01-01', datasets:[], entities:[], relationships:[], observations:[], sourceRecords:[], disclaimers:['data only'] });
    expect(parsed.version).toBe('2026-01-01');
  });

  it('normalizes search and stable slugs', () => {
    expect(normalizeSearch('Dún Laoghaire')).toContain('dun');
    expect(slug('Central Statistics Office Ireland')).toBe('central-statistics-office-ireland');
  });

  it('accepts real-world intelligence graph entity types', () => {
    expect(EntityType.parse('place')).toBe('place');
    expect(EntityType.parse('asset')).toBe('asset');
    expect(EntityType.parse('condition')).toBe('condition');
    expect(EntityType.parse('event')).toBe('event');
    expect(EntityType.parse('factor')).toBe('factor');
  });

  it('validates forecast readiness without allowing unsupported accuracy claims', () => {
    const parsed = ForecastReadiness.parse({
      generatedAt:'2026-01-01T00:00:00Z',
      version:'2026-01-01',
      purpose:'Hazard forecast readiness contract.',
      requiredAccuracy:0.99,
      claimStatus:'not-achieved',
      capabilities:[{
        id:'forecast:flooding',
        hazard:'flooding',
        label:'Flooding',
        status:'benchmark-required',
        target:{ threshold:0.99, metric:'event-level F1', window:'0-72h' },
        current:{ accuracyClaimed:false, validatedAccuracy:null, benchmarkStatus:'no holdout benchmark yet' },
        evidenceSignals:[{ id:'rainfall', label:'Rainfall', datasetIds:['met-eireann'], strength:'strong', missing:false, caveats:[] }],
        modelPlan:['join rainfall, catchment and flood event labels'],
        blockers:['verified event labels are required']
      }],
      benchmarkGates:['temporal holdout'],
      caveats:['No 99% claim before benchmark evidence.']
    });
    expect(parsed.capabilities[0]?.current.accuracyClaimed).toBe(false);
  });

  it('validates source registry entries for agentic ingestion control', () => {
    const parsed = SourceRegistryEntry.parse({
      id:'source-registry:data-gov-ie',
      name:'Ireland Open Data Portal',
      url:'https://data.gov.ie/',
      owner:'Department of Public Expenditure, NDP Delivery and Reform',
      sourceType:'official',
      domains:['local-government','public-services'],
      geography:'Ireland',
      accessMethod:'ckan',
      license:'Varies per dataset',
      updateFrequency:'continuous',
      parserStatus:'implemented',
      reliabilityScore:0.95,
      lastChecked:'2026-01-01T00:00:00Z',
      lastIngested:'2026-01-01T00:00:00Z',
      caveats:['metadata only'],
      agentTasks:['poll CKAN']
    });
    expect(parsed.parserStatus).toBe('implemented');
  });
});
