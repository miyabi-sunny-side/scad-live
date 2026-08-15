import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('tests/fixtures/dist');
const box = path.join(dist, 'box.stl');

test.describe.configure({ mode: 'serial' });

const modelValue = (page) => page.locator('#models').getAttribute('data-value');
const modelCount = async (page) =>
  Number(await page.locator('#models').getAttribute('data-count'));
const modelPathname = (page) => new URL(page.url()).pathname;

/**
 * Record every address-bar write so a test can tell a user `pushState` from
 * an automatic `replaceState`; the resulting pathname alone cannot.
 * The recorder is per navigation, so a reload starts from an empty log.
 */
const trackHistory = (page) =>
  page.addInitScript(() => {
    window.__historyCalls = [];
    for (const kind of ['pushState', 'replaceState']) {
      const original = history[kind].bind(history);
      history[kind] = (state, unused, url) => {
        window.__historyCalls.push([kind, url]);
        original(state, unused, url);
      };
    }
  });

const historyCalls = (page) => page.evaluate(() => window.__historyCalls);

const openPicker = async (page) => {
  await page.locator('#models').click();
  await expect(page.locator('#model-picker')).toBeVisible();
  await expect(page.locator('#model-search')).toBeFocused();
};

const pickModel = async (page, modelPath) => {
  await openPicker(page);
  await page.locator('#model-dirs [data-dir=""]').click();
  await page.locator('#model-search').fill(modelPath);
  await page
    .locator('#model-results [data-kind="file"]')
    .filter({ hasText: modelPath })
    .first()
    .click();
  await expect(page.locator('#model-picker')).toBeHidden();
};

test('loads without console errors and reports dimensions', async ({
  page,
}) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await expect(page.locator('#dimensions')).toHaveText('10.0 × 20.0 × 30.0 mm');
  await expect.poll(() => modelValue(page)).toBe('box.stl');
  await expect.poll(() => modelPathname(page)).toBe('/box.stl');
  expect(new URL(page.url()).search).toBe('');
  const heading = await page.locator('h1').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  });
  const caption = await page
    .locator('label[for="models"]')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight,
      };
    });
  expect(heading).toEqual({
    size: '17px',
    weight: '600',
    lineHeight: '22.1px',
  });
  expect(caption).toEqual({
    size: '12px',
    weight: '400',
    lineHeight: '16.8px',
  });
  expect(
    (await page.locator('#models').boundingBox()).height,
  ).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#grid-pitch-value')).toHaveText('1 mm');
  expect(errors).toEqual([]);
});

test('uses canonical Sumi tokens', async ({ page }) => {
  const tokens = [
    '--surface',
    '--surface-raised',
    '--on-surface',
    '--muted',
    '--border',
    '--accent',
    '--model',
    '--grid-major',
    '--grid-minor',
    '--danger',
  ];
  const readTokens = () =>
    page.evaluate(
      (names) =>
        Object.fromEntries(
          names.map((name) => [
            name,
            getComputedStyle(document.documentElement)
              .getPropertyValue(name)
              .trim(),
          ]),
        ),
      tokens,
    );

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await readTokens()).toEqual({
    '--surface': '#191919',
    '--surface-raised': '#232323',
    '--on-surface': '#e6e6e6',
    '--muted': '#9a9a9a',
    '--border': '#333333',
    '--accent': '#d7ef52',
    '--model': '#dbe955',
    '--grid-major': '#626b52',
    '--grid-minor': '#292d25',
    '--danger': '#ff6b6b',
  });
  expect(
    (await page.evaluate(() => window.__scadLive.getViewerState()))
      .sceneBackground,
  ).toBe('#191919');
});

