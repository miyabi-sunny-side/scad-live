<script>
  import { highlightParts, rankFiles } from './fuzzy.js';
  import { filesInScope, listDirScopes, parentDir } from './model-tree.js';

  let { models = [], selected = '', disabled = false, onSelect } = $props();

  let dialog = $state();
  let searchEl = $state();
  let resultsEl = $state();
  let query = $state('');
  let dir = $state('');
  let active = $state(0);

  const scopes = $derived(listDirScopes(models));
  const scoped = $derived(filesInScope(models, dir));
  const ranked = $derived(rankFiles(query, scoped));
  const matches = $derived(ranked.filter((item) => item.matched));
  const label = $derived(selected || '—');

  const activePath = $derived(matches[active]?.path);

  const open = () => {
    if (disabled) return;
    query = '';
    dir = parentDir(selected);
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

  const clampActive = () => {
    if (matches.length === 0) {
      active = 0;
      return;
    }
    if (active >= matches.length) active = matches.length - 1;
    if (active < 0) active = 0;
  };

  $effect(() => {
    ranked;
    clampActive();
  });

  const onDialogKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onSearchKeydown = (event) => {
    if (event.key === 'Escape') return;
    if (matches.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = (active + 1) % matches.length;
      scrollActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active - 1 + matches.length) % matches.length;
      scrollActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const match = matches[active];
      if (match) choose(match.path);
    }
  };

  const scrollActive = () => {
    queueMicrotask(() => {
      const options = resultsEl?.children;
      if (!options) return;
      for (const option of options) {
        if (
          option.getAttribute?.('aria-selected') === 'true' &&
          typeof option.scrollIntoView === 'function'
        ) {
          option.scrollIntoView({ block: 'nearest' });
          return;
        }
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

    <div class="columns">
      <div class="files">
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
          aria-activedescendant={activePath
            ? `model-option-${ranked.findIndex((item) => item.path === activePath)}`
            : undefined}
          onkeydown={onSearchKeydown}
          oninput={() => {
            active = 0;
          }}
        />

        <div
          id="model-results"
          class="results"
          role="listbox"
          aria-label="Models"
          bind:this={resultsEl}
        >
          {#if ranked.length === 0}
            <p class="empty" role="status">No models in this directory</p>
          {:else}
            {#each ranked as item, index (item.path)}
              <button
                id="model-option-{index}"
                type="button"
                class="option"
                class:active={item.matched && item.path === activePath}
                class:dimmed={!item.matched}
                role="option"
                tabindex="-1"
                aria-selected={item.matched && item.path === activePath}
                data-index={index}
                data-path={item.path}
                data-kind="file"
                data-matched={item.matched}
                onmouseenter={() => {
                  if (item.matched) {
                    active = matches.findIndex(
                      (match) => match.path === item.path,
                    );
                  }
                }}
                onclick={() => choose(item.path)}
              >
                <span class="name">
                  {#each highlightParts(item.path, item.indices) as part, partIndex (partIndex)}
                    {#if part.match}<mark>{part.text}</mark
                      >{:else}{part.text}{/if}
                  {/each}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <div id="model-dirs" class="dirs" role="listbox" aria-label="Directory">
        {#each scopes as scope (scope)}
          <button
            type="button"
            class="dir"
            class:current={scope === dir}
            role="option"
            aria-selected={scope === dir}
            data-dir={scope}
            onclick={() => enterDir(scope)}
          >
            {scope || 'dist'}
          </button>
        {/each}
      </div>
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

  .columns {
    display: grid;
    grid-template-columns: 3fr 7fr;
    gap: 12px;
    min-height: 200px;
    max-height: min(50vh, 420px);
  }

  .dirs {
    grid-column: 1;
    grid-row: 1;
  }

  .files {
    grid-column: 2;
    grid-row: 1;
  }

  .dirs,
  .results {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  .dirs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
  }

  .files {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
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

  .results {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
  }

  .dir,
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

  .dir {
    overflow: hidden;
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dir.current,
  .dir:hover,
  .option.active,
  .option:hover:not(.dimmed) {
    background: var(--accent-subtle);
  }

  .dir:focus-visible,
  .option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .option.dimmed {
    color: var(--muted);
    opacity: 0.62;
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

  @media (max-width: 560px) {
    .columns {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
      max-height: min(60vh, 520px);
    }

    .dirs {
      grid-column: 1;
      grid-row: 1;
      max-height: 28vh;
    }

    .files {
      grid-column: 1;
      grid-row: 2;
    }
  }
</style>
