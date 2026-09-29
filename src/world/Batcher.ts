import * as THREE from 'three';

interface Batch {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  mats: THREE.Matrix4[];
  cast: boolean;
  receive: boolean;
  colors: THREE.Color[] | null;
}

/** Collects many copies of (geometry, material) pairs and emits InstancedMeshes. */
export class Batcher {
  private batches = new Map<string, Batch>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4, cast = true, receive = true, color?: THREE.Color) {
    const key = geo.uuid + '|' + mat.uuid;
    let b = this.batches.get(key);
    if (!b) {
      b = { geo, mat, mats: [], cast, receive, colors: null };
      this.batches.set(key, b);
    }
    b.mats.push(matrix.clone());
    if (color) {
      if (!b.colors) b.colors = b.mats.slice(0, -1).map(() => new THREE.Color(1, 1, 1));
      b.colors.push(color.clone());
    } else if (b.colors) b.colors.push(new THREE.Color(1, 1, 1));
  }

  /** Helper: add with position / rotation (euler) / scale. */
  put(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, color?: THREE.Color) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.v.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.v, this.q, this.s);
    this.add(geo, mat, this.m, cast, true, color);
  }

  /** Add a template group's meshes transformed by `parent`. */
  addGroup(template: THREE.Object3D, parent: THREE.Matrix4, cast = true) {
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mm = new THREE.Matrix4().multiplyMatrices(parent, mesh.matrixWorld);
      this.add(mesh.geometry, mesh.material as THREE.Material, mm, cast && mesh.castShadow !== false, true);
    });
  }

  build(parent: THREE.Object3D, layer = 0) {
    const out: THREE.InstancedMesh[] = [];
    for (const b of this.batches.values()) {
      const im = new THREE.InstancedMesh(b.geo, b.mat, b.mats.length);
      b.mats.forEach((m, i) => im.setMatrixAt(i, m));
      if (b.colors) b.colors.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = b.cast;
      im.receiveShadow = b.receive;
      im.layers.set(layer);
      im.computeBoundingSphere();
      parent.add(im);
      out.push(im);
    }
    this.batches.clear();
    return out;
  }
}