test('uses canonical Kinari tokens', async ({ page }) => {
  const tokens = [
    '--surface',
    '--surface-raised',
    '--on-surface',
    '--muted',
    '--border',
    '--accent',
    '--model',
    '--grid-major',
    '--grid-minor',
    '--danger',
  ];
  const readTokens = () =>
    page.evaluate(
      (names) =>
        Object.fromEntries(
          names.map((name) => [
            name,
            getComputedStyle(document.documentElement)
              .getPropertyValue(name)
              .trim(),
          ]),
        ),
      tokens,
    );

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await readTokens()).toEqual({
    '--surface': '#faf6ef',
    '--surface-raised': '#fffdf8',
    '--on-surface': '#3a2f28',
    '--muted': '#6f6257',
    '--border': '#e3d9c9',
    '--accent': '#526400',
    '--model': '#899936',
    '--grid-major': '#9f9789',
    '--grid-minor': '#d4ccbf',
    '--danger': '#9c2b1d',
  });
  expect(
    (await page.evaluate(() => window.__scadLive.getViewerState()))
      .sceneBackground,
  ).toBe('#faf6ef');
});

test('reloads the WebGL scene when the OS color scheme changes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  expect(
    (await page.evaluate(() => window.__scadLive.getViewerState()))
      .sceneBackground,
  ).toBe('#191919');

  const loaded = page.waitForEvent('load');
  await page.emulateMedia({ colorScheme: 'light' });
  await loaded;
  await expect(page.locator('#state')).toHaveText('Ready');
  expect(
    (await page.evaluate(() => window.__scadLive.getViewerState()))
      .sceneBackground,
  ).toBe('#faf6ef');
});

