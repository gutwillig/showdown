/**
 * Real 3D d20 (three.js icosahedron with numbered faces).
 * When `rolling` starts with a known `target`, the die is thrown into frame,
 * bounces, tumbles through faces and settles exactly on the target face, upright.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { playTick, playLand } from './sfx';

export interface Dice3DProps {
  /** Final value to show when at rest (null = idle) */
  value: number | null;
  rolling: boolean;
  /** Face to land on for the current roll (known at roll start) */
  target?: number | null;
  /** Roll length in ms (should match the store's tumble) */
  duration?: number;
  tone?: 'cream' | 'clay';
  size?: number;
  idle?: boolean;
  onLand?: () => void;
  label?: string;
}

const CAM_POS = new THREE.Vector3(0, 2.4, 5.2);

function makeAtlas(tone: 'cream' | 'clay') {
  const cell = 256;
  const cols = 5;
  const rows = 4;
  const canvas = document.createElement('canvas');
  canvas.width = cell * cols;
  canvas.height = cell * rows;
  const bg = tone === 'cream' ? '#EFE6D0' : '#B5472E';
  const fg = tone === 'cream' ? '#1B1B18' : '#FBF4E6';
  const edge = tone === 'cream' ? 'rgba(27,27,24,0.18)' : 'rgba(0,0,0,0.25)';
  const draw = () => {
    const g = canvas.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 20; i++) {
      const cx = (i % cols) * cell;
      const cy = Math.floor(i / cols) * cell;
      // triangle A(top) B(bottom-left) C(bottom-right); uv y is flipped vs canvas
      const A = [cx + 0.5 * cell, cy + 0.07 * cell];
      const B = [cx + 0.05 * cell, cy + 0.85 * cell];
      const C = [cx + 0.95 * cell, cy + 0.85 * cell];
      g.strokeStyle = edge;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(A[0], A[1]);
      g.lineTo(B[0], B[1]);
      g.lineTo(C[0], C[1]);
      g.closePath();
      g.stroke();
      const n = i + 1;
      g.fillStyle = n === 20 || n === 1 ? (tone === 'cream' ? '#B5472E' : '#F3D58A') : fg;
      g.font = `700 ${n >= 10 ? 92 : 100}px Oswald, 'Arial Narrow', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tx = cx + 0.5 * cell;
      const ty = cy + 0.6 * cell;
      g.fillText(String(n), tx, ty);
      if (n === 6 || n === 9) g.fillRect(tx - 18, ty + 44, 36, 7);
    }
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, redraw: () => { draw(); tex.needsUpdate = true; } };
}

function buildDie(tone: 'cream' | 'clay') {
  const geo = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const pos = geo.getAttribute('position');
  const uvs = new Float32Array(pos.count * 2);
  const faces: { n: THREE.Vector3; u: THREE.Vector3 }[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < 20; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    const col = f % 5;
    const row = Math.floor(f / 5);
    const u0 = col / 5, v0 = 1 - (row + 1) / 4;
    const w = 1 / 5, h = 1 / 4;
    // A(top) -> v0+0.93h, B(bl), C(br)
    uvs.set([u0 + 0.5 * w, v0 + 0.93 * h, u0 + 0.05 * w, v0 + 0.15 * h, u0 + 0.95 * w, v0 + 0.15 * h], f * 6);
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const u = a.clone().sub(centroid).normalize();
    faces.push({ n, u });
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const atlas = makeAtlas(tone);
  const mat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.42, metalness: 0.02, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: tone === 'cream' ? 0xbfae88 : 0x7d2d1b, transparent: true, opacity: 0.8 })
  );
  mesh.add(edges);
  return { mesh, faces, atlas };
}

/** Quaternion that turns face (value) toward the camera, number upright */
function faceQuat(faces: { n: THREE.Vector3; u: THREE.Vector3 }[], value: number) {
  const f = faces[Math.max(0, Math.min(19, value - 1))];
  const r = f.u.clone().cross(f.n);
  const F = new THREE.Matrix4().makeBasis(r, f.u, f.n);
  const Z = CAM_POS.clone().normalize();
  const Y = new THREE.Vector3(0, 1, 0).sub(Z.clone().multiplyScalar(Z.y)).normalize();
  const X = Y.clone().cross(Z);
  const T = new THREE.Matrix4().makeBasis(X, Y, Z);
  const qF = new THREE.Quaternion().setFromRotationMatrix(F);
  const qT = new THREE.Quaternion().setFromRotationMatrix(T);
  return qT.multiply(qF.invert());
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export function Dice3D({
  value,
  rolling,
  target,
  duration = 1500,
  tone = 'cream',
  size = 150,
  idle = false,
  onLand,
  label = 'Die'
}: Dice3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    mode: 'rest' as 'rest' | 'throw' | 'spin' | 'settle',
    start: 0,
    from: new THREE.Quaternion(),
    to: new THREE.Quaternion(),
    axis: new THREE.Vector3(1, 0, 0),
    spins: 0,
    lastBounce: 0,
    landed: false
  });
  const apiRef = useRef<{ faces: { n: THREE.Vector3; u: THREE.Vector3 }[]; mesh: THREE.Mesh } | null>(null);
  const propsRef = useRef({ onLand, idle, duration });
  propsRef.current = { onLand, idle, duration };

  // Mount three scene
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.dataset.fallback = '1';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.copy(CAM_POS);
    camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a2d23, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc79a3b, 0.8);
    rim.position.set(4, 1, -3);
    scene.add(rim);

    // contact shadow
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sg = sc.getContext('2d')!;
    const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.65)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.95;
    scene.add(shadow);

    const { mesh, faces, atlas } = buildDie(tone);
    mesh.scale.setScalar(0.92);
    scene.add(mesh);
    apiRef.current = { faces, mesh };
    document.fonts?.load('700 100px Oswald').then(() => atlas.redraw()).catch(() => {});

    const s = stateRef.current;
    const initial = faceQuat(faces, value ?? 20);
    mesh.quaternion.copy(initial);
    s.to.copy(initial);

    let raf = 0;
    const spinQ = new THREE.Quaternion();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const { duration: D, idle: isIdle } = propsRef.current;
      let y = 0;
      let x = 0;
      if (s.mode === 'throw') {
        const t = Math.min(1, (now - s.start) / D);
        x = -2.4 * (1 - easeOutCubic(Math.min(1, t / 0.7)));
        y = 1.7 * (1 - t) * Math.exp(-2.2 * t) * Math.abs(Math.cos(Math.PI * 3 * t));
        const bounceIdx = Math.floor((t * 3) + 0.5);
        if (bounceIdx > s.lastBounce && t < 0.95) { s.lastBounce = bounceIdx; playTick(); }
        const ang = s.spins * (1 - easeOutQuart(t));
        spinQ.setFromAxisAngle(s.axis, ang);
        mesh.quaternion.copy(s.to).premultiply(spinQ);
        if (t >= 1) {
          s.mode = 'rest';
          s.landed = true;
          mesh.quaternion.copy(s.to);
          playLand();
          propsRef.current.onLand?.();
          host.classList.remove('is-landed');
          void host.offsetWidth;
          host.classList.add('is-landed');
        }
      } else if (s.mode === 'spin') {
        const dt = (now - s.start) / 1000;
        spinQ.setFromAxisAngle(s.axis, dt * 14);
        mesh.quaternion.copy(s.from).premultiply(spinQ);
        y = 0.25 + Math.abs(Math.sin(dt * 9)) * 0.35;
      } else if (s.mode === 'settle') {
        const t = Math.min(1, (now - s.start) / 320);
        mesh.quaternion.slerpQuaternions(s.from, s.to, easeOutCubic(t));
        if (t >= 1) { s.mode = 'rest'; playLand(); propsRef.current.onLand?.(); }
      } else if (isIdle) {
        const dt = now / 1000;
        spinQ.setFromEuler(new THREE.Euler(Math.sin(dt * 0.7) * 0.25, dt * 0.5, Math.cos(dt * 0.5) * 0.15));
        mesh.quaternion.copy(s.to).premultiply(spinQ);
        y = 0.12 + Math.sin(dt * 1.6) * 0.08;
      }
      mesh.position.set(x, y, 0);
      const sh = 1 / (1 + y * 0.9);
      shadow.scale.setScalar(0.6 + sh * 0.5);
      shadow.position.x = x;
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 + sh * 0.5;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      atlas.tex.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone, size]);

  // React to roll state
  const prevRolling = useRef(rolling);
  useEffect(() => {
    const api = apiRef.current;
    const s = stateRef.current;
    if (!api) { prevRolling.current = rolling; return; }
    const started = rolling && !prevRolling.current;
    prevRolling.current = rolling;
    if (started) {
      s.start = performance.now();
      s.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.lastBounce = 0;
      s.landed = false;
      if (target) {
        s.to.copy(faceQuat(api.faces, target));
        s.spins = Math.PI * (6 + Math.random() * 3);
        s.mode = 'throw';
      } else {
        s.from.copy(api.mesh.quaternion);
        s.mode = 'spin';
      }
      return;
    }
    if (!rolling && s.mode === 'spin' && value) {
      s.from.copy(api.mesh.quaternion);
      s.to.copy(faceQuat(api.faces, value));
      s.start = performance.now();
      s.mode = 'settle';
      return;
    }
    if (!rolling && s.mode === 'rest' && value && !s.landed) {
      s.to.copy(faceQuat(api.faces, value));
      api.mesh.quaternion.copy(s.to);
    }
    if (!rolling && value === null) s.landed = false;
  }, [rolling, target, value]);

  return (
    <div
      ref={hostRef}
      className={`dice3d tone-${tone} ${rolling ? 'is-rolling' : ''} ${value === null && !rolling ? 'is-idle' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={rolling ? `${label} rolling` : value ? `${label} shows ${value}` : `${label} ready`}
    />
  );
}
