import * as THREE from 'three';
import { buildFish, disposeFish, FishSwimmer } from './fish.js';
import { loadFaceTexture, sandTexture, skyTexture, stoneWallTexture } from './textures.js';

/**
 * Interior the fish are allowed to wander in. The x/y extents are recomputed
 * from the camera frustum on every resize (see `resize`), so the cast stays in
 * frame on a narrow phone as well as on a wide desktop instead of swimming off
 * into space the viewer cannot see.
 */
const BOUNDS = new THREE.Box3(
  new THREE.Vector3(-14, -5, -10),
  new THREE.Vector3(14, 6, -0.5),
);

/** Depth the fish mostly occupy, used to size the frustum fit. */
const FISH_PLANE_Z = -3.5;

const WATER_LINE = 6.4;

/**
 * The shared 3D tank (spec S1 / FR-001).
 *
 * Owns the renderer, the environment, and one swimmer per fish. Everything the
 * UI needs — hit testing, screen positions for the name tags — is exposed as
 * plain methods so no other module has to know about three.js.
 */
export function createAquarium({ canvas }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Cap the pixel ratio: retina phones otherwise render 3x the pixels for no
  // visible gain and a third of the frame rate (spec §12).
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2f7fae');
  scene.fog = new THREE.Fog('#2f7fae', 22, 52);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
  camera.position.set(0, 1.2, 24);
  const CAMERA_Z = 24;

  buildEnvironment(scene);

  const swimmers = new Map(); // fishId -> FishSwimmer
  const pellets = [];
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const SEPARATION = new THREE.Vector3();

  let disposed = false;
  let hoveredId = null;
  let selectedId = null;
  const frameCallbacks = new Set();

  // ------------------------------------------------------------------ size

  function resize() {
    const width = canvas.clientWidth || innerWidth;
    const height = canvas.clientHeight || innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fitBoundsToCamera();
  }

  /**
   * Shrinks the swimmable box to what the camera can actually see. A phone in
   * portrait sees a narrow column, so the fish are corralled into it rather
   * than wandering off the sides of the screen.
   */
  function fitBoundsToCamera() {
    const distance = CAMERA_Z - FISH_PLANE_Z;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    const halfWidth = halfHeight * camera.aspect;

    // Leave a margin so a big fish's body never straddles the edge.
    BOUNDS.max.x = THREE.MathUtils.clamp(halfWidth * 0.95, 6, 14);
    BOUNDS.min.x = -BOUNDS.max.x;
    BOUNDS.max.y = Math.min(6, halfHeight - 2);
    BOUNDS.min.y = Math.max(-5, -halfHeight + 2);

    for (const swimmer of swimmers.values()) swimmer.pickTarget();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  // ------------------------------------------------------------------ fish

  /** Adds or replaces a fish. Resolves once its face texture has decoded. */
  async function addFish(fish) {
    removeFish(fish.id);
    let faceTexture;
    try {
      faceTexture = await loadFaceTexture(fish.faceAssetUrl);
    } catch {
      // A missing face asset shouldn't cost us the whole fish — draw it blank.
      faceTexture = null;
    }
    if (disposed) {
      faceTexture?.dispose();
      return null;
    }

    const group = buildFish(fish, faceTexture);
    scene.add(group);
    const swimmer = new FishSwimmer(group, BOUNDS);
    swimmers.set(fish.id, swimmer);
    return swimmer;
  }

  function removeFish(fishId) {
    const swimmer = swimmers.get(fishId);
    if (!swimmer) return;
    scene.remove(swimmer.group);
    disposeFish(swimmer.group);
    swimmers.delete(fishId);
    if (hoveredId === fishId) hoveredId = null;
  }

  /** Reconcile the scene against the authoritative fish list from state. */
  async function syncFish(fishList) {
    const wanted = new Set(fishList.map((f) => f.id));
    for (const id of [...swimmers.keys()]) {
      if (!wanted.has(id)) removeFish(id);
    }
    await Promise.all(
      fishList.map((fish) => {
        const existing = swimmers.get(fish.id);
        if (!existing) return addFish(fish);
        existing.group.userData.fish = fish; // fullness drives swim speed
        return null;
      }),
    );
  }

  function updateFishData(fish) {
    const swimmer = swimmers.get(fish.id);
    if (swimmer) swimmer.group.userData.fish = fish;
  }

  // ---------------------------------------------------------- interactions

  function fishIdAtPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const groups = [...swimmers.values()].map((s) => s.group);
    const [hit] = raycaster.intersectObjects(groups, true);
    return hit?.object.userData.fishId ?? null;
  }

  /**
   * Screen position of a fish's name tag, in CSS pixels relative to the canvas.
   * Returns null when the fish is behind the camera or gone.
   */
  function projectFish(fishId) {
    const swimmer = swimmers.get(fishId);
    if (!swimmer) return null;

    const group = swimmer.group;
    // Sit the tag just above the fish, scaled with the body so a big fish
    // doesn't wear its name across its face.
    projected
      .set(0, group.userData.labelHeight * group.scale.y, 0)
      .add(group.position);
    const distance = camera.position.distanceTo(projected);
    projected.project(camera);
    if (projected.z > 1) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
      distance,
    };
  }

  function setHovered(fishId) {
    hoveredId = fishId;
    canvas.style.cursor = fishId ? 'pointer' : 'default';
  }

  function setSelected(fishId) {
    selectedId = fishId;
  }

  /** Little food pellets raining onto a fish — the feedback for a fed event. */
  function dropFood(fishId) {
    const swimmer = swimmers.get(fishId);
    if (!swimmer) return;

    const geometry = new THREE.SphereGeometry(0.09, 8, 6);
    const material = new THREE.MeshBasicMaterial({ color: '#c98b3f' });
    for (let i = 0; i < 9; i += 1) {
      const pellet = new THREE.Mesh(geometry, material);
      pellet.position
        .copy(swimmer.group.position)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            3 + Math.random() * 1.5,
            (Math.random() - 0.5) * 2,
          ),
        );
      scene.add(pellet);
      pellets.push({
        mesh: pellet,
        target: swimmer.group,
        life: 0,
        drift: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  /**
   * Pushes overlapping fish apart. O(n^2), which is nothing for a friend group
   * and keeps the shoal readable when the visible box is narrow.
   */
  function separateFish(dt) {
    const groups = [...swimmers.values()].map((s) => s.group);
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i];
        const b = groups[j];
        const minDistance = (a.scale.x + b.scale.x) * 1.9;
        SEPARATION.subVectors(a.position, b.position);
        const distance = SEPARATION.length();
        if (distance === 0 || distance >= minDistance) continue;

        SEPARATION.multiplyScalar(((minDistance - distance) / distance) * dt * 7);
        a.position.add(SEPARATION);
        b.position.sub(SEPARATION);
        clampInside(a.position);
        clampInside(b.position);
      }
    }
  }

  function clampInside(position) {
    position.x = THREE.MathUtils.clamp(position.x, BOUNDS.min.x, BOUNDS.max.x);
    position.y = THREE.MathUtils.clamp(position.y, BOUNDS.min.y, BOUNDS.max.y);
    position.z = THREE.MathUtils.clamp(position.z, BOUNDS.min.z, BOUNDS.max.z);
  }

  function updatePellets(dt) {
    for (let i = pellets.length - 1; i >= 0; i -= 1) {
      const pellet = pellets[i];
      pellet.life += dt;
      pellet.mesh.position.y -= dt * 2.4;
      pellet.mesh.position.x += pellet.drift * dt;

      const eaten =
        pellet.target.parent &&
        pellet.mesh.position.distanceTo(pellet.target.position) < 1.1;
      if (eaten || pellet.life > 3.5) {
        scene.remove(pellet.mesh);
        pellet.mesh.geometry.dispose();
        pellets.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ loop

  function frame() {
    if (disposed) return;
    requestAnimationFrame(frame);

    const dt = Math.min(clock.getDelta(), 0.05); // survive a backgrounded tab
    const elapsed = clock.elapsedTime;

    for (const swimmer of swimmers.values()) {
      swimmer.update(dt, elapsed, camera);

      // Highlight: the hovered or selected fish lifts slightly toward the front.
      const emphasised =
        swimmer.group.userData.fish.id === hoveredId ||
        swimmer.group.userData.fish.id === selectedId;
      const targetScale =
        swimmer.group.userData.fish.scale * (emphasised ? 1.09 : 1);
      swimmer.group.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        Math.min(1, dt * 6),
      );
    }

    separateFish(dt);
    updatePellets(dt);

    // A slow camera drift keeps the tank from feeling like a still image.
    camera.position.x = Math.sin(elapsed * 0.07) * 1.6;
    camera.position.y = 1.2 + Math.sin(elapsed * 0.05) * 0.5;
    camera.position.z = 24;
    camera.lookAt(0, 0.6, -1);

    renderer.render(scene, camera);
    for (const cb of frameCallbacks) cb();
  }

  requestAnimationFrame(frame);

  return {
    canvas,
    syncFish,
    updateFishData,
    fishIdAtPointer,
    projectFish,
    setHovered,
    setSelected,
    dropFood,
    onFrame(cb) {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      for (const id of [...swimmers.keys()]) removeFish(id);
      renderer.dispose();
    },
  };
}

/** Sky, waterline, back wall, floor, rocks and a lazy bubble column. */
function buildEnvironment(scene) {
  scene.add(new THREE.AmbientLight('#cfe9f5', 1.25));

  const sun = new THREE.DirectionalLight('#fff6df', 1.05);
  sun.position.set(4, 12, 8);
  scene.add(sun);

  // Sky backdrop, visible above the waterline.
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 34),
    new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }),
  );
  sky.position.set(0, 17, -20);
  scene.add(sky);

  // Back wall.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 24),
    new THREE.MeshLambertMaterial({ map: stoneWallTexture() }),
  );
  wall.position.set(0, -0.6, -12);
  scene.add(wall);

  // Floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 46),
    new THREE.MeshLambertMaterial({ map: sandTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -6.2, 4);
  scene.add(floor);

  // The waterline: a translucent band so the top of the tank reads as surface.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 46),
    new THREE.MeshBasicMaterial({
      color: '#a8ddf4',
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, WATER_LINE, 4);
  scene.add(surface);

  // Rocks along the floor.
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshLambertMaterial({ color: '#5c6660' });
  for (let i = 0; i < 9; i += 1) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(-22 + i * 5.4 + Math.random() * 2, -5.6, -8 + Math.random() * 8);
    rock.scale.set(
      1 + Math.random() * 1.4,
      0.7 + Math.random() * 0.8,
      1 + Math.random() * 1.2,
    );
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(rock);
  }

  scene.add(buildBubbles());
}

/** Cheap bubble column: one Points cloud animated by its own onBeforeRender. */
function buildBubbles(count = 90) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = -6 + Math.random() * 12;
    positions[i * 3 + 2] = -8 + Math.random() * 10;
    speeds[i] = 0.4 + Math.random() * 0.9;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.16,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );

  let last = performance.now();
  points.onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const array = geometry.attributes.position.array;
    for (let i = 0; i < count; i += 1) {
      array[i * 3 + 1] += speeds[i] * dt;
      if (array[i * 3 + 1] > WATER_LINE) array[i * 3 + 1] = -6;
    }
    geometry.attributes.position.needsUpdate = true;
  };

  return points;
}
