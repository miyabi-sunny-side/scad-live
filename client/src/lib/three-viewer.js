import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { DEFAULT_GRID_PITCH, GRID_SIZE, gridDivisions } from './grid-pitch.js';
import { LatestRequest } from './latest-request.js';

const color = (mount, name) =>
  globalThis.getComputedStyle(mount).getPropertyValue(name).trim();

const modelUrl = (path) =>
  `/models/${path.split('/').map(encodeURIComponent).join('/')}`;

const disposeObject = (object) => {
  object.geometry?.dispose();
  const material = object.material;
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material?.dispose();
};

export function createThreeViewer(mount) {
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

  const loader = new STLLoader();
  const requests = new LatestRequest();
  const disposed = { geometries: 0, materials: 0 };
  let mesh;

  const disposeMesh = (current) => {
    scene.remove(current);
    current.geometry.dispose();
    current.material.dispose();
    disposed.geometries += 1;
    disposed.materials += 1;
  };

  const fitCamera = (size) => {
    const maximum = Math.max(size.x, size.y, size.z, 1);
    const distance =
      (maximum / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
      1.55;
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
    let geometry;
    try {
      geometry = await loader.loadAsync(modelUrl(path));
      if (!request.isCurrent()) {
        geometry.dispose();
        disposed.geometries += 1;
        return { kind: 'stale' };
      }
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box || box.isEmpty()) throw new Error('Model has no geometry');
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -box.min.z);
      const next = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: color(mount, '--model'),
          roughness: 0.72,
          metalness: 0.04,
        }),
      );
      if (mesh) disposeMesh(mesh);
      mesh = next;
      scene.add(mesh);
      if (fit) fitCamera(size);
      return {
        kind: 'success',
        dimensions: `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`,
      };
    } catch (error) {
      if (geometry && request.isCurrent()) {
        geometry.dispose();
        disposed.geometries += 1;
      }
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
