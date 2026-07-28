import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const viewport = document.querySelector('#viewport');
const selector = document.querySelector('#models');
const dimensions = document.querySelector('#dimensions');
const state = document.querySelector('#state');
const sync = document.querySelector('#sync');
const scene = new THREE.Scene();
scene.background = new THREE.Color(cssColor('--surface'));
const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / innerHeight,
  0.01,
  100000,
);
camera.up.set(0, 0, 1);
camera.position.set(100, -100, 75);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)')
  .matches;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.target.set(0, 0, 0);
const loader = new STLLoader();
let mesh;
let selected = '';
let loadGeneration = 0;

scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(60, -70, 110);
scene.add(key);
const minorGrid = new THREE.GridHelper(
  400,
  40,
  cssColor('--grid-minor'),
  cssColor('--grid-minor'),
);
const majorGrid = new THREE.GridHelper(
  400,
  8,
  cssColor('--grid-major'),
  cssColor('--grid-major'),
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

function cssColor(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
function setStatus(message, style = '') {
  state.textContent = message;
  sync.className = style;
  sync.replaceChildren(
    document.createElement('i'),
    document.createTextNode(message),
  );
}
function snapshotCamera() {
  return Object.freeze({
    position: Object.freeze(camera.position.toArray()),
    target: Object.freeze(controls.target.toArray()),
    zoom: camera.zoom,
    sceneBackground: `#${scene.background.getHexString()}`,
  });
}
// Read-only production probe used by the Playwright camera-preservation regression test.
Object.defineProperty(window, '__scadLive', {
  value: Object.freeze({ getCameraState: snapshotCamera }),
});

async function loadModel(path, fit) {
  const generation = ++loadGeneration;
  setStatus('Loading', 'loading');
  try {
    const geometry = await loader.loadAsync(
      `/models/${path.split('/').map(encodeURIComponent).join('/')}`,
    );
    if (generation !== loadGeneration) {
      geometry.dispose();
      return;
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
        color: cssColor('--model'),
        roughness: 0.72,
        metalness: 0.04,
      }),
    );
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    mesh = next;
    scene.add(mesh);
    dimensions.textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
    if (fit) fitCamera(size);
    setStatus(fit ? 'Ready' : 'Updated');
  } catch (error) {
    console.warn(`Could not load ${path}:`, error.message);
    setStatus(`Failed: ${path}`, 'failed');
  }
}
function fitCamera(size) {
  const maximum = Math.max(size.x, size.y, size.z, 1);
  const distance =
    (maximum / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.55;
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
}

function clearModel() {
  ++loadGeneration;
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = undefined;
  }
  selected = '';
  dimensions.textContent = '—';
}

async function refreshModels(preferred) {
  const response = await fetch('/api/models', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Model list returned ${response.status}`);
  const models = await response.json();
  const prior =
    preferred === null
      ? ''
      : preferred || selected || localStorage.getItem('scad-live:model') || '';
  selector.replaceChildren(
    ...models.map((path) =>
      Object.assign(document.createElement('option'), {
        value: path,
        textContent: path,
        title: path,
      }),
    ),
  );
  selector.disabled = models.length === 0;
  if (!models.length) {
    clearModel();
    setStatus('No STL files found');
    return;
  }
  const next = models.includes(prior) ? prior : models[0];
  selector.value = next;
  if (next !== selected) {
    selected = next;
    localStorage.setItem('scad-live:model', selected);
    await loadModel(selected, true);
  }
}

selector.addEventListener('change', () => {
  selected = selector.value;
  localStorage.setItem('scad-live:model', selected);
  loadModel(selected, true);
});

function connect() {
  const source = new EventSource('/events');
  source.onopen = () => {
    if (selected || state.textContent === 'Scanning') setStatus('Ready');
  };
  source.onmessage = async ({ data }) => {
    try {
      const event = JSON.parse(data);
      if (event.kind !== 'unlink' && event.path === selected)
        await loadModel(selected, false);
      else
        await refreshModels(
          event.kind === 'unlink' && event.path === selected ? null : selected,
        );
    } catch (error) {
      console.warn('Could not apply live model update:', error.message);
      setStatus('Failed to refresh models', 'failed');
    }
  };
  source.onerror = () => setStatus('Reconnecting', 'failed');
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
  location.reload(),
);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
refreshModels()
  .then(connect)
  .catch((error) => {
    console.error(error);
    setStatus('Failed to scan models', 'failed');
    connect();
  });