test('renders markup-like model names only as text', async ({ page }) => {
  const filename = 'bad<img src=x onerror=window.__injected=1>.stl';
  const malicious = path.join(dist, filename);
  await fs.writeFile(malicious, 'not an STL');
  try {
    await page.goto('/');
    await pickModel(page, filename);
    await expect(page.locator('#state')).toHaveText(`Failed: ${filename}`);
    await expect(page.locator('#sync')).toContainText(`Failed: ${filename}`);
    await expect(page.locator('#sync img')).toHaveCount(0);
    await openPicker(page);
    await page.locator('#model-search').fill(filename);
    await expect(page.locator('#model-results img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
    await page.keyboard.press('Escape');
  } finally {
    await fs.rm(malicious, { force: true });
  }
});

test('restores the last valid selection', async ({ page }) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/');
    await expect.poll(() => modelCount(page)).toBe(2);
    await pickModel(page, 'nested/second.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelPathname(page)).toBe('/nested/second.stl');
    await page.reload();
    await expect.poll(() => modelValue(page)).toBe('nested/second.stl');
    await expect.poll(() => modelPathname(page)).toBe('/nested/second.stl');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('opens a nested model from its viewer URL', async ({ page }) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/nested/second.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelValue(page)).toBe('nested/second.stl');
    await expect.poll(() => modelPathname(page)).toBe('/nested/second.stl');
    await openPicker(page);
    await expect(
      page.locator('#model-dirs [data-dir="nested"].current'),
    ).toBeVisible();
    await expect(page.locator('#model-results [data-kind="file"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('#model-results [data-path="nested/second.stl"]'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('walks model history with Back and Forward', async ({ page }) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/');
    await expect.poll(() => modelValue(page)).toBe('box.stl');
    await pickModel(page, 'nested/second.stl');
    await expect.poll(() => modelPathname(page)).toBe('/nested/second.stl');
    await page.goBack();
    await expect.poll(() => modelValue(page)).toBe('box.stl');
    await expect.poll(() => modelPathname(page)).toBe('/box.stl');
    await page.goForward();
    await expect.poll(() => modelValue(page)).toBe('nested/second.stl');
    await expect.poll(() => modelPathname(page)).toBe('/nested/second.stl');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('keeps the inspector visible in the empty state', async ({ page }) => {
  await page.route('**/api/models', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('#models')).toBeDisabled();
  await expect(page.locator('#dimensions')).toHaveText('—');
  await expect(page.locator('#state')).toHaveText('No STL files found');
});

test('SSE refreshes a changed model without moving the camera and refreshes add/unlink', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const added = path.join(dist, 'added.stl');
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await page.locator('#models').focus();
  const before = await page.evaluate(
    () => window.__scadLive.getViewerState().camera,
  );
  try {
    await fs.writeFile(box, original.replaceAll('30', '40'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 40.0 mm',
    );
    const after = await page.evaluate(
      () => window.__scadLive.getViewerState().camera,
    );
    expect(after.zoom).toBe(before.zoom);
    after.position.forEach((value, index) =>
      expect(value).toBeCloseTo(before.position[index], 8),
    );
    after.target.forEach((value, index) =>
      expect(value).toBeCloseTo(before.target[index], 8),
    );
    await expect(page.locator('#models')).toBeFocused();

    await fs.copyFile(box, added);
    await expect.poll(() => modelCount(page)).toBe(2);
    await fs.rm(added);
    await expect.poll(() => modelCount(page)).toBe(1);

    await fs.rm(box);
    await expect(page.locator('#models')).toBeDisabled();
    await expect(page.locator('#state')).toHaveText('Missing: box.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 40.0 mm',
    );
  } finally {
    await fs.writeFile(box, original);
    await fs.rm(added, { force: true });
  }
});

test('exposes only the read-only 3D regression probe', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  const probe = await page.evaluate(() => {
    const state = window.__scadLive.getViewerState();
    return {
      frozen: Object.isFrozen(state) && Object.isFrozen(state.camera),
      keys: Object.keys(window.__scadLive),
      state,
    };
  });
  expect(probe.keys).toEqual(['getViewerState']);
  expect(probe.frozen).toBe(true);
  expect(probe.state.camera.up).toEqual([0, 0, 1]);
  expect(probe.state.grids.map((grid) => grid.divisions)).toEqual([400, 40]);
  expect(probe.state.grids.map((grid) => grid.cellSize)).toEqual([1, 10]);
  expect(probe.state.grids.map((grid) => grid.size)).toEqual([400, 400]);
  for (const grid of probe.state.grids)
    expect(grid.rotationX).toBeCloseTo(Math.PI / 2, 8);
  expect(probe.state.pixelRatio).toBeLessThanOrEqual(2);
  expect(probe.state.meshId).not.toBeNull();
  expect(probe.state.disposal).toEqual({ geometries: 0, materials: 0 });
  expect(probe.state.threeRevision).toBe('185');
});

test('changes grid pitch through the inspector slider', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await expect(page.locator('#grid-pitch-value')).toHaveText('1 mm');

  await page.locator('#grid-pitch').fill('4');
  await expect(page.locator('#grid-pitch-value')).toHaveText('10 mm');
  let grids = await page.evaluate(
    () => window.__scadLive.getViewerState().grids,
  );
  expect(grids.map((grid) => grid.cellSize)).toEqual([10, 100]);
  expect(grids.map((grid) => grid.divisions)).toEqual([40, 4]);
  expect(grids.map((grid) => grid.size)).toEqual([400, 400]);

  await page.locator('#grid-pitch').fill('0');
  await expect(page.locator('#grid-pitch-value')).toHaveText('0.5 mm');
  grids = await page.evaluate(() => window.__scadLive.getViewerState().grids);
  expect(grids.map((grid) => grid.cellSize)).toEqual([0.5, 5]);
  expect(grids.map((grid) => grid.divisions)).toEqual([800, 80]);
});

test('ignores leftover localStorage and replaceStates / to the first model', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('scad-live:model', 'nested/ghost.stl'),
  );
  await page.goto('/');
  await expect.poll(() => modelValue(page)).toBe('box.stl');
  await expect.poll(() => modelPathname(page)).toBe('/box.stl');
  await expect(page.locator('#state')).toHaveText('Ready');
  await expect(page.locator('#dimensions')).toHaveText('10.0 × 20.0 × 30.0 mm');
  expect(
    await page.evaluate(() => localStorage.getItem('scad-live:model')),
  ).toBe('nested/ghost.stl');
});

test('recovers when the initial model scan fails', async ({ page }) => {
  const recovery = path.join(dist, 'recovery.stl');
  let scans = 0;
  await page.route('**/api/models', async (route) => {
    scans += 1;
    if (scans <= 2) await route.fulfill({ status: 500, body: 'failed' });
    else await route.continue();
  });
  try {
    await page.goto('/recovery.stl');
    await expect(page.locator('#state')).toHaveText('Failed to scan models');
    await expect.poll(() => scans).toBeGreaterThanOrEqual(2);
    await fs.copyFile(box, recovery);
    await expect.poll(() => modelCount(page)).toBe(2);
    await expect.poll(() => modelValue(page)).toBe('recovery.stl');
    await expect.poll(() => modelPathname(page)).toBe('/recovery.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
    expect(scans).toBeGreaterThanOrEqual(3);
  } finally {
    await fs.rm(recovery, { force: true });
  }
});

test('reconnects after the first SSE request aborts and applies an actual event', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  let connections = 0;
  let releaseReconnect;
  const reconnectGate = new Promise((resolve) => {
    releaseReconnect = resolve;
  });
  await page.route('**/events', async (route) => {
    connections += 1;
    if (connections === 1) {
      await route.abort('connectionaborted');
    } else if (connections === 2) {
      await reconnectGate;
      await route.continue();
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('Reconnecting');
    await expect.poll(() => connections, { timeout: 10000 }).toBe(2);
    releaseReconnect();
    await expect(page.locator('#state')).toHaveText('Ready');
    await fs.writeFile(box, original.replaceAll('30', '40'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 40.0 mm',
    );
  } finally {
    await fs.writeFile(box, original);
  }
});

test('retains a valid mesh through corruption and recovers on a later change', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  const before = await page.evaluate(() => window.__scadLive.getViewerState());
  try {
    await fs.writeFile(box, 'not an STL');
    await expect(page.locator('#state')).toHaveText('Failed: box.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
    const failed = await page.evaluate(() =>
      window.__scadLive.getViewerState(),
    );
    expect(failed.meshId).toBe(before.meshId);
    expect(failed.camera.zoom).toBe(before.camera.zoom);
    expect(failed.camera.up).toEqual(before.camera.up);
    failed.camera.position.forEach((value, index) =>
      expect(value).toBeCloseTo(before.camera.position[index], 8),
    );
    failed.camera.target.forEach((value, index) =>
      expect(value).toBeCloseTo(before.camera.target[index], 8),
    );

    await fs.writeFile(box, original.replaceAll('30', '40'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 40.0 mm',
    );
    const recovered = await page.evaluate(() =>
      window.__scadLive.getViewerState(),
    );
    expect(recovered.meshId).not.toBe(before.meshId);
    expect(recovered.disposal.materials).toBe(1);
  } finally {
    await fs.writeFile(box, original);
  }
});

test('does not let a stale model response overwrite a newer selection', async ({
  page,
}) => {
  const first = await fs.readFile(box);
  const second = Buffer.from(first.toString().replaceAll('30', '40'));
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await page.route('**/api/models', (route) =>
    route.fulfill({ json: ['first.stl', 'second.stl'] }),
  );
  await page.route('**/models/first.stl', async (route) => {
    await firstGate;
    await route.fulfill({ contentType: 'model/stl', body: first });
  });
  await page.route('**/models/second.stl', (route) =>
    route.fulfill({ contentType: 'model/stl', body: second }),
  );

  await page.goto('/');
  await expect.poll(() => modelCount(page)).toBe(2);
  await pickModel(page, 'second.stl');
  await expect(page.locator('#dimensions')).toHaveText('10.0 × 20.0 × 40.0 mm');
  const secondState = await page.evaluate(() =>
    window.__scadLive.getViewerState(),
  );
  releaseFirst();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__scadLive.getViewerState().disposal.geometries,
      ),
    )
    .toBe(secondState.disposal.geometries + 1);
  await expect.poll(() => modelValue(page)).toBe('second.stl');
  await expect(page.locator('#dimensions')).toHaveText('10.0 × 20.0 × 40.0 mm');
  expect(
    await page.evaluate(() => window.__scadLive.getViewerState().meshId),
  ).toBe(secondState.meshId);
});

test('keeps Missing when a stale success lands after the file is unlinked', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const pending = path.join(dist, 'pending.stl');
  const body = original.replaceAll('30', '50');
  await fs.writeFile(pending, body);
  let releasePending;
  const pendingGate = new Promise((resolve) => {
    releasePending = resolve;
  });
  await page.route('**/models/pending.stl', async (route) => {
    await pendingGate;
    await route.fulfill({ contentType: 'model/stl', body });
  });
  try {
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelCount(page)).toBe(2);
    const ready = await page.evaluate(() => window.__scadLive.getViewerState());

    await pickModel(page, 'pending.stl');
    await expect(page.locator('#state')).toHaveText('Loading');

    // The selected path never changes here, so learning of the absence is what
    // has to disown the read that is still in flight for that same path.
    await fs.rm(pending);
    await expect(page.locator('#state')).toHaveText('Missing: pending.stl');

    releasePending();
    // The disowned read still parses and then throws its own geometry away,
    // which is the deterministic proof that it finished.
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scadLive.getViewerState().disposal.geometries,
        ),
      )
      .toBe(ready.disposal.geometries + 1);
    await expect(page.locator('#state')).toHaveText('Missing: pending.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
    const after = await page.evaluate(() => window.__scadLive.getViewerState());
    // The mesh on screen must be the same object, not a redraw of a file the
    // viewer already knows is gone: dimensions alone cannot tell those apart.
    expect(after.meshId).toBe(ready.meshId);
    // Replacing the mesh would have disposed its material too.
    expect(after.disposal.materials).toBe(ready.disposal.materials);
  } finally {
    await fs.rm(pending, { force: true });
  }
});

test('keeps Missing when a stale failure lands after the file is unlinked', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const pending = path.join(dist, 'pending.stl');
  await fs.writeFile(pending, original.replaceAll('30', '50'));
  let releasePending;
  const pendingGate = new Promise((resolve) => {
    releasePending = resolve;
  });
  await page.route('**/models/pending.stl', async (route) => {
    await pendingGate;
    await route.fulfill({ contentType: 'model/stl', body: 'not an STL' });
  });
  // A disowned read reports nothing at all, so this must stay empty.
  const warnings = [];
  page.on('console', (message) => {
    if (message.text().includes('Could not load pending.stl'))
      warnings.push(message.text());
  });
  try {
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelCount(page)).toBe(2);
    const ready = await page.evaluate(() => window.__scadLive.getViewerState());

    await pickModel(page, 'pending.stl');
    await expect(page.locator('#state')).toHaveText('Loading');

    await fs.rm(pending);
    await expect(page.locator('#state')).toHaveText('Missing: pending.stl');

    // The failing read no longer throws, so the arrival of its own response is
    // the sync point; a short settle then lets the handler finish reacting.
    const arrived = page.waitForResponse('**/models/pending.stl');
    releasePending();
    await arrived;
    await page.waitForTimeout(400);
    // `Failed: pending.stl` would be the older, less informative news.
    await expect(page.locator('#state')).toHaveText('Missing: pending.stl');
    expect(warnings).toEqual([]);
    const after = await page.evaluate(() => window.__scadLive.getViewerState());
    expect(after.meshId).toBe(ready.meshId);
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
  } finally {
    await fs.rm(pending, { force: true });
  }
});

