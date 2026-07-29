import { describe, expect, it } from 'vitest';
import { createModelState } from './model-state.svelte.js';

describe('createModelState', () => {
  it('provides the viewer initial state', () => {
    expect(createModelState()).toEqual({
      models: [],
      selected: '',
      dimensions: '—',
      status: 'Scanning',
    });
  });

  it('owns mutable production viewer state', () => {
    const state = createModelState();
    state.models = ['box.stl'];
    state.selected = 'box.stl';
    state.dimensions = '10.0 × 20.0 × 30.0 mm';
    state.status = 'Ready';

    expect(state).toEqual({
      models: ['box.stl'],
      selected: 'box.stl',
      dimensions: '10.0 × 20.0 × 30.0 mm',
      status: 'Ready',
    });
  });
});
