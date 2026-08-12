import { describe, expect, it } from 'vitest';
import { fuzzyRank, fuzzyScore, highlightParts } from './fuzzy.js';

describe('fuzzy', () => {
  it('matches subsequences and rejects misses', () => {
    expect(fuzzyScore('bx', 'box.stl')?.indices).toEqual([0, 2]);
    expect(fuzzyScore('zzz', 'box.stl')).toBeNull();
  });

  it('prefers basename hits and shorter paths on ties of quality', () => {
    const ranked = fuzzyRank('part', [
      'deep/nested/other.stl',
      'part.stl',
      'deep/part.stl',
      'deep/nested/part-holder.stl',
    ]);
    expect(ranked.map((item) => item.path)).toEqual([
      'part.stl',
      'deep/part.stl',
      'deep/nested/part-holder.stl',
    ]);
  });

  it('breaks equal scores by sorting path ascending', () => {
    const ranked = fuzzyRank('z', ['y/z.stl', 'x/z.stl']);
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
      fuzzyRank('  ', ['a.stl', 'b.stl']).map((item) => item.path),
    ).toEqual(['a.stl', 'b.stl']);
  });
});
