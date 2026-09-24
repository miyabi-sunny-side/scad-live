import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { DEFAULT_GRID_PITCH, GRID_SIZE, gridDivisions } from './grid-pitch.js';
import { LatestRequest } from './latest-request.js';

const color = (mount, name) =>
  globalThis.getComputedStyle(mount).getPropertyValue(name).trim();

const modelUrl = (path) =>
  `/models/${path.split('/').map(encodeURIComponent).join('/')}`;

const disposeObject = (object) => {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of [child.material].flat())
      if (material) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  return { geometries: geometries.size, materials: materials.size };
};

export function prepareModel(group, colors) {
  const box = new THREE.Box3().setFromObject(group);
  if (
    box.isEmpty() ||
    ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
  )
    throw new Error('Model has no geometry');
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  group.position.add(new THREE.Vector3(-center.x, -center.y, -box.min.z));
  const roles = new Set();
  group.traverse((child) => {
    for (const material of [child.material].flat()) {
      if (!material || !['primary', 'secondary'].includes(material.name))
        continue;
      roles.add(material.name);
      material.color.set(colors[material.name]);
      if (material.isMeshPhongMaterial) material.shininess = 0;
    }
  });
  return { size, roles: [...roles].sort() };
}

export function fitDistance(size, aspect, fov) {
  const maximum = Math.max(size.x, size.y, size.z, 1);
  const tangent =
    Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(aspect, 1);
  return (maximum / (2 * tangent)) * 1.7;
}

export function inspectionArea(width, height, panel) {
  const right = {
    x: Math.min(panel.right + 24, width),
    y: 0,
    width: Math.max(width - panel.right - 24, 0),
    height,
  };
  const below = {
    x: 0,
    y: Math.min(panel.bottom + 24, height),
    width,
    height: Math.max(height - panel.bottom - 24, 0),
  };
  return right.width * right.height > below.width * below.height
    ? right
    : below;
}

