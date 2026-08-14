/** First pathname segments that already belong to the server. */
const RESERVED_SEGMENTS = Object.freeze(['api', 'models', 'events', 'static']);

const reserved = new Set(RESERVED_SEGMENTS);

const isStlPath = (path) => /\.stl$/i.test(path);

export function canPublishPath(path) {
  if (!path) return true;
  const first = path.split('/')[0];
  return Boolean(first) && !reserved.has(first);
}

/** Drop reserved-prefix paths that cannot be a viewer URL. */
export function publishableModels(paths) {
  return paths.filter((path) => path && canPublishPath(path));
}

/** Encode a dist-relative STL path as a viewer pathname (`/` for none). */
export function modelToPathname(path) {
  if (!path) return '/';
  return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Parse a viewer pathname into a dist-relative STL path.
 * `/` → `''`. Reserved, unsafe, or non-STL paths → `null`.
 */
export function pathnameToModel(pathname) {
  if (!pathname || pathname === '/') return '';
  const raw = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return '';

  const segments = [];
  for (const part of raw.split('/')) {
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/')
    ) {
      return null;
    }
    segments.push(decoded);
  }

  if (reserved.has(segments[0])) return null;
  const path = segments.join('/');
  return isStlPath(path) ? path : null;
}

/**
 * Decide which model to show and whether the address bar needs replaceState.
 * `urlModel` is `''` for `/`, a path, or `null` when the URL is unusable.
 * `preferred` is a listed path to keep, `null` to force fallback, or omitted
 * to honor the URL.
 */
export function resolveRoute(models, urlModel, preferred) {
  const selectable = publishableModels(models);
  if (selectable.length === 0) {
    return { selected: '', publish: '', replace: urlModel !== '' };
  }

  if (preferred === null) {
    const selected = selectable[0];
    return { selected, publish: selected, replace: true };
  }

  if (typeof preferred === 'string' && selectable.includes(preferred)) {
    return {
      selected: preferred,
      publish: preferred,
      replace: urlModel !== preferred,
    };
  }

  if (urlModel && selectable.includes(urlModel)) {
    return { selected: urlModel, publish: urlModel, replace: false };
  }

  const selected = selectable[0];
  return { selected, publish: selected, replace: urlModel !== selected };
}

const writeUrl = (path, replace) => {
  const next = modelToPathname(path);
  const { location, history } = globalThis;
  if (!location || !history || location.pathname === next) return;
  const href = `${next}${location.search}${location.hash}`;
  if (replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
};

export function pushModel(path) {
  if (path && !canPublishPath(path)) return;
  writeUrl(path, false);
}

export function replaceModel(path) {
  if (path && !canPublishPath(path)) {
    writeUrl('', true);
    return;
  }
  writeUrl(path, true);
}
