import { describe, expect, it } from 'vitest';
import { filesInScope, listDirScopes, parentDir } from './model-tree.js';

describe('picker scopes', () => {
  const paths = [
    'root.3mf',
    'chassis/front.3mf',
    'chassis/rear.3mf',
    'chassis/sub/pin.3mf',
    'lid.3mf',
  ];

  it('lists the dist root and every implied directory prefix', () => {
    expect(listDirScopes(paths)).toEqual(['', 'chassis', 'chassis/sub']);
    expect(listDirScopes(['only.3mf'])).toEqual(['']);
    expect(listDirScopes([])).toEqual(['']);
  });

  it('lists every descendant file under a directory scope', () => {
    expect(filesInScope(paths, '')).toEqual([
      'chassis/front.3mf',
      'chassis/rear.3mf',
      'chassis/sub/pin.3mf',
      'lid.3mf',
      'root.3mf',
    ]);
    expect(filesInScope(paths, 'chassis')).toEqual([
      'chassis/front.3mf',
      'chassis/rear.3mf',
      'chassis/sub/pin.3mf',
    ]);
    expect(filesInScope(paths, 'chassis/sub')).toEqual(['chassis/sub/pin.3mf']);
    expect(filesInScope(paths, 'missing')).toEqual([]);
  });

  it('resolves a file path to its parent directory', () => {
    expect(parentDir('chassis/sub/pin.3mf')).toBe('chassis/sub');
    expect(parentDir('chassis')).toBe('');
    expect(parentDir('')).toBe('');
  });
});
