// Drawing only: the city, the actors and the camera, from the state store. The
// renderer owns the THREE scene, the sun and the mesh registry; the simulation
// never touches a mesh.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildCityMeshes } from './world.js';
import { buildCarMesh } from './vehicles.js';
import { buildPlayerMesh } from './player.js';
import { buildPedMesh } from './pedestrians.js';
import { buildCopMesh, buildPoliceCarMesh } from './police.js';

export function createRenderer(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fc3e8');
  scene.fog = new THREE.Fog('#a8c8e0', 180, 700);

  const hemi = new THREE.HemisphereLight('#bcd8ff', '#8a7a5a', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe3b3', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(buildCityMeshes(city));

  const camera = new THREE.PerspectiveCamera(65, 1, 1, 1200);
  const cameraPos = new THREE.Vector3(0, 20, 40);
  let snapped = false;

  const playerMesh = buildPlayerMesh();
  scene.add(playerMesh);
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const copMeshes = new Map();

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /** Sync every mesh to the state and paint one frame. */
  function sync(state, dt) {
    const p = state.player;
    // The sun follows the player so shadows stay crisp wherever they go.
    sun.position.set(p.x + 130, 190, p.z + 70);
    sun.target.position.set(p.x, 0, p.z);

    // Dario, bobbing gently as he walks.
    playerMesh.visible = !p.inCar;
    if (playerMesh.visible) {
      const bob = p.speed > 0.5 ? Math.abs(Math.sin(state.time * 11)) * 0.07 : 0;
      playerMesh.position.set(p.x, p.y + bob, p.z);
      playerMesh.rotation.y = p.yaw;
    }

    // Cars: create a mesh on first sight, drop it when the car is gone.
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = car.kind === 'police' ? buildPoliceCarMesh() : buildCarMesh(car.color, car.kind);
        carMeshes.set(car.id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.yaw;
      const wheels = mesh.userData.wheels;
      if (wheels) {
        for (const wheel of wheels) wheel.rotation.x += (car.speed * dt) / 0.42;
      }
      if (mesh.userData.lights) {
        const on = Math.sin(state.time * 10) > 0;
        mesh.userData.lights[0].material.emissiveIntensity = on ? 2.5 : 0.2;
        mesh.userData.lights[1].material.emissiveIntensity = on ? 0.2 : 2.5;
      }
    }
    for (const [id, mesh] of carMeshes) {
      if (!seenCars.has(id)) {
        scene.remove(mesh);
        carMeshes.delete(id);
      }
    }

    // Residents and rivals; the down lie flat on the ground.
    const seenPeds = new Set();
    for (const ped of state.peds) {
      seenPeds.add(ped.id);
      let mesh = pedMeshes.get(ped.id);
      if (!mesh) {
        mesh = buildPedMesh(ped.color);
        pedMeshes.set(ped.id, mesh);
        scene.add(mesh);
      }
      const bob = ped.state === 'walk' ? Math.abs(Math.sin(state.time * 9 + ped.id)) * 0.05 : 0;
      mesh.position.set(ped.x, bob, ped.z);
      mesh.rotation.y = ped.yaw;
      mesh.rotation.x = ped.state === 'down' ? -Math.PI / 2 : 0;
      mesh.position.y = ped.state === 'down' ? 0.3 : bob;
    }
    for (const [id, mesh] of pedMeshes) {
      if (!seenPeds.has(id)) {
        scene.remove(mesh);
        pedMeshes.delete(id);
      }
    }

    // Foot officers.
    const seenCops = new Set();
    for (const unit of state.police) {
      if (unit.kind !== 'foot') continue;
      seenCops.add(unit.id);
      let mesh = copMeshes.get(unit.id);
      if (!mesh) {
        mesh = buildCopMesh();
        copMeshes.set(unit.id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(unit.x, 0, unit.z);
      mesh.rotation.y = unit.yaw;
    }
    for (const [id, mesh] of copMeshes) {
      if (!seenCops.has(id)) {
        scene.remove(mesh);
        copMeshes.delete(id);
      }
    }

    // Camera: a staged override for screenshots, else a smoothed follow cam.
    if (state.cameraOverride) {
      const o = state.cameraOverride;
      camera.position.set(o.x, o.y, o.z);
      camera.lookAt(o.lookX, o.lookY, o.lookZ);
    } else {
      const camYaw = state.camera.yaw;
      const dist = p.inCar ? CONFIG.camera.carDist : CONFIG.camera.onFootDist;
      const height = (p.inCar ? CONFIG.camera.carHeight : CONFIG.camera.height) + dist * Math.sin(state.camera.pitch) * 0.5;
      const tx = p.x + Math.sin(camYaw) * dist;
      const tz = p.z + Math.cos(camYaw) * dist;
      if (!snapped) {
        cameraPos.set(tx, height, tz);
        snapped = true;
      } else {
        const k = 1 - Math.exp(-7 * dt);
        cameraPos.x += (tx - cameraPos.x) * k;
        cameraPos.y += (height - cameraPos.y) * k;
        cameraPos.z += (tz - cameraPos.z) * k;
      }
      camera.position.copy(cameraPos);
      camera.lookAt(p.x, p.y + 1.6, p.z);
    }

    renderer.render(scene, camera);
  }

  return { sync, resize, scene, camera };
}
