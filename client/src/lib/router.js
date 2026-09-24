/** First pathname segments that already belong to the server. */
const RESERVED_SEGMENTS = Object.freeze(['api', 'models', 'events', 'static']);

const reserved = new Set(RESERVED_SEGMENTS);

const is3mfPath = (path) => /\.3mf$/i.test(path);

export function canPublishPath(path) {
  if (!path) return true;
  const first = path.split('/')[0];
  return Boolean(first) && !reserved.has(first);
}

/** Drop reserved-prefix paths that cannot be a viewer URL. */
export function publishableModels(paths) {
  return paths.filter(
    (path) => path && is3mfPath(path) && canPublishPath(path),
  );
}

/** Encode a dist-relative 3MF path as a viewer pathname (`/` for none). */
export function modelToPathname(path) {
  if (!path) return '/';
  return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Parse a viewer pathname into a dist-relative 3MF path.
 * `/` → `''`. Reserved, unsafe, or non-3MF paths → `null`.
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
  const path = segments.join('/').replace(/\.stl$/i, '.3mf');
  return is3mfPath(path) ? path : null;
}

/**
 * Decide which model the current URL means.
 * `urlModel` is `''` for `/`, a path, or `null` when the URL is unusable.
 * A path the list does not (yet) contain stays selected: the address bar is
 * the intent, and dist entries come and go while OpenSCAD re-renders. Only an
 * URL that names nothing falls back to the first publishable model.
 */
export function resolveRoute(models, urlModel) {
  if (urlModel && canPublishPath(urlModel)) {
    return { selected: urlModel, publish: urlModel };
  }
  const selected = publishableModels(models)[0] ?? '';
  return { selected, publish: selected };
}

/**
 * Writing the pathname the address bar already shows is a no-op, so callers
 * never have to ask whether the URL needs correcting — and `popstate` cannot
 * rewrite the history entry it just restored.
 */
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
