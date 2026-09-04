import * as THREE from 'three';
import { buildFish, disposeFish } from '../scene/fish.js';

/**
 * The little turntable render of your fish before you commit to it
 * (spec S4 / FR-008). It reuses the exact same `buildFish` the tank uses, so
 * what you approve is what the tank shows.
 */
export function createFishPreview({ canvas, look, faceCanvas }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight('#dfefff', 1.3));
  const key = new THREE.DirectionalLight('#fff6e2', 1.1);
  key.position.set(3, 5, 6);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0.6, 0.5, 6.4);
  camera.lookAt(0, 0, 0);

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;

  let group = null;
  let disposed = false;

  function rebuild(nextLook) {
    if (group) {
      scene.remove(group);
      disposeFish(group);
    }
    group = buildFish(
      { id: 'preview', ownerName: 'you', fullness: 60, ...nextLook },
      faceTexture,
    );
    // The preview is framed, not swimming: fixed size, gentle turntable.
    group.scale.setScalar(1.45);
    scene.add(group);
  }

  rebuild(look);

  function resize() {
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 320;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const clock = new THREE.Clock();

  function frame() {
    if (disposed) return;
    requestAnimationFrame(frame);
    const t = clock.getElapsedTime();

    // Swim in place: sway the body, wag the tail, keep the face on the viewer.
    group.rotation.y = Math.sin(t * 0.6) * 0.55 - 0.15;
    group.position.y = Math.sin(t * 1.4) * 0.12;
    group.userData.tailPivot.rotation.y = Math.sin(t * 5) * 0.45;
    group.userData.faceGroup.rotation.set(0, -group.rotation.y, 0);

    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);

  return {
    rebuild,
    dispose() {
      disposed = true;
      observer.disconnect();
      if (group) disposeFish(group);
      faceTexture.dispose();
      renderer.dispose();
    },
  };
}
