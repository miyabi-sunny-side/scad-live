/**
 * Subsequence fuzzy match with ranking and highlight indices.
 * Returns null when the query is not a subsequence of the text.
 */
export function fuzzyScore(query, text) {
  if (!query) return { score: 0, indices: [] };

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices = [];
  let qi = 0;
  let score = 0;
  let prev = -2;
  const baseStart = text.lastIndexOf('/') + 1;

  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;
    indices.push(ti);
    score += 1;
    if (ti === prev + 1) score += 5;
    if (
      ti === 0 ||
      text[ti - 1] === '/' ||
      text[ti - 1] === '-' ||
      text[ti - 1] === '_'
    ) {
      score += 3;
    }
    if (ti === baseStart) score += 4;
    prev = ti;
    qi += 1;
  }

  if (qi < q.length) return null;

  score -= text.length * 0.01;
  const basename = text.slice(baseStart);
  if (basename.toLowerCase().includes(q)) score += 10;
  return { score, indices };
}

/**
 * Rank scoped files without dropping misses: matches first (fzf order),
 * then unmatched paths in stable path order.
 */
export function rankFiles(query, paths) {
  const trimmed = query.trim();
  if (!trimmed) {
    return paths.map((path) => ({
      path,
      score: 0,
      indices: [],
      matched: true,
    }));
  }

  const matched = [];
  const unmatched = [];
  for (const path of paths) {
    const hit = fuzzyScore(trimmed, path);
    if (hit) matched.push({ path, ...hit, matched: true });
    else unmatched.push({ path, score: 0, indices: [], matched: false });
  }
  matched.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  unmatched.sort((a, b) => a.path.localeCompare(b.path));
  return [...matched, ...unmatched];
}

/** Split text into contiguous match / non-match runs for safe text rendering. */
export function highlightParts(text, indices) {
  if (!indices?.length) return [{ text, match: false }];

  const matched = new Set(indices);
  const parts = [];
  let buffer = '';
  let isMatch = matched.has(0);

  for (let i = 0; i < text.length; i += 1) {
    const next = matched.has(i);
    if (i > 0 && next !== isMatch) {
      parts.push({ text: buffer, match: isMatch });
      buffer = text[i];
      isMatch = next;
    } else {
      buffer += text[i];
    }
  }
  parts.push({ text: buffer, match: isMatch });
  return parts;
}