test('keeps the selection while the selected model is unlinked and reloads it on return', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const next = path.join(dist, 'next.stl');
  await fs.writeFile(next, original.replaceAll('30', '50'));
  try {
    await page.goto('/');
    await expect.poll(() => modelValue(page)).toBe('box.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await page.locator('#models').focus();
    const before = await page.evaluate(() =>
      window.__scadLive.getViewerState(),
    );

    await fs.rm(box);
    await expect(page.locator('#state')).toHaveText('Missing: box.stl');
    await expect.poll(() => modelCount(page)).toBe(1);
    expect(await modelValue(page)).toBe('box.stl');
    expect(modelPathname(page)).toBe('/box.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
    await expect(page.locator('#models')).toBeFocused();
    // The mesh itself has to stay on screen, not merely its dimension text.
    expect(
      await page.evaluate(() => window.__scadLive.getViewerState().meshId),
    ).toBe(before.meshId);

    // A different height on return: the new dimensions prove the file was
    // really re-read, and a refit would move the camera along with them.
    await fs.writeFile(box, original.replaceAll('30', '60'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 60.0 mm',
    );
    await expect.poll(() => modelCount(page)).toBe(2);
    expect(await modelValue(page)).toBe('box.stl');
    expect(modelPathname(page)).toBe('/box.stl');
    const after = await page.evaluate(
      () => window.__scadLive.getViewerState().camera,
    );
    expect(after.zoom).toBe(before.camera.zoom);
    after.position.forEach((value, index) =>
      expect(value).toBeCloseTo(before.camera.position[index], 8),
    );
    after.target.forEach((value, index) =>
      expect(value).toBeCloseTo(before.camera.target[index], 8),
    );
  } finally {
    await fs.writeFile(box, original);
    await fs.rm(next, { force: true });
  }
});

test('keeps the selection through a full dist rebuild, including a reload', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const alt = path.join(dist, 'alt.stl');
  await fs.writeFile(alt, original.replaceAll('30', '50'));
  try {
    await page.goto('/');
    await expect.poll(() => modelCount(page)).toBe(2);
    await pickModel(page, 'box.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelPathname(page)).toBe('/box.stl');

    // The usual build script empties dist before OpenSCAD writes it again.
    await fs.rm(box);
    await fs.rm(alt);
    await expect(page.locator('#state')).toHaveText('Missing: box.stl');
    expect(await modelValue(page)).toBe('box.stl');
    expect(modelPathname(page)).toBe('/box.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 30.0 mm',
    );
    await page.waitForTimeout(600);

    await fs.writeFile(box, original);
    await fs.writeFile(alt, original.replaceAll('30', '50'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect.poll(() => modelCount(page)).toBe(2);
    expect(await modelValue(page)).toBe('box.stl');

    await page.reload();
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelValue(page)).toBe('box.stl');
    expect(modelPathname(page)).toBe('/box.stl');
  } finally {
    await fs.writeFile(box, original);
    await fs.rm(alt, { force: true });
  }
});

test('replaceStates the / fallback and pushStates only a user pick', async ({
  page,
}) => {
  const next = path.join(dist, 'next.stl');
  await fs.copyFile(box, next);
  try {
    await trackHistory(page);
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelCount(page)).toBe(2);
    await expect.poll(() => modelPathname(page)).toBe('/box.stl');
    expect(await historyCalls(page)).toEqual([['replaceState', '/box.stl']]);

    await pickModel(page, 'next.stl');
    await expect.poll(() => modelPathname(page)).toBe('/next.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    expect(await historyCalls(page)).toEqual([
      ['replaceState', '/box.stl'],
      ['pushState', '/next.stl'],
    ]);
  } finally {
    await fs.rm(next, { force: true });
  }
});

test('never touches history for a canonical URL or an unlinked selection', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  const next = path.join(dist, 'next.stl');
  await fs.writeFile(next, original.replaceAll('30', '50'));
  try {
    await trackHistory(page);
    await page.goto('/box.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelCount(page)).toBe(2);
    expect(await historyCalls(page)).toEqual([]);

    await fs.rm(box);
    await expect(page.locator('#state')).toHaveText('Missing: box.stl');
    expect(modelPathname(page)).toBe('/box.stl');
    expect(await historyCalls(page)).toEqual([]);
  } finally {
    await fs.writeFile(box, original);
    await fs.rm(next, { force: true });
  }
});

test('keeps a non-canonically encoded model and only replaceStates its spelling', async ({
  page,
}) => {
  const original = await fs.readFile(box, 'utf8');
  // `+` is legal in a pathname but is not what encodeURIComponent writes, so
  // the spelling has to be corrected. The `z` name keeps this model out of
  // the fallback slot, so staying selected cannot be confused with falling
  // back to the first model.
  const plus = path.join(dist, 'z+w.stl');
  await fs.writeFile(plus, original.replaceAll('30', '70'));
  try {
    await trackHistory(page);
    await page.goto('/z+w.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await expect.poll(() => modelCount(page)).toBe(2);
    expect(await modelValue(page)).toBe('z+w.stl');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 70.0 mm',
    );
    await expect.poll(() => modelPathname(page)).toBe('/z%2Bw.stl');
    expect(await historyCalls(page)).toEqual([['replaceState', '/z%2Bw.stl']]);
  } finally {
    await fs.rm(plus, { force: true });
  }
});

test('filters many models in the picker dialog', async ({ page }) => {
  const listed = Array.from({ length: 120 }, (_, index) => {
    const group = String(Math.floor(index / 10)).padStart(2, '0');
    const name = String(index).padStart(3, '0');
    return `batch-${group}/part-${name}.stl`;
  });
  listed[57] = 'batch-05/target-needle.stl';
  const body = await fs.readFile(box);
  await page.route('**/api/models', (route) => route.fulfill({ json: listed }));
  await page.route('**/models/**', (route) =>
    route.fulfill({ contentType: 'model/stl', body }),
  );

  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await openPicker(page);
  await page.locator('#model-dirs [data-dir=""]').click();
  await expect(page.locator('#model-results [data-kind="file"]')).toHaveCount(
    120,
  );
  await page.locator('#model-search').fill('needle');
  await expect(
    page.locator('#model-results [data-kind="file"][data-matched="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#model-results [data-kind="file"][data-matched="false"]'),
  ).toHaveCount(119);
  await expect(
    page.locator('#model-results [data-kind="file"]').first(),
  ).toHaveAttribute('data-path', 'batch-05/target-needle.stl');
  await expect(
    page.locator('#model-results [data-kind="file"]').last(),
  ).toHaveClass(/dimmed/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#model-picker')).toBeHidden();
  await expect.poll(() => modelValue(page)).toBe('batch-05/target-needle.stl');
  await expect
    .poll(() => modelPathname(page))
    .toBe('/batch-05/target-needle.stl');
  await expect(page.locator('#models')).toBeFocused();
});

test('clicking a dimmed picker row still selects that model', async ({
  page,
}) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/nested/second.stl');
    await expect.poll(() => modelValue(page)).toBe('nested/second.stl');
    await openPicker(page);
    await page.locator('#model-dirs [data-dir=""]').click();
    await page.locator('#model-search').fill('second');
    await expect(
      page.locator('#model-results [data-matched="false"]'),
    ).toHaveAttribute('data-path', 'box.stl');
    await page.locator('#model-results [data-matched="false"]').click();
    await expect(page.locator('#model-picker')).toBeHidden();
    await expect.poll(() => modelValue(page)).toBe('box.stl');
    await expect.poll(() => modelPathname(page)).toBe('/box.stl');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('omits reserved-prefix models from selection and the picker', async ({
  page,
}) => {
  const body = await fs.readFile(box);
  await page.route('**/api/models', (route) =>
    route.fulfill({
      json: ['api/hidden.stl', 'box.stl', 'static/hidden.stl'],
    }),
  );
  await page.route('**/models/**', (route) =>
    route.fulfill({ contentType: 'model/stl', body }),
  );

  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await expect.poll(() => modelValue(page)).toBe('box.stl');
  await expect.poll(() => modelCount(page)).toBe(1);
  await expect.poll(() => modelPathname(page)).toBe('/box.stl');
  await openPicker(page);
  await expect(page.locator('#model-results [data-kind="file"]')).toHaveCount(
    1,
  );
  await expect(
    page.locator('#model-results [data-path="box.stl"]'),
  ).toBeVisible();
  await expect(
    page.locator('#model-results [data-path="api/hidden.stl"]'),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('shows empty state when every listed model is under a reserved prefix', async ({
  page,
}) => {
  await page.route('**/api/models', (route) =>
    route.fulfill({ json: ['static/only.stl'] }),
  );
  await page.goto('/');
  await expect(page.locator('#models')).toBeDisabled();
  await expect(page.locator('#state')).toHaveText('No STL files found');
  await expect.poll(() => modelPathname(page)).toBe('/');
});

test('browses nested directories and cancels with Escape', async ({ page }) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/');
    await expect.poll(() => modelCount(page)).toBe(2);
    await openPicker(page);
    await expect(
      page.locator('#model-dirs [data-dir=""].current'),
    ).toBeVisible();
    await expect(page.locator('#model-results [data-kind="file"]')).toHaveCount(
      2,
    );
    await page.locator('#model-dirs [data-dir="nested"]').click();
    await expect(
      page.locator('#model-results [data-path="nested/second.stl"]'),
    ).toBeVisible();
    await expect(page.locator('#model-results [data-kind="file"]')).toHaveCount(
      1,
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('#model-picker')).toBeHidden();
    await expect(page.locator('#models')).toBeFocused();
    await expect.poll(() => modelValue(page)).toBe('box.stl');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('picker keeps options out of tab order and honors Close/crumb Enter', async ({
  page,
}) => {
  const second = path.join(dist, 'nested', 'second.stl');
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.copyFile(box, second);
  try {
    await page.goto('/');
    await expect.poll(() => modelCount(page)).toBe(2);
    await openPicker(page);

    const optionTabIndexes = await page
      .locator('#model-results [role="option"]')
      .evaluateAll((elements) => elements.map((element) => element.tabIndex));
    expect(optionTabIndexes.length).toBeGreaterThan(0);
    expect(optionTabIndexes.every((value) => value < 0)).toBe(true);

    await page.locator('#model-search').press('Shift+Tab');
    await expect(page.locator('#model-picker .close')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#model-picker')).toBeHidden();
    await expect.poll(() => modelValue(page)).toBe('box.stl');

    await openPicker(page);
    await page.locator('#model-search').press('Tab');
    await expect(
      page.locator('#model-dirs [data-dir=""]').first(),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#model-picker')).toBeVisible();
    await expect(page.locator('#model-dirs [data-dir="nested"]')).toBeVisible();
    await expect.poll(() => modelValue(page)).toBe('box.stl');
  } finally {
    await fs.rm(path.join(dist, 'nested'), { recursive: true, force: true });
  }
});

test('model picker dialog is about 80 percent of the viewport width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await openPicker(page);
  const geometry = await page.evaluate(() => {
    const dialog = document.getElementById('model-picker');
    const columns = dialog.querySelector('.columns');
    const dirs = dialog.querySelector('.dirs');
    const files = dialog.querySelector('.files');
    const row = columns.getBoundingClientRect();
    const left = dirs.getBoundingClientRect();
    const right = files.getBoundingClientRect();
    return {
      ratio: dialog.getBoundingClientRect().width / window.innerWidth,
      left: left.width / row.width,
      right: right.width / row.width,
      sameRow: Math.abs(left.top - right.top) < 2,
    };
  });
  expect(geometry.ratio).toBeCloseTo(0.8, 2);
  expect(geometry.left).toBeCloseTo(0.3, 1);
  expect(geometry.right).toBeCloseTo(0.7, 1);
  expect(geometry.sameRow).toBe(true);
});

test('stacks picker columns at the 560px breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 720 });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await openPicker(page);
  const stacked = await page.evaluate(() => {
    const dialog = document.getElementById('model-picker');
    const columns = dialog.querySelector('.columns');
    const dirs = dialog.querySelector('.dirs');
    const files = dialog.querySelector('.files');
    const row = columns.getBoundingClientRect();
    const left = dirs.getBoundingClientRect();
    const right = files.getBoundingClientRect();
    return {
      ratio: dialog.getBoundingClientRect().width / window.innerWidth,
      leftFull: Math.abs(left.width - row.width) < 2,
      stacked: left.bottom <= right.top + 1,
    };
  });
  expect(stacked.ratio).toBeCloseTo(0.8, 2);
  expect(stacked.leftFull).toBe(true);
  expect(stacked.stacked).toBe(true);
});

test('disables orbit damping when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  expect(
    await page.evaluate(() => window.__scadLive.getViewerState().damping),
  ).toBe(false);
});

test('loads every page resource from the application origin', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  const origin = new URL(page.url()).origin;
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
});

for (const width of [560, 561]) {
  test(`keeps the ${width}px layout bounded and applies the hint boundary`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/');
    await expect(page.locator('#state')).toHaveText('Ready');
    expect(
      (await page.locator('#models').boundingBox()).height,
    ).toBeGreaterThanOrEqual(44);
    if (width === 561) await expect(page.locator('.hint')).toBeVisible();
    else await expect(page.locator('.hint')).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          document.documentElement.scrollHeight === innerHeight,
      ),
    ).toBe(true);
  });
}

test('reports a later SSE refresh failure without an unhandled rejection', async ({
  page,
}) => {
  const added = path.join(dist, 'later.stl');
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#state')).toHaveText('Ready');
  await page.route('**/api/models', (route) =>
    route.fulfill({ status: 500, body: 'failed' }),
  );
  try {
    await fs.copyFile(box, added);
    await expect(page.locator('#state')).toHaveText('Failed to refresh models');
    expect(pageErrors).toEqual([]);
  } finally {
    await fs.rm(added, { force: true });
  }
});
