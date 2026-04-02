import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const assetList = document.getElementById("assetList");
const container = document.getElementById("sceneContainer");
const modeLabel = document.getElementById("modeLabel");
const cancelPlacementBtn = document.getElementById("cancelPlacementBtn");
const offlineBanner = document.getElementById("offlineBanner");

const SUPPORTED_EXTENSIONS = ["fbx", "glb", "gltf", "obj", "stl"];

const state = {
  assets: [],
  selectedAssetId: null,
  placementAsset: null,
  previewObject: null,
  placedRoots: [],
  selectedObject: null,
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ---------- OFFLINE STATUS ----------
function updateOfflineStatus() {
  if (navigator.onLine) {
    offlineBanner.classList.add("hidden");
    document.body.classList.remove("is-offline");
  } else {
    offlineBanner.classList.remove("hidden");
    document.body.classList.add("is-offline");
  }
}

window.addEventListener("online", updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);
updateOfflineStatus();

// ---------- SCENE ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  1000,
);
camera.position.set(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener("dragging-changed", (event) => {
  controls.enabled = !event.value;
});
scene.add(transformControls);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const grid = new THREE.GridHelper(40, 40, 0x64748b, 0x334155);
scene.add(grid);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.name = "ground";
scene.add(ground);

// ---------- UI ----------
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);

  for (const file of files) {
    const ext = getExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

    state.assets.push({
      id: crypto.randomUUID(),
      name: file.name,
      ext,
      file,
      url: URL.createObjectURL(file),
      size: file.size,
    });
  }

  renderAssetList();
  fileInput.value = "";
});

cancelPlacementBtn.addEventListener("click", () => {
  cancelPlacementMode();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Delete") {
    deleteSelectedObject();
  }

  if (!state.selectedObject) return;

  if (event.key.toLowerCase() === "g") {
    transformControls.setMode("translate");
  }
  if (event.key.toLowerCase() === "r") {
    transformControls.setMode("rotate");
  }
  if (event.key.toLowerCase() === "s") {
    transformControls.setMode("scale");
  }
});

renderer.domElement.addEventListener("pointermove", onPointerMove);
renderer.domElement.addEventListener("pointerdown", onPointerDown);

window.addEventListener("resize", onResize);

// ---------- HELPERS ----------
function getExtension(filename = "") {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function renderAssetList() {
  assetList.innerHTML = "";

  if (state.assets.length === 0) {
    assetList.innerHTML = `<div class="empty-text">Nog geen assets geüpload.</div>`;
    return;
  }

  for (const asset of state.assets) {
    const div = document.createElement("div");
    div.className = "asset";

    if (state.selectedAssetId === asset.id) {
      div.classList.add("active");
    }

    div.innerHTML = `
      <div class="asset-name">${asset.name}</div>
      <div class="asset-meta">${asset.ext.toUpperCase()} · ${formatBytes(asset.size)}</div>
    `;

    div.addEventListener("click", async () => {
      state.selectedAssetId = asset.id;
      renderAssetList();
      await startPlacementMode(asset);
    });

    assetList.appendChild(div);
  }
}

function setModeLabel(text) {
  modeLabel.textContent = text;
}

// ---------- PLACEMENT MODE ----------
async function startPlacementMode(asset) {
  cancelPlacementMode();

  state.placementAsset = asset;
  setModeLabel(`Mode: placement (${asset.name})`);

  try {
    const object = await loadModel(asset);
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.45;
      }
    });
    state.previewObject = object;
    scene.add(state.previewObject);
  } catch (error) {
    console.error("Kon preview niet laden:", error);
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.45,
      }),
    );
    state.previewObject = fallback;
    scene.add(state.previewObject);
  }
}

function cancelPlacementMode() {
  state.selectedAssetId = null;
  state.placementAsset = null;

  if (state.previewObject) {
    scene.remove(state.previewObject);
    disposeObject(state.previewObject);
    state.previewObject = null;
  }

  renderAssetList();
  setModeLabel("Mode: select");
}

