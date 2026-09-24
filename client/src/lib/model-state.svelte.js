export function createModelState() {
  const state = $state({
    models: [],
    selected: '',
    dimensions: '—',
    roles: [],
    status: 'Scanning',
  });
  return state;
}
