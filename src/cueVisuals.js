import { CUE_TIP_LOCAL_X } from './cueMotion.js';

// All offsets are local to the cue group: +X points toward the white ball.
// With rotation.z = +PI/2, Three's cylinder +Y (radiusTop) points toward -X.
// The shaft therefore *must* have radiusTop > radiusBottom; previously it
// widened toward the chalk tip instead of tapering toward it.
export function createCueStick(THREE) {
  const cue = new THREE.Group();
  cue.name = 'cue-stick';

  const maple = new THREE.MeshPhysicalMaterial({
    color: 0xe5b47b, roughness: 0.34, metalness: 0,
    clearcoat: 0.68, clearcoatRoughness: 0.22,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x44251d, roughness: 0.67,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc5a06c, metalness: 0.68, roughness: 0.34,
  });
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xf1e8d6, roughness: 0.37,
  });
  const chalk = new THREE.MeshStandardMaterial({
    color: 0x74aeb1, roughness: 0.88,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x191b18, roughness: 0.94,
  });

  const segment = (name, x, length, buttRadius, tipRadius, material, sides = 16) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(buttRadius, tipRadius, length, sides),
      material,
    );
    mesh.name = name;
    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = x;
    mesh.castShadow = name === 'cue-shaft' || name === 'cue-grip';
    cue.add(mesh);
    return mesh;
  };

  // Maple tapers toward the white ball, while the restrained leather wrap
  // gives the rear of the cue a readable silhouette in both 3D cameras.
  segment('cue-shaft', 0, 2.65, 0.051, 0.019, maple, 24);
  segment('cue-grip', -1.05, 0.78, 0.060, 0.051, leather, 20);
  segment('cue-butt-cap', -1.475, 0.08, 0.060, 0.060, rubber);
  segment('cue-butt-ring', -1.405, 0.015, 0.061, 0.061, brass);
  segment('cue-wrap-ring', -0.675, 0.016, 0.053, 0.053, brass);

  // Subtle pale ferrule and chalk-tinted leather tip are physical meshes,
  // not a glowing UI effect. Preserve the exact tip centre used by cueMotion.
  segment('cue-ferrule', 1.294, 0.07, 0.023, 0.023, ivory);
  segment('cue-tip', CUE_TIP_LOCAL_X, 0.06, 0.023, 0.023, chalk, 16);
  return cue;
}