// ---------- POINTER ----------
function updateMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getGroundPoint(event) {
  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(ground);

  if (hits.length > 0) {
    return hits[0].point.clone();
  }

  return null;
}

function onPointerMove(event) {
  if (!state.previewObject) return;

  const point = getGroundPoint(event);
  if (!point) return;

  state.previewObject.position.copy(point);
}

async function onPointerDown(event) {
  if (transformControls.dragging) return;

  if (state.previewObject && state.placementAsset) {
    const point = getGroundPoint(event);
    if (!point) return;

    await placeObject(state.placementAsset, point);
    return;
  }

  selectObjectFromScene(event);
}

// ---------- PLACE / SELECT ----------
async function placeObject(asset, point) {
  try {
    const object = await loadModel(asset);
    object.position.copy(point);
    object.userData.isPlacedRoot = true;
    object.userData.assetName = asset.name;

    scene.add(object);
    state.placedRoots.push(object);
    selectObject(object);
  } catch (error) {
    console.error("Kon model niet plaatsen:", error);
  }
}

function selectObjectFromScene(event) {
  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(state.placedRoots, true);

  if (intersects.length === 0) {
    clearSelection();
    return;
  }

  let object = intersects[0].object;
  while (object.parent && !object.userData.isPlacedRoot) {
    object = object.parent;
  }

  selectObject(object);
}

function selectObject(object) {
  state.selectedObject = object;
  transformControls.attach(object);
  setModeLabel(
    `Mode: selected (${object.userData.assetName || object.name || "object"})`,
  );
}

function clearSelection() {
  state.selectedObject = null;
  transformControls.detach();

  if (state.placementAsset) {
    setModeLabel(`Mode: placement (${state.placementAsset.name})`);
  } else {
    setModeLabel("Mode: select");
  }
}

function deleteSelectedObject() {
  if (!state.selectedObject) return;

  scene.remove(state.selectedObject);
  disposeObject(state.selectedObject);
  state.placedRoots = state.placedRoots.filter(
    (obj) => obj !== state.selectedObject,
  );
  clearSelection();
}

// ---------- LOADERS ----------
async function loadModel(asset) {
  const ext = asset.ext;

  if (ext === "glb" || ext === "gltf") {
    return loadGLTF(asset.url);
  }

  if (ext === "fbx") {
    return loadFBX(asset.url);
  }

  if (ext === "obj") {
    return loadOBJ(asset.url);
  }

  if (ext === "stl") {
    return loadSTL(asset.url);
  }

  return createFallbackMesh();
}

function loadGLTF(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const object = gltf.scene;
        normalizeObject(object);
        resolve(object);
      },
      undefined,
      reject,
    );
  });
}

function loadFBX(url) {
  const loader = new FBXLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        normalizeObject(object);
        resolve(object);
      },
      undefined,
      reject,
    );
  });
}

function loadOBJ(url) {
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        normalizeObject(object);
        resolve(object);
      },
      undefined,
      reject,
    );
  });
}

function loadSTL(url) {
  const loader = new STLLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (geometry) => {
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
        );
        normalizeObject(mesh);
        resolve(mesh);
      },
      undefined,
      reject,
    );
  });
}

function createFallbackMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
  );
  return mesh;
}

function normalizeObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 2;
  const scale = targetSize / maxAxis;

  object.scale.multiplyScalar(scale);

  const boxAfter = new THREE.Box3().setFromObject(object);
  const centerAfter = new THREE.Vector3();
  boxAfter.getCenter(centerAfter);

  object.position.x -= centerAfter.x;
  object.position.z -= centerAfter.z;
  object.position.y -= boxAfter.min.y;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();

    if (child.material) {
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material.dispose();
        }
      } else {
        child.material.dispose();
      }
    }
  });
}

// ---------- RESIZE ----------
function onResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ---------- LOOP ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

setModeLabel("Mode: select");
renderAssetList();
animate();
