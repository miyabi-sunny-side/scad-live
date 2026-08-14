import { describe, expect, it } from 'vitest';
import { filesInScope, listDirScopes, parentDir } from './model-tree.js';

describe('picker scopes', () => {
  const paths = [
    'root.stl',
    'chassis/front.stl',
    'chassis/rear.stl',
    'chassis/sub/pin.stl',
    'lid.stl',
  ];

  it('lists the dist root and every implied directory prefix', () => {
    expect(listDirScopes(paths)).toEqual(['', 'chassis', 'chassis/sub']);
    expect(listDirScopes(['only.stl'])).toEqual(['']);
    expect(listDirScopes([])).toEqual(['']);
  });

  it('lists every descendant file under a directory scope', () => {
    expect(filesInScope(paths, '')).toEqual([
      'chassis/front.stl',
      'chassis/rear.stl',
      'chassis/sub/pin.stl',
      'lid.stl',
      'root.stl',
    ]);
    expect(filesInScope(paths, 'chassis')).toEqual([
      'chassis/front.stl',
      'chassis/rear.stl',
      'chassis/sub/pin.stl',
    ]);
    expect(filesInScope(paths, 'chassis/sub')).toEqual(['chassis/sub/pin.stl']);
    expect(filesInScope(paths, 'missing')).toEqual([]);
  });

  it('resolves a file path to its parent directory', () => {
    expect(parentDir('chassis/sub/pin.stl')).toBe('chassis/sub');
    expect(parentDir('chassis')).toBe('');
    expect(parentDir('')).toBe('');
  });
});
