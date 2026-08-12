<script>
  import { fuzzyRank, highlightParts } from './fuzzy.js';
  import { breadcrumbs, listDir, parentDir } from './model-tree.js';

  let { models = [], selected = '', disabled = false, onSelect } = $props();

  let dialog = $state();
  let searchEl = $state();
  let resultsEl = $state();
  let query = $state('');
  let dir = $state('');
  let active = $state(0);

  const searching = $derived(query.trim().length > 0);

  const items = $derived.by(() => {
    if (searching) {
      return fuzzyRank(query, models).map((match) => ({
        kind: 'file',
        name: match.path,
        path: match.path,
        indices: match.indices,
      }));
    }
    return listDir(models, dir).map((entry) => ({
      ...entry,
      indices: [],
    }));
  });

  const crumbs = $derived(breadcrumbs(dir));
  const label = $derived(selected || '—');

  const open = () => {
    if (disabled) return;
    query = '';
    dir = selected.includes('/')
      ? selected.slice(0, selected.lastIndexOf('/'))
      : '';
    active = 0;
    dialog.showModal();
    queueMicrotask(() => searchEl?.focus());
  };

  const close = () => {
    if (dialog?.open) dialog.close();
  };

  const choose = (path) => {
    onSelect?.(path);
    close();
  };

  const enterDir = (path) => {
    dir = path;
    active = 0;
  };

  const activate = (item) => {
    if (item.kind === 'dir') enterDir(item.path);
    else choose(item.path);
  };

  const clampActive = () => {
    if (items.length === 0) {
      active = 0;
      return;
    }
    if (active >= items.length) active = items.length - 1;
    if (active < 0) active = 0;
  };

  $effect(() => {
    items;
    clampActive();
  });

  /** Escape closes from anywhere; combobox keys only when search owns focus. */
  const onDialogKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onSearchKeydown = (event) => {
    if (event.key === 'Escape') return;
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = (active + 1) % items.length;
      scrollActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active - 1 + items.length) % items.length;
      scrollActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(items[active]);
    } else if (event.key === 'Backspace' && !searching && query === '' && dir) {
      event.preventDefault();
      dir = parentDir(dir);
      active = 0;
    }
  };

  const scrollActive = () => {
    queueMicrotask(() => {
      const option = resultsEl?.children?.[active];
      if (option && typeof option.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  };
</script>

<button
  id="models"
  type="button"
  class="opener"
  aria-haspopup="dialog"
  aria-controls="model-picker"
  data-value={selected}
  data-count={models.length}
  title={selected}
  {disabled}
  onclick={open}
>
  {label}
</button>

<dialog
  id="model-picker"
  bind:this={dialog}
  aria-label="Select model"
  onkeydown={onDialogKeydown}
  onclose={() => {
    query = '';
  }}
>
  <div class="sheet">
    <header class="sheet-header">
      <h2>Model</h2>
      <button type="button" class="close" onclick={close}>Close</button>
    </header>

    <label class="search-label" for="model-search">Filter</label>
    <input
      id="model-search"
      bind:this={searchEl}
      bind:value={query}
      type="search"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      placeholder="Type to filter paths…"
      aria-controls="model-results"
      aria-expanded="true"
      aria-autocomplete="list"
      aria-activedescendant={items[active]
        ? `model-option-${active}`
        : undefined}
      onkeydown={onSearchKeydown}
      oninput={() => {
        active = 0;
      }}
    />

    {#if !searching}
      <nav class="crumbs" aria-label="Directory">
        <button type="button" class="crumb" onclick={() => enterDir('')}>
          dist
        </button>
        {#each crumbs as crumb (crumb.path)}
          <span class="sep" aria-hidden="true">/</span>
          <button
            type="button"
            class="crumb"
            onclick={() => enterDir(crumb.path)}>{crumb.name}</button
          >
        {/each}
      </nav>
    {/if}

    <div
      id="model-results"
      class="results"
      role="listbox"
      aria-label={searching ? 'Matching models' : 'Directory contents'}
      bind:this={resultsEl}
    >
      {#if items.length === 0}
        <p class="empty" role="status">No matches</p>
      {:else}
        {#each items as item, index (item.kind + ':' + item.path)}
          <button
            id="model-option-{index}"
            type="button"
            class="option"
            class:active={index === active}
            class:dir={item.kind === 'dir'}
            role="option"
            tabindex="-1"
            aria-selected={index === active}
            data-index={index}
            data-path={item.path}
            data-kind={item.kind}
            onmouseenter={() => {
              active = index;
            }}
            onclick={() => activate(item)}
          >
            {#if item.kind === 'dir'}
              <span class="kind" aria-hidden="true">▸</span>
              <span class="name">{item.name}/</span>
            {:else if searching}
              <span class="name">
                {#each highlightParts(item.path, item.indices) as part, partIndex (partIndex)}
                  {#if part.match}<mark>{part.text}</mark
                    >{:else}{part.text}{/if}
                {/each}
              </span>
            {:else}
              <span class="kind" aria-hidden="true">·</span>
              <span class="name">{item.name}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .opener {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: 8px 11px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--on-surface);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .opener:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    background: var(--accent-subtle);
  }

  .opener:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  dialog {
    width: 80vw;
    max-width: calc(100vw - 24px);
    max-height: min(80vh, 720px);
    padding: 0;
    border: 1px solid var(--border);
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--surface-raised);
    color: var(--on-surface);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }

  .sheet {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(80vh, 720px);
    padding: 18px;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
  }

  .close {
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--on-surface);
    cursor: pointer;
  }

  .close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .search-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  #model-search {
    width: 100%;
    min-height: 44px;
    padding: 8px 11px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--on-surface);
  }

  #model-search:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    background: var(--accent-subtle);
  }

  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.04em;
  }

  .crumb {
    padding: 2px 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .crumb:hover,
  .crumb:focus-visible {
    color: var(--on-surface);
    background: var(--accent-subtle);
  }

  .crumb:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .sep {
    opacity: 0.7;
  }

  .results {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-height: 200px;
    max-height: min(50vh, 420px);
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  .option {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-height: 40px;
    padding: 8px 11px;
    border: 0;
    background: transparent;
    color: var(--on-surface);
    text-align: left;
    cursor: pointer;
  }

  .option.active,
  .option:hover {
    background: var(--accent-subtle);
  }

  .option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .option.dir .name {
    font-weight: 600;
  }

  .kind {
    width: 1rem;
    color: var(--muted);
    text-align: center;
  }

  .name {
    overflow: hidden;
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  mark {
    padding: 0;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }

  .empty {
    margin: 0;
    padding: 18px 11px;
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
