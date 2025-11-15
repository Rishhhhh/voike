import { computeLedgerEntropy } from '@semantic/var';

describe('VAR entropy', () => {
  it('increases with diverse payload', () => {
    const entropyLow = computeLedgerEntropy({ payload: { a: 'x', b: 'x' } });
    const entropyHigh = computeLedgerEntropy({ payload: { a: 'x', b: 'y', c: 'z' } });
    expect(entropyHigh).toBeGreaterThan(entropyLow);
  });
});
