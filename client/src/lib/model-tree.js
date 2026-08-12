/**
 * Directory browser over flat relative STL paths.
 * @param {string[]} paths
 * @param {string} dir current directory ('' = root)
 * @returns {{ kind: 'dir' | 'file', name: string, path: string }[]}
 */
export function listDir(paths, dir = '') {
  const prefix = dir ? `${dir}/` : '';
  const dirs = new Set();
  const files = [];

  for (const path of paths) {
    if (dir) {
      if (path !== dir && !path.startsWith(prefix)) continue;
      if (path === dir) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        files.push({ kind: 'file', name: rest, path });
      } else {
        dirs.add(rest.slice(0, slash));
      }
      continue;
    }

    const slash = path.indexOf('/');
    if (slash === -1) {
      files.push({ kind: 'file', name: path, path });
    } else {
      dirs.add(path.slice(0, slash));
    }
  }

  const dirEntries = [...dirs]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      kind: 'dir',
      name,
      path: dir ? `${dir}/${name}` : name,
    }));

  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirEntries, ...files];
}

/** Breadcrumb crumbs for a directory path (excluding root). */
export function breadcrumbs(dir) {
  if (!dir) return [];
  const parts = dir.split('/');
  return parts.map((name, index) => ({
    name,
    path: parts.slice(0, index + 1).join('/'),
  }));
}

export function parentDir(dir) {
  if (!dir) return '';
  const index = dir.lastIndexOf('/');
  return index === -1 ? '' : dir.slice(0, index);
}
