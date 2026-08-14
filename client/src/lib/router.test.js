import { describe, expect, it } from 'vitest';
import {
  canPublishPath,
  modelToPathname,
  pathnameToModel,
  publishableModels,
  resolveRoute,
} from './router.js';

describe('router', () => {
  it('maps dist-relative STL paths onto / with per-segment encoding', () => {
    expect(modelToPathname('')).toBe('/');
    expect(modelToPathname('box.stl')).toBe('/box.stl');
    expect(modelToPathname('nested/second.stl')).toBe('/nested/second.stl');
    expect(modelToPathname('a b.stl')).toBe('/a%20b.stl');
    expect(modelToPathname('箱/部品.stl')).toBe(
      `/${encodeURIComponent('箱')}/${encodeURIComponent('部品.stl')}`,
    );
    expect(pathnameToModel('/')).toBe('');
    expect(pathnameToModel('/box.stl')).toBe('box.stl');
    expect(pathnameToModel('/nested/second.stl')).toBe('nested/second.stl');
    expect(pathnameToModel('/a%20b.stl')).toBe('a b.stl');
    expect(
      pathnameToModel(
        `/${encodeURIComponent('箱')}/${encodeURIComponent('部品.stl')}`,
      ),
    ).toBe('箱/部品.stl');
    expect(pathnameToModel('/Foo.STL')).toBe('Foo.STL');
  });

  it('rejects reserved, unsafe, and non-STL viewer paths', () => {
    expect(pathnameToModel('/api/models')).toBeNull();
    expect(pathnameToModel('/models/box.stl')).toBeNull();
    expect(pathnameToModel('/events')).toBeNull();
    expect(pathnameToModel('/static/app.js')).toBeNull();
    expect(pathnameToModel('/static/foo.stl')).toBeNull();
    expect(pathnameToModel('/notes.txt')).toBeNull();
    expect(pathnameToModel('/../box.stl')).toBeNull();
    expect(pathnameToModel('/%E0%A4%A')).toBeNull();
    expect(canPublishPath('box.stl')).toBe(true);
    expect(canPublishPath('nested/a.stl')).toBe(true);
    expect(canPublishPath('static/foo.stl')).toBe(false);
    expect(canPublishPath('models/x.stl')).toBe(false);
    expect(canPublishPath('')).toBe(true);
  });

  it('honors a usable URL and replaceStates away from / or a missing path', () => {
    const models = ['box.stl', 'nested/second.stl'];
    expect(resolveRoute(models, 'nested/second.stl')).toEqual({
      selected: 'nested/second.stl',
      publish: 'nested/second.stl',
      replace: false,
    });
    expect(resolveRoute(models, '')).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: true,
    });
    expect(resolveRoute(models, 'gone.stl')).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: true,
    });
    expect(resolveRoute(models, null)).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: true,
    });
    expect(resolveRoute(models, 'box.stl', 'nested/second.stl')).toEqual({
      selected: 'nested/second.stl',
      publish: 'nested/second.stl',
      replace: true,
    });
    expect(resolveRoute(models, 'box.stl', 'box.stl')).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: false,
    });
    expect(resolveRoute(models, 'box.stl', null)).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: true,
    });
    expect(resolveRoute([], 'box.stl')).toEqual({
      selected: '',
      publish: '',
      replace: true,
    });
  });

  it('never selects a reserved-prefix STL', () => {
    expect(
      publishableModels([
        'api/hidden.stl',
        'box.stl',
        'models/x.stl',
        'static/hidden.stl',
      ]),
    ).toEqual(['box.stl']);
    expect(publishableModels(['static/only.stl'])).toEqual([]);
    expect(resolveRoute(['api/hidden.stl', 'box.stl'], '')).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: true,
    });
    expect(resolveRoute(['static/only.stl'], 'static/only.stl')).toEqual({
      selected: '',
      publish: '',
      replace: true,
    });
    expect(
      resolveRoute(['api/hidden.stl', 'box.stl'], 'box.stl', 'api/hidden.stl'),
    ).toEqual({
      selected: 'box.stl',
      publish: 'box.stl',
      replace: false,
    });
  });
});
