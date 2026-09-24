export function parentDir(dir) {
  if (!dir) return '';
  const index = dir.lastIndexOf('/');
  return index === -1 ? '' : dir.slice(0, index);
}

/** Dist root plus every directory prefix implied by the path list. */
export function listDirScopes(paths) {
  const scopes = new Set(['']);
  for (const path of paths) {
    const parts = path.split('/');
    parts.pop();
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      scopes.add(prefix);
    }
  }
  return [...scopes].sort((a, b) => a.localeCompare(b));
}

/** Every 3MF under a directory scope, including descendants. */
export function filesInScope(paths, dir = '') {
  if (!dir) return [...paths].sort((a, b) => a.localeCompare(b));
  const prefix = `${dir}/`;
  return paths
    .filter((path) => path.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));
}
