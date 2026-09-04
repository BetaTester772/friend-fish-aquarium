import * as THREE from 'three';

/**
 * Builds one friend-fish: a fat pastel body, fins, a tail, and the owner's face
 * as a flat plate on the head.
 *
 * The face plate is billboarded toward the camera every frame, which is what
 * the Reel shows — a fish swimming left still looks straight at you.
 */

const BODY_PROPORTIONS = {
  blimp: { x: 1.55, y: 0.92, z: 0.92 },
  torpedo: { x: 1.9, y: 0.72, z: 0.72 },
  orb: { x: 1.08, y: 1.0, z: 0.95 },
  guppy: { x: 1.32, y: 0.82, z: 0.66 },
};

const TAIL_SHAPES = {
  classic: { radius: 0.62, length: 0.85, spread: 1.0 },
  spiky: { radius: 0.44, length: 1.25, spread: 0.7 },
  ribbon: { radius: 0.34, length: 1.5, spread: 1.35 },
  fan: { radius: 0.86, length: 0.62, spread: 1.15 },
};

// Reused across every fish; geometry is scaled per instance instead.
const bodyGeometry = new THREE.SphereGeometry(1, 28, 20);
const finGeometry = new THREE.ConeGeometry(1, 1, 4);
const faceGeometry = new THREE.CircleGeometry(1, 32);

function bodyMaterial(color) {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    // Slight emissive keeps the underwater side of a fish from going muddy.
    emissive: new THREE.Color(color).multiplyScalar(0.16),
  });
}

/**
 * @param {object} fish     fish record from the API
 * @param {THREE.Texture} faceTexture
 * @returns {THREE.Group} with `userData.fish`, `.faceGroup`, `.tail`
 */
export function buildFish(fish, faceTexture) {
  const group = new THREE.Group();
  group.name = `fish:${fish.id}`;

  const proportions = BODY_PROPORTIONS[fish.bodyVariant] ?? BODY_PROPORTIONS.blimp;
  const tailShape = TAIL_SHAPES[fish.finVariant] ?? TAIL_SHAPES.classic;
  const material = bodyMaterial(fish.bodyColor);

  const body = new THREE.Mesh(bodyGeometry, material);
  body.scale.set(proportions.x, proportions.y, proportions.z);
  body.castShadow = true;
  group.add(body);

  // Tail, hinged at the back so it can wag.
  const tailPivot = new THREE.Group();
  tailPivot.position.x = -proportions.x * 0.86;
  const tail = new THREE.Mesh(finGeometry, material);
  tail.scale.set(
    tailShape.radius,
    tailShape.length,
    tailShape.radius * tailShape.spread,
  );
  // Rotate the cone's +Y axis onto -X so the tip trails behind the fish.
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -tailShape.length * 0.42;
  tailPivot.add(tail);
  group.add(tailPivot);

  // Dorsal sail: long along the body, near-flat across it, so it reads as a
  // fin from the side rather than as a spike from the front.
  const dorsal = new THREE.Mesh(finGeometry, material);
  dorsal.scale.set(proportions.x * 0.42, proportions.y * 0.68, 0.1);
  dorsal.position.set(-proportions.x * 0.12, proportions.y * 0.78, 0);
  group.add(dorsal);

  // Pectoral fins, one per side, angled outward and down.
  for (const side of [1, -1]) {
    const pectoral = new THREE.Mesh(finGeometry, material);
    pectoral.scale.set(0.1, 0.5, 0.3);
    pectoral.position.set(
      proportions.x * 0.1,
      -proportions.y * 0.22,
      side * proportions.z * 0.72,
    );
    pectoral.rotation.set(0, 0, side * -1.15);
    group.add(pectoral);
  }

  // The face plate, in its own group so it can billboard independently of the
  // body's swim heading.
  const faceGroup = new THREE.Group();
  faceGroup.position.set(proportions.x * 0.55, proportions.y * 0.1, 0);

  const faceRadius = Math.min(proportions.y, proportions.z) * 0.95;

  // The plate is billboarded, so it can end up pointing at the camera from
  // anywhere on the body. Push it far enough along its own +Z to clear the
  // silhouette from every angle, or the body's depth buffer eats the face.
  const push =
    Math.max(proportions.x * 0.45, proportions.y, proportions.z) * 1.06;

  // A pale disc behind the cutout so the face reads against any body colour.
  const backing = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshBasicMaterial({ color: '#f6efe4' }),
  );
  backing.scale.setScalar(faceRadius * 0.99);
  backing.position.z = push - 0.014;
  faceGroup.add(backing);

  const face = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshBasicMaterial({
      map: faceTexture,
      transparent: true,
      alphaTest: 0.35,
      toneMapped: false,
    }),
  );
  face.scale.setScalar(faceRadius);
  face.position.z = push;
  faceGroup.add(face);
  group.add(faceGroup);

  group.scale.setScalar(fish.scale);
  group.userData = { fish, faceGroup, tailPivot, labelHeight: proportions.y + 0.45 };

  // Everything under the group answers to the same fish when raycast.
  group.traverse((child) => {
    child.userData.fishId = fish.id;
  });

  return group;
}

