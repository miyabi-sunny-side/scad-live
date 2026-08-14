import { describe, expect, it } from 'vitest';
import { fuzzyScore, highlightParts, rankFiles } from './fuzzy.js';

describe('fuzzy', () => {
  it('matches subsequences and rejects misses', () => {
    expect(fuzzyScore('bx', 'box.stl')?.indices).toEqual([0, 2]);
    expect(fuzzyScore('zzz', 'box.stl')).toBeNull();
  });

  it('prefers basename hits and shorter paths on ties of quality', () => {
    const ranked = rankFiles('part', [
      'deep/nested/other.stl',
      'part.stl',
      'deep/part.stl',
      'deep/nested/part-holder.stl',
    ]);
    expect(
      ranked.filter((item) => item.matched).map((item) => item.path),
    ).toEqual(['part.stl', 'deep/part.stl', 'deep/nested/part-holder.stl']);
  });

  it('breaks equal scores by sorting path ascending', () => {
    const ranked = rankFiles('z', ['y/z.stl', 'x/z.stl']);
    expect(ranked.map((item) => item.path)).toEqual(['x/z.stl', 'y/z.stl']);
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it('builds highlight parts without using HTML', () => {
    expect(highlightParts('box.stl', [0, 2])).toEqual([
      { text: 'b', match: true },
      { text: 'o', match: false },
      { text: 'x', match: true },
      { text: '.stl', match: false },
    ]);
    expect(highlightParts('plain.stl', [])).toEqual([
      { text: 'plain.stl', match: false },
    ]);
  });

  it('returns every path unfiltered when the query is empty', () => {
    expect(
      rankFiles('  ', ['a.stl', 'b.stl']).map((item) => item.path),
    ).toEqual(['a.stl', 'b.stl']);
  });

  it('keeps unmatched scoped files below ranked matches', () => {
    const ranked = rankFiles('needle', [
      'batch-00/part-000.stl',
      'batch-05/target-needle.stl',
      'batch-05/other.stl',
      'batch-11/part-119.stl',
    ]);
    expect(ranked.map((item) => [item.path, item.matched])).toEqual([
      ['batch-05/target-needle.stl', true],
      ['batch-00/part-000.stl', false],
      ['batch-05/other.stl', false],
      ['batch-11/part-119.stl', false],
    ]);
    expect(
      rankFiles('', ['b.stl', 'a.stl']).every((item) => item.matched),
    ).toBe(true);
  });
});
