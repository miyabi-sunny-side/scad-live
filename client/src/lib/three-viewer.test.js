import { expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareModel, fitDistance, inspectionArea } from './three-viewer.js';

it('uses material names and moves the whole assembly without moving its parts apart', () => {
  const group = new THREE.Group();
  for (const [name, x] of [
    ['secondary', 15],
    ['primary', 5],
  ]) {
    const material = new THREE.MeshPhongMaterial({ color: '#999999' });
    material.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 2), material);
    mesh.position.set(x, 5, 1);
    group.add(mesh);
  }
  const result = prepareModel(group, {
    primary: '#899936',
    secondary: '#267694',
  });
  expect(result.size.toArray()).toEqual([20, 10, 2]);
  expect(result.roles).toEqual(['primary', 'secondary']);
  expect(
    group.children.map((mesh) => mesh.material.color.getHexString()),
  ).toEqual(['267694', '899936']);
  expect(group.children.map((mesh) => mesh.position.x)).toEqual([15, 5]);
  expect(group.position.toArray()).toEqual([-10, -5, 0]);
  expect(() => prepareModel(new THREE.Group(), {})).toThrow(
    'Model has no geometry',
  );
});

it('fits the whole model at phone and desktop aspect ratios', () => {
  for (const aspect of [0.4, 1.6]) {
    for (const dimensions of [
      [20, 10, 2],
      [10, 10, 100],
    ]) {
      const size = new THREE.Vector3(...dimensions);
      const distance = fitDistance(size, aspect, 38);
      const camera = new THREE.PerspectiveCamera(38, aspect, 0.01, 100000);
      camera.up.set(0, 0, 1);
      camera.position.set(
        distance * 0.8,
        -distance * 0.8,
        distance * 0.65 + size.z * 0.35,
      );
      camera.lookAt(0, 0, size.z * 0.35);
      camera.updateMatrixWorld();
      for (const x of [-size.x / 2, size.x / 2])
        for (const y of [-size.y / 2, size.y / 2])
          for (const z of [0, size.z]) {
            const projected = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(0.9);
            expect(Math.abs(projected.y)).toBeLessThan(0.9);
          }
    }
  }
});

it('chooses an unobstructed rectangle for both phone and desktop inspection', () => {
  for (const width of [320, 1280]) {
    const panel = { right: Math.min(width - 12, 459), bottom: 348 };
    const area = inspectionArea(width, 800, panel);
    expect(area.x + area.width).toBeLessThanOrEqual(width);
    expect(area.y + area.height).toBeLessThanOrEqual(800);
    expect(area.x >= panel.right + 24 || area.y >= panel.bottom + 24).toBe(
      true,
    );
    expect(area.width * area.height).toBeGreaterThan((width * 800) / 2);
  }
});