/** Releases the per-fish materials and face texture. Geometry is shared. */
export function disposeFish(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      // Shared geometry is never disposed; textures belong to the face only.
      if (material.map && material.map.userData?.shared !== true) material.map.dispose();
      material.dispose();
    }
  });
}

/**
 * Autonomous swimming (spec S1 "Fish motion"): wander toward a target inside
 * the tank, turn smoothly to face travel, wag the tail, and bob.
 *
 * A full fish is a lazy fish — speed scales down with fullness, so a hungry
 * friend visibly darts around and a stuffed one drifts.
 */
export class FishSwimmer {
  constructor(group, bounds) {
    this.group = group;
    this.bounds = bounds;
    this.phase = Math.random() * Math.PI * 2;
    this.baseSpeed = 0.55 + Math.random() * 0.5;
    this.target = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.group.position.set(
      randomBetween(bounds.min.x, bounds.max.x),
      randomBetween(bounds.min.y, bounds.max.y),
      randomBetween(bounds.min.z, bounds.max.z),
    );
    this.pickTarget();
  }

  pickTarget() {
    this.target.set(
      randomBetween(this.bounds.min.x, this.bounds.max.x),
      randomBetween(this.bounds.min.y, this.bounds.max.y),
      randomBetween(this.bounds.min.z, this.bounds.max.z),
    );
  }

  get fullness() {
    return this.group.userData.fish?.fullness ?? 50;
  }

  update(dt, elapsed, camera) {
    const group = this.group;

    if (group.position.distanceTo(this.target) < 1.2) this.pickTarget();

    // Big fish and full fish move slower.
    const laziness = 1 - (this.fullness / 100) * 0.45;
    const speed = (this.baseSpeed * laziness) / (0.6 + group.scale.x * 0.5);

    const desired = this.target
      .clone()
      .sub(group.position)
      .normalize()
      .multiplyScalar(speed);
    this.velocity.lerp(desired, Math.min(1, dt * 1.4));
    group.position.addScaledVector(this.velocity, dt * 2.4);

    // Gentle bob on top of the path so nothing travels in a straight line.
    this.phase += dt * (1.6 + this.baseSpeed);
    group.position.y += Math.sin(this.phase) * dt * 0.35;
    clampToBounds(group.position, this.bounds);

    // Yaw toward travel direction; roll a little into the turn.
    const targetYaw = Math.atan2(-this.velocity.z, this.velocity.x);
    group.rotation.y = lerpAngle(group.rotation.y, targetYaw, Math.min(1, dt * 2.2));
    group.rotation.z = THREE.MathUtils.lerp(
      group.rotation.z,
      THREE.MathUtils.clamp(this.velocity.y * 0.5, -0.4, 0.4),
      Math.min(1, dt * 2),
    );

    // Tail wag, faster when the fish is actually moving.
    const wag = Math.sin(elapsed * (5 + speed * 6) + this.phase);
    group.userData.tailPivot.rotation.y = wag * 0.45;

    // Keep the face looking at the viewer, upright, regardless of heading.
    // Solved in world space and converted back, so the body's roll and yaw
    // compose correctly instead of being cancelled term by term.
    if (camera) {
      const faceGroup = group.userData.faceGroup;
      faceGroup.getWorldPosition(FACE_WORLD);
      TO_CAMERA.copy(camera.position).sub(FACE_WORLD);
      BILLBOARD_EULER.set(0, Math.atan2(TO_CAMERA.x, TO_CAMERA.z), 0);
      BILLBOARD_Q.setFromEuler(BILLBOARD_EULER);
      group.getWorldQuaternion(PARENT_Q).invert();
      faceGroup.quaternion.copy(PARENT_Q).multiply(BILLBOARD_Q);
    }
  }
}

const FACE_WORLD = new THREE.Vector3();
const TO_CAMERA = new THREE.Vector3();
const BILLBOARD_EULER = new THREE.Euler();
const BILLBOARD_Q = new THREE.Quaternion();
const PARENT_Q = new THREE.Quaternion();

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clampToBounds(position, bounds) {
  position.x = THREE.MathUtils.clamp(position.x, bounds.min.x, bounds.max.x);
  position.y = THREE.MathUtils.clamp(position.y, bounds.min.y, bounds.max.y);
  position.z = THREE.MathUtils.clamp(position.z, bounds.min.z, bounds.max.z);
}

function lerpAngle(from, to, t) {
  const delta = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return from + delta * t;
}
