import { describe, expect, it } from 'vitest';
import { breadcrumbs, listDir, parentDir } from './model-tree.js';

describe('model tree', () => {
  const paths = [
    'root.stl',
    'chassis/front.stl',
    'chassis/rear.stl',
    'chassis/sub/pin.stl',
    'lid.stl',
  ];

  it('lists root files and directories in deterministic order', () => {
    expect(listDir(paths, '')).toEqual([
      { kind: 'dir', name: 'chassis', path: 'chassis' },
      { kind: 'file', name: 'lid.stl', path: 'lid.stl' },
      { kind: 'file', name: 'root.stl', path: 'root.stl' },
    ]);
  });

  it('lists a nested directory without collapsing deeper leaves', () => {
    expect(listDir(paths, 'chassis')).toEqual([
      { kind: 'dir', name: 'sub', path: 'chassis/sub' },
      { kind: 'file', name: 'front.stl', path: 'chassis/front.stl' },
      { kind: 'file', name: 'rear.stl', path: 'chassis/rear.stl' },
    ]);
    expect(listDir(paths, 'chassis/sub')).toEqual([
      { kind: 'file', name: 'pin.stl', path: 'chassis/sub/pin.stl' },
    ]);
  });

  it('handles empty lists and single-file roots', () => {
    expect(listDir([], '')).toEqual([]);
    expect(listDir(['only.stl'], '')).toEqual([
      { kind: 'file', name: 'only.stl', path: 'only.stl' },
    ]);
  });

  it('builds breadcrumbs and parents', () => {
    expect(breadcrumbs('')).toEqual([]);
    expect(breadcrumbs('chassis/sub')).toEqual([
      { name: 'chassis', path: 'chassis' },
      { name: 'sub', path: 'chassis/sub' },
    ]);
    expect(parentDir('chassis/sub')).toBe('chassis');
    expect(parentDir('chassis')).toBe('');
    expect(parentDir('')).toBe('');
  });
});
