import { describe, expect, it } from 'vitest';
import {
  canPublishPath,
  modelToPathname,
  pathnameToModel,
  publishableModels,
  resolveRoute,
} from './router.js';

describe('router', () => {
  it('maps legacy viewer URLs to one 3MF identity', () => {
    expect(pathnameToModel('/nested/old.stl')).toBe('nested/old.3mf');
    expect(pathnameToModel('/Foo.STL')).toBe('Foo.3mf');
    expect(publishableModels(['old.stl', 'old.3mf'])).toEqual(['old.3mf']);
  });
  it('maps dist-relative 3MF paths onto / with per-segment encoding', () => {
    expect(modelToPathname('')).toBe('/');
    expect(modelToPathname('box.3mf')).toBe('/box.3mf');
    expect(modelToPathname('nested/second.3mf')).toBe('/nested/second.3mf');
    expect(modelToPathname('a b.3mf')).toBe('/a%20b.3mf');
    expect(modelToPathname('箱/部品.3mf')).toBe(
      `/${encodeURIComponent('箱')}/${encodeURIComponent('部品.3mf')}`,
    );
    expect(pathnameToModel('/')).toBe('');
    expect(pathnameToModel('/box.3mf')).toBe('box.3mf');
    expect(pathnameToModel('/nested/second.3mf')).toBe('nested/second.3mf');
    expect(pathnameToModel('/a%20b.3mf')).toBe('a b.3mf');
    expect(
      pathnameToModel(
        `/${encodeURIComponent('箱')}/${encodeURIComponent('部品.3mf')}`,
      ),
    ).toBe('箱/部品.3mf');
    expect(pathnameToModel('/Foo.3MF')).toBe('Foo.3MF');
  });

  it('rejects reserved, unsafe, and non-3MF viewer paths', () => {
    expect(pathnameToModel('/api/models')).toBeNull();
    expect(pathnameToModel('/models/box.3mf')).toBeNull();
    expect(pathnameToModel('/events')).toBeNull();
    expect(pathnameToModel('/static/app.js')).toBeNull();
    expect(pathnameToModel('/static/foo.3mf')).toBeNull();
    expect(pathnameToModel('/notes.txt')).toBeNull();
    expect(pathnameToModel('/../box.3mf')).toBeNull();
    expect(pathnameToModel('/%E0%A4%A')).toBeNull();
    expect(canPublishPath('box.3mf')).toBe(true);
    expect(canPublishPath('nested/a.3mf')).toBe(true);
    expect(canPublishPath('static/foo.3mf')).toBe(false);
    expect(canPublishPath('models/x.3mf')).toBe(false);
    expect(canPublishPath('')).toBe(true);
  });

  it('honors a usable URL even while the list lacks that path', () => {
    const models = ['box.3mf', 'nested/second.3mf'];
    expect(resolveRoute(models, 'nested/second.3mf')).toEqual({
      selected: 'nested/second.3mf',
      publish: 'nested/second.3mf',
    });
    expect(resolveRoute(['box.3mf'], 'nested/second.3mf')).toEqual({
      selected: 'nested/second.3mf',
      publish: 'nested/second.3mf',
    });
    expect(resolveRoute([], 'nested/second.3mf')).toEqual({
      selected: 'nested/second.3mf',
      publish: 'nested/second.3mf',
    });
  });

  it('falls back to the first model only when the URL names nothing', () => {
    const models = ['box.3mf', 'nested/second.3mf'];
    expect(resolveRoute(models, '')).toEqual({
      selected: 'box.3mf',
      publish: 'box.3mf',
    });
    expect(resolveRoute(models, null)).toEqual({
      selected: 'box.3mf',
      publish: 'box.3mf',
    });
    expect(resolveRoute(models, 'static/hidden.3mf')).toEqual({
      selected: 'box.3mf',
      publish: 'box.3mf',
    });
    expect(resolveRoute([], '')).toEqual({ selected: '', publish: '' });
    expect(resolveRoute([], null)).toEqual({ selected: '', publish: '' });
  });

  it('never selects a reserved-prefix 3MF', () => {
    expect(
      publishableModels([
        'api/hidden.3mf',
        'box.3mf',
        'models/x.3mf',
        'static/hidden.3mf',
      ]),
    ).toEqual(['box.3mf']);
    expect(publishableModels(['static/only.3mf'])).toEqual([]);
    expect(resolveRoute(['api/hidden.3mf', 'box.3mf'], '')).toEqual({
      selected: 'box.3mf',
      publish: 'box.3mf',
    });
    expect(resolveRoute(['static/only.3mf'], 'static/only.3mf')).toEqual({
      selected: '',
      publish: '',
    });
  });
});
