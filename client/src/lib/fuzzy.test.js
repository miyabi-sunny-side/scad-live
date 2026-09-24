import { describe, expect, it } from 'vitest';
import { fuzzyScore, highlightParts, rankFiles } from './fuzzy.js';

describe('fuzzy', () => {
  it('matches subsequences and rejects misses', () => {
    expect(fuzzyScore('bx', 'box.3mf')?.indices).toEqual([0, 2]);
    expect(fuzzyScore('zzz', 'box.3mf')).toBeNull();
  });

  it('prefers basename hits and shorter paths on ties of quality', () => {
    const ranked = rankFiles('part', [
      'deep/nested/other.3mf',
      'part.3mf',
      'deep/part.3mf',
      'deep/nested/part-holder.3mf',
    ]);
    expect(
      ranked.filter((item) => item.matched).map((item) => item.path),
    ).toEqual(['part.3mf', 'deep/part.3mf', 'deep/nested/part-holder.3mf']);
  });

  it('breaks equal scores by sorting path ascending', () => {
    const ranked = rankFiles('z', ['y/z.3mf', 'x/z.3mf']);
    expect(ranked.map((item) => item.path)).toEqual(['x/z.3mf', 'y/z.3mf']);
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('builds highlight parts without using HTML', () => {
    expect(highlightParts('box.3mf', [0, 2])).toEqual([
      { text: 'b', match: true },
      { text: 'o', match: false },
      { text: 'x', match: true },
      { text: '.3mf', match: false },
    ]);
    expect(highlightParts('plain.3mf', [])).toEqual([
      { text: 'plain.3mf', match: false },
    ]);
  });

  it('returns every path unfiltered when the query is empty', () => {
    expect(
      rankFiles('  ', ['a.3mf', 'b.3mf']).map((item) => item.path),
    ).toEqual(['a.3mf', 'b.3mf']);
  });

  it('keeps unmatched scoped files below ranked matches', () => {
    const ranked = rankFiles('needle', [
      'batch-00/part-000.3mf',
      'batch-05/target-needle.3mf',
      'batch-05/other.3mf',
      'batch-11/part-119.3mf',
    ]);
    expect(ranked.map((item) => [item.path, item.matched])).toEqual([
      ['batch-05/target-needle.3mf', true],
      ['batch-00/part-000.3mf', false],
      ['batch-05/other.3mf', false],
      ['batch-11/part-119.3mf', false],
    ]);
    expect(
      rankFiles('', ['b.3mf', 'a.3mf']).every((item) => item.matched),
    ).toBe(true);
  });
});
