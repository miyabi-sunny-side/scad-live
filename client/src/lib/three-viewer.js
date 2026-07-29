import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { LatestRequest } from './latest-request.js';

const color = (mount, name) =>
  globalThis.getComputedStyle(mount).getPropertyValue(name).trim();

const modelUrl = (path) =>
  `/models/${path.split('/').map(encodeURIComponent).join('/')}`;

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

  const minorGrid = new THREE.GridHelper(
    400,
    40,
    color(mount, '--grid-minor'),
    color(mount, '--grid-minor'),
  );
  const majorGrid = new THREE.GridHelper(
    400,
    8,
    color(mount, '--grid-major'),
    color(mount, '--grid-major'),
  );
  for (const [layer, offset] of [
    [minorGrid, -0.06],
    [majorGrid, -0.05],
  ]) {
    layer.rotation.x = Math.PI / 2;
    layer.position.z = offset;
    layer.material.depthTest = false;
    layer.material.depthWrite = false;
    layer.renderOrder = -1;
    scene.add(layer);
  }

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

  const getViewerState = () =>
    Object.freeze({
      camera: Object.freeze({
        position: Object.freeze(camera.position.toArray()),
        target: Object.freeze(controls.target.toArray()),
        up: Object.freeze(camera.up.toArray()),
        zoom: camera.zoom,
      }),
      sceneBackground: `#${scene.background.getHexString()}`,
      grids: Object.freeze([
        Object.freeze({ divisions: 40, rotationX: minorGrid.rotation.x }),
        Object.freeze({ divisions: 8, rotationX: majorGrid.rotation.x }),
      ]),
      pixelRatio: renderer.getPixelRatio(),
      damping: controls.enableDamping,
      meshId: mesh?.id ?? null,
      disposal: Object.freeze({ ...disposed }),
      threeRevision: THREE.REVISION,
    });

  const destroy = () => {
    requests.invalidate();
    renderer.setAnimationLoop(null);
    colorScheme.removeEventListener('change', reloadForColorScheme);
    globalThis.removeEventListener('resize', resize);
    clear();
    controls.dispose();
    minorGrid.geometry.dispose();
    minorGrid.material.dispose();
    majorGrid.geometry.dispose();
    majorGrid.material.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };

  return Object.freeze({ loadModel, clear, destroy, getViewerState });
}
