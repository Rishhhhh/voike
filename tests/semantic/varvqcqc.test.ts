import { correctQuery } from '@semantic/varvqcqc';

describe('VARVQCQC', () => {
  it('rewrites wildcard queries', () => {
    const result = correctQuery({ kind: 'sql', sql: 'SELECT * FROM users' });
    expect(result.sql).toContain('SELECT *');
    expect(result.correctionMeta.reason.toLowerCase()).toContain('wildcard');
  });

  it('fills empty semantic text', () => {
    const result = correctQuery({ kind: 'semantic', semanticText: '' });
    expect(result.semanticText).toBe('general search');
  });
});
