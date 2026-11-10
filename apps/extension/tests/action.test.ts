import { describe, expect, it } from 'vitest';
import { suggestedAction } from '../src/components/AnalysisResultCard';

describe('suggestedAction', () => {
  it('maps UP to BUY, DOWN to SELL and everything else to no trade', () => {
    expect(suggestedAction('UP').action).toBe('BUY');
    expect(suggestedAction('DOWN').action).toBe('SELL');
    for (const s of ['WAIT', 'INSUFFICIENT_DATA', 'ERROR'] as const) expect(suggestedAction(s).action).toBeNull();
  });
});