export function createThreeViewer(mount, getInspectorRect) {
  const width = () => Math.max(mount.clientWidth, 1);
  const height = () => Math.max(mount.clientHeight, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(color(mount, '--surface'));

  const camera = new THREE.PerspectiveCamera(
    38,
    width() / height(),
    0.01,
    100000,
  );
  camera.up.set(0, 0, 1);
  camera.position.set(100, -100, 75);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  renderer.setSize(width(), height());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  const reducedMotion = globalThis.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  const colorScheme = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const reloadForColorScheme = () => globalThis.location.reload();
  colorScheme.addEventListener('change', reloadForColorScheme);
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(60, -70, 110);
  scene.add(key);

  let gridCellSize = DEFAULT_GRID_PITCH;
  let minorGrid;
  let majorGrid;

  const placeGrid = (grid, offset) => {
    grid.rotation.x = Math.PI / 2;
    grid.position.z = offset;
    grid.material.depthTest = false;
    grid.material.depthWrite = false;
    grid.renderOrder = -1;
    scene.add(grid);
  };

  const buildGrids = (pitch) => {
    const { minor, major } = gridDivisions(pitch, GRID_SIZE);
    if (minorGrid) {
      scene.remove(minorGrid);
      disposeObject(minorGrid);
    }
    if (majorGrid) {
      scene.remove(majorGrid);
      disposeObject(majorGrid);
    }
    minorGrid = new THREE.GridHelper(
      GRID_SIZE,
      minor,
      color(mount, '--grid-minor'),
      color(mount, '--grid-minor'),
    );
    majorGrid = new THREE.GridHelper(
      GRID_SIZE,
      major,
      color(mount, '--grid-major'),
      color(mount, '--grid-major'),
    );
    placeGrid(minorGrid, -0.06);
    placeGrid(majorGrid, -0.05);
    gridCellSize = pitch;
  };

  buildGrids(DEFAULT_GRID_PITCH);

  const setGridPitch = (pitch) => {
    const next = Number(pitch);
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error(`invalid grid pitch: ${pitch}`);
    }
    gridDivisions(next, GRID_SIZE);
    if (next === gridCellSize) return gridCellSize;
    buildGrids(next);
    return gridCellSize;
  };

  const loader = new ThreeMFLoader();
  const requests = new LatestRequest();
  const disposed = { geometries: 0, materials: 0 };
  let mesh;

  const disposeMesh = (current) => {
    scene.remove(current);
    const counts = disposeObject(current);
    disposed.geometries += counts.geometries;
    disposed.materials += counts.materials;
  };

  const updateView = () => {
    const area = inspectionArea(width(), height(), getInspectorRect());
    camera.setViewOffset(
      width(),
      height(),
      width() / 2 - area.x - area.width / 2,
      height() / 2 - area.y - area.height / 2,
      width(),
      height(),
    );
    return area;
  };

  const fitCamera = (size) => {
    const area = updateView();
    const visibleFov = THREE.MathUtils.radToDeg(
      2 *
        Math.atan(
          (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
            Math.max(area.height, 1)) /
            height(),
        ),
    );
    const distance = fitDistance(
      size,
      Math.max(area.width, 1) / Math.max(area.height, 1),
      visibleFov,
    );
    controls.target.set(0, 0, size.z * 0.35);
    camera.position.set(
      distance * 0.8,
      -distance * 0.8,
      distance * 0.65 + size.z * 0.35,
    );
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.update();
  };

  const loadModel = async (path, fit) => {
    const request = requests.begin();
    let next;
    try {
      next = await loader.loadAsync(modelUrl(path));
      if (!request.isCurrent()) {
        disposeMesh(next);
        return { kind: 'stale' };
      }
      const { size, roles } = prepareModel(next, {
        primary: color(mount, '--model'),
        secondary: color(mount, '--model-secondary'),
      });
      next.userData.roles = roles;
      if (mesh) disposeMesh(mesh);
      mesh = next;
      scene.add(mesh);
      if (fit) fitCamera(size);
      return {
        kind: 'success',
        roles,
        dimensions: `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`,
      };
    } catch (error) {
      if (next) disposeMesh(next);
      if (!request.isCurrent()) return { kind: 'stale' };
      throw error;
    }
  };

  /**
   * Disown the read in flight so it lands as `stale`: once the caller knows the
   * file is gone, that geometry must never reach the scene and replace a mesh
   * the viewport is still meant to show.
   */
  const cancelLoad = () => {
    requests.invalidate();
  };

  const clear = () => {
    requests.invalidate();
    if (mesh) {
      disposeMesh(mesh);
      mesh = undefined;
    }
  };

  const resize = () => {
    camera.aspect = width() / height();
    updateView();
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    renderer.setSize(width(), height());
  };
  globalThis.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  const getViewerState = () => {
    const { minor, major, majorCell, size } = gridDivisions(
      gridCellSize,
      GRID_SIZE,
    );
    return Object.freeze({
      camera: Object.freeze({
        position: Object.freeze(camera.position.toArray()),
        target: Object.freeze(controls.target.toArray()),
        up: Object.freeze(camera.up.toArray()),
        zoom: camera.zoom,
      }),
      sceneBackground: `#${scene.background.getHexString()}`,
      grids: Object.freeze([
        Object.freeze({
          size,
          divisions: minor,
          cellSize: gridCellSize,
          rotationX: minorGrid.rotation.x,
        }),
        Object.freeze({
          size,
          divisions: major,
          cellSize: majorCell,
          rotationX: majorGrid.rotation.x,
        }),
      ]),
      pixelRatio: renderer.getPixelRatio(),
      damping: controls.enableDamping,
      meshId: mesh?.id ?? null,
      materialRoles: Object.freeze([...(mesh?.userData.roles ?? [])]),
      disposal: Object.freeze({ ...disposed }),
      threeRevision: THREE.REVISION,
    });
  };

  const destroy = () => {
    requests.invalidate();
    renderer.setAnimationLoop(null);
    colorScheme.removeEventListener('change', reloadForColorScheme);
    globalThis.removeEventListener('resize', resize);
    clear();
    controls.dispose();
    scene.remove(minorGrid);
    scene.remove(majorGrid);
    disposeObject(minorGrid);
    disposeObject(majorGrid);
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };

  return Object.freeze({
    loadModel,
    cancelLoad,
    clear,
    destroy,
    getViewerState,
    setGridPitch,
  });
}
