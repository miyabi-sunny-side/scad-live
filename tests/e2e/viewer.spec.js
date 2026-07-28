import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('tests/fixtures/dist');
const box = path.join(dist, 'box.stl');

test.describe.configure({ mode: 'serial' });

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
  await expect(page.locator('#models')).toHaveValue('box.stl');
  const heading = await page.locator('h1').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  });
  const caption = await page.locator('label').evaluate((element) => {
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
    (await page.evaluate(() => window.__scadLive.getCameraState()))
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
    (await page.evaluate(() => window.__scadLive.getCameraState()))
      .sceneBackground,
  ).toBe('#faf6ef');
});

test('renders markup-like model names only as text', async ({ page }) => {
  const filename = 'bad<img src=x onerror=window.__injected=1>.stl';
  const malicious = path.join(dist, filename);
  await fs.writeFile(malicious, 'not an STL');
  try {
    await page.goto('/');
    await page.selectOption('#models', filename);
    await expect(page.locator('#state')).toHaveText(`Failed: ${filename}`);
    await expect(page.locator('#sync')).toContainText(`Failed: ${filename}`);
    await expect(page.locator('#sync img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
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
    await expect(page.locator('#models option')).toHaveCount(2);
    await page.selectOption('#models', 'nested/second.stl');
    await expect(page.locator('#state')).toHaveText('Ready');
    await page.reload();
    await expect(page.locator('#models')).toHaveValue('nested/second.stl');
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
  const before = await page.evaluate(() => window.__scadLive.getCameraState());
  try {
    await fs.writeFile(box, original.replaceAll('30', '40'));
    await expect(page.locator('#state')).toHaveText('Updated');
    await expect(page.locator('#dimensions')).toHaveText(
      '10.0 × 20.0 × 40.0 mm',
    );
    const after = await page.evaluate(() => window.__scadLive.getCameraState());
    expect(after.zoom).toBe(before.zoom);
    after.position.forEach((value, index) =>
      expect(value).toBeCloseTo(before.position[index], 8),
    );
    after.target.forEach((value, index) =>
      expect(value).toBeCloseTo(before.target[index], 8),
    );

    await fs.copyFile(box, added);
    await expect(page.locator('#models option')).toHaveCount(2);
    await fs.rm(added);
    await expect(page.locator('#models option')).toHaveCount(1);

    await fs.rm(box);
    await expect(page.locator('#models')).toBeDisabled();
    await expect(page.locator('#dimensions')).toHaveText('—');
    await expect(page.locator('#state')).toHaveText('No STL files found');
  } finally {
    await fs.writeFile(box, original);
    await fs.rm(added, { force: true });
  }
});

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
