<script>
  import { onMount } from 'svelte';
  import ModelPicker from './lib/ModelPicker.svelte';
  import {
    DEFAULT_GRID_PITCH,
    GRID_PITCHES,
    gridPitchIndex,
  } from './lib/grid-pitch.js';
  import { createModelState } from './lib/model-state.svelte.js';
  import {
    pathnameToModel,
    publishableModels,
    pushModel,
    replaceModel,
    resolveRoute,
  } from './lib/router.js';
  import { createThreeViewer } from './lib/three-viewer.js';

  let viewport;
  let inspector;
  const model = createModelState();
  let statusClass = $derived(
    model.status === 'Loading'
      ? 'loading'
      : model.status.startsWith('Failed') || model.status === 'Reconnecting'
        ? 'failed'
        : '',
  );

  let viewer;
  let source;
  let hasModelList = false;
  /** Path currently drawn in the viewport, `''` before the first success. */
  let loaded = '';
  /** The selected path is absent from the current list (dist is rebuilding). */
  let missing = false;
  let gridIndex = $state(gridPitchIndex(DEFAULT_GRID_PITCH));
  let gridPitch = $derived(GRID_PITCHES[gridIndex]);

  const load = async (path, fit) => {
    model.status = 'Loading';
    try {
      const result = await viewer.loadModel(path, fit);
      if (result.kind !== 'success' || path !== model.selected) return;
      loaded = path;
      model.dimensions = result.dimensions;
      model.roles = result.roles;
      model.status = fit ? 'Ready' : 'Updated';
    } catch (error) {
      console.warn(`Could not load ${path}:`, error.message);
      if (path === model.selected) model.status = `Failed: ${path}`;
    }
  };

  const refreshModels = async () => {
    const response = await globalThis.fetch('/api/models', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Model list returned ${response.status}`);
    const listed = await response.json();
    if (
      !Array.isArray(listed) ||
      listed.some((path) => typeof path !== 'string')
    )
      throw new Error('Model list is invalid');

    model.models = publishableModels(listed);
    hasModelList = true;
    await applyDecision(
      resolveRoute(model.models, pathnameToModel(globalThis.location.pathname)),
    );
  };

  const applyDecision = async (decision) => {
    replaceModel(decision.publish);
    model.selected = decision.selected;
    if (!decision.selected) {
      viewer.clear();
      loaded = '';
      missing = false;
      model.dimensions = '—';
      model.roles = [];
      model.status = 'No 3MF files found';
      return;
    }
    if (!model.models.includes(decision.selected)) {
      // Keep the last good mesh and dimensions; the State line carries the news.
      // A read of this very path may still be in flight, and it would otherwise
      // swap in geometry for a file we already know is gone.
      viewer.cancelLoad();
      missing = true;
      model.status = `Missing: ${decision.selected}`;
      return;
    }
    const returning = missing;
    missing = false;
    if (decision.selected !== loaded) await load(decision.selected, true);
    else if (returning) await load(decision.selected, false);
  };

  const selectModel = (path) => {
    model.selected = path;
    missing = false;
    pushModel(path);
    void load(path, true);
  };

  const onPopState = () => {
    if (!hasModelList) return;
    void applyDecision(
      resolveRoute(model.models, pathnameToModel(globalThis.location.pathname)),
    );
  };

  const onGridInput = (event) => {
    gridIndex = Number(event.currentTarget.value);
    viewer?.setGridPitch(GRID_PITCHES[gridIndex]);
  };

  const applyEvent = async (message) => {
    const event = JSON.parse(message.data);
    if (
      !event ||
      !['add', 'change', 'unlink'].includes(event.kind) ||
      typeof event.path !== 'string'
    )
      throw new Error('Live update is invalid');

    if (event.kind !== 'unlink' && event.path === model.selected && !missing) {
      await load(model.selected, false);
      return;
    }
    await refreshModels();
  };

  const connect = () => {
    source = new globalThis.EventSource('/events');
    source.addEventListener('open', () => {
      if (!hasModelList) {
        void refreshModels().catch((error) => {
          console.warn('Could not recover model list:', error.message);
          model.status = 'Failed to scan models';
        });
      } else if (model.status === 'Reconnecting') {
        if (missing) model.status = `Missing: ${model.selected}`;
        else model.status = model.selected ? 'Ready' : 'No 3MF files found';
      }
    });
    source.addEventListener('message', (message) => {
      void applyEvent(message).catch((error) => {
        console.warn('Could not apply live model update:', error.message);
        model.status = 'Failed to refresh models';
      });
    });
    source.addEventListener('error', () => {
      model.status = 'Reconnecting';
    });
  };

  onMount(() => {
    viewer = createThreeViewer(viewport, () =>
      inspector.getBoundingClientRect(),
    );
    viewer.setGridPitch(GRID_PITCHES[gridIndex]);
    Object.defineProperty(globalThis, '__scadLive', {
      configurable: true,
      value: Object.freeze({ getViewerState: viewer.getViewerState }),
    });
    globalThis.addEventListener('popstate', onPopState);
    void refreshModels()
      .catch((error) => {
        console.error(error);
        model.status = 'Failed to scan models';
      })
      .finally(connect);

    return () => {
      globalThis.removeEventListener('popstate', onPopState);
      source?.close();
      viewer.destroy();
      delete globalThis.__scadLive;
    };
  });
</script>

<main
  class="viewport"
  bind:this={viewport}
  aria-label="Interactive 3MF model view"
></main>
<section class="inspector" bind:this={inspector} aria-label="Model inspector">
  <header>
    <h1>scad-live</h1>
    <span id="sync" class={statusClass} aria-live="polite"
      ><i></i>{model.status}</span
    >
  </header>
  <label for="models">Model</label>
  <ModelPicker
    models={model.models}
    selected={model.selected}
    disabled={model.models.length === 0}
    onSelect={selectModel}
  />
  <label for="grid-pitch">Grid</label>
  <div class="grid-control">
    <input
      id="grid-pitch"
      type="range"
      min="0"
      max={GRID_PITCHES.length - 1}
      step="1"
      value={gridIndex}
      aria-valuemin={0}
      aria-valuemax={GRID_PITCHES.length - 1}
      aria-valuenow={gridIndex}
      aria-valuetext="{gridPitch} mm per square"
      oninput={onGridInput}
    />
    <output id="grid-pitch-value" for="grid-pitch">{gridPitch} mm</output>
  </div>
  {#if model.roles.length}
    <div class="materials" aria-label="Material roles">
      {#each model.roles as role}
        <span
          ><i class:secondary={role === 'secondary'} aria-hidden="true"
          ></i>{role}</span
        >
      {/each}
    </div>
  {/if}
  <dl>
    <div>
      <dt>Dimensions</dt>
      <dd id="dimensions">{model.dimensions}</dd>
    </div>
    <div>
      <dt>State</dt>
      <dd id="state">{model.status}</dd>
    </div>
  </dl>
</section>
<p class="hint">Drag: orbit · Pinch: zoom · Two-finger drag: pan</p>

<style>
  .viewport {
    position: fixed;
    inset: 0;
    width: 100dvw;
    height: 100dvh;
    touch-action: none;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .inspector {
    position: fixed;
    top: clamp(12px, 3vw, 30px);
    left: clamp(12px, 3vw, 30px);
    width: min(430px, calc(100vw - 24px));
    padding: 18px;
    border: 1px solid var(--border);
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--surface-raised);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 13px;
    margin-bottom: 15px;
    border-bottom: 1px solid var(--border);
  }

  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0.02em;
  }

  #sync {
    color: var(--muted);
    font-size: 0.75rem;
  }

  #sync i {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 7px;
    border: 1px solid currentColor;
    border-radius: 50%;
  }

  #sync.loading i {
    border-color: var(--accent);
    border-top-color: transparent;
    animation: spin 0.7s linear infinite;
  }

  #sync.failed {
    color: var(--danger);
  }

  label,
  dt {
    display: block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  label[for='grid-pitch'] {
    margin-top: 14px;
  }

  .grid-control {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  #grid-pitch {
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  #grid-pitch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  #grid-pitch-value {
    flex: 0 0 auto;
    min-width: 4.5ch;
    color: var(--on-surface);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .materials {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 16px;
    font-size: 12px;
    line-height: 1.4;
  }

  .materials span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .materials i {
    width: 10px;
    height: 10px;
    border: 1px solid var(--muted);
    background: var(--model);
  }
  .materials i.secondary {
    background: var(--model-secondary);
  }

  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 18px 0 0;
  }

  dt {
    margin-bottom: 4px;
  }

  dd {
    margin: 0;
    overflow: hidden;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    position: fixed;
    right: 30px;
    bottom: 20px;
    margin: 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 560px) {
    .hint {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
    }
  }
</style>
