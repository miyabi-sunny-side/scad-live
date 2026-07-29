export function createModelState() {
  const state = $state({
    models: [],
    selected: '',
    dimensions: '—',
    status: 'Scanning',
  });
  return state;
}
