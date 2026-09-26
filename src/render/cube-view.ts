import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACE_NORMALS, FACES, type Face } from '../core/cube';
import { CUBE_ROTATIONS, IDENTITY, mulMat, mulMatVec, type Axis, type Mat3, type Vec3 } from '../core/geometry';
import { turnMatrix, type Turn } from '../core/turn';
import { easeOutCubic, easeOutQuad, tween } from './tween';

const STICKER_COLORS: Record<Face, number> = {
  U: 0xf4f4f4,
  D: 0xffd200,
  F: 0x00a651,
  B: 0x1560d8,
  R: 0xd8263a,
  L: 0xff7a1a,
};

const CUBIE_SIZE = 0.97;
const STICKER_SIZE = 0.8;
const CAMERA_FOV = 32;
/** Radio aproximado que ocupa el cubo en pantalla, para encuadrarlo. En vertical se deja sitio para la interfaz. */
const FIT_RADIUS_VERTICAL = 3.3;
const FIT_RADIUS_HORIZONTAL = 2.7;
const FREE_ROTATION_SPEED = 0.009;
/** Esfera que contiene el cubo (sus esquinas están a 2,6) con un poco de margen. */
const CUBE_RADIUS = 2.75;

interface Cubie {
  object: THREE.Group;
  pos: Vec3;
  orient: Mat3;
}

export interface PickResult {
  /** Posición de la pieza tocada. */
  cubiePos: Vec3;
  /** Cara exterior tocada (vector unitario). */
  normal: Vec3;
  /** Punto exacto tocado, en coordenadas del cubo. */
  point: Vec3;
}

/** Capa iluminada (vista previa del modo ninja o capa que pide el dojo). */
/**
 * Algo que se ilumina en el cubo: una capa entera (vista previa del modo
 * ninja, capa que pide el dojo o el entrenador) o una sola pieza.
 */
export type LayerHighlight = HighlightStyle &
  (
    | {
        kind?: 'layer';
        axis: Axis;
        layer: number;
        /**
         * Balancea la capa en el sentido de un giro (signo de sus cuartos de
         * vuelta), para indicar hacia dónde hay que moverla.
         */
        preview?: number;
      }
    | { kind: 'piece'; pos: Vec3 }
  );

interface HighlightStyle {
  color: string;
  /** Intensidad de 0 a 1. */
  strength?: number;
  /** Parpadea suavemente. */
  pulse?: boolean;
}

/** Cubo dibujado aparte, en un lienzo pequeño (para el video). */
export interface CubeSnapshot {
  readonly canvas: HTMLCanvasElement;
  /** Dibuja el cubo en `canvas`. La imagen hay que usarla enseguida, en la misma tarea. */
  render(): void;
  dispose(): void;
}

export interface ScreenVector {
  x: number;
  y: number;
}

/** Dibuja el cubo en 3D y anima sus giros. No sabe nada de reglas del juego. */
export class CubeView {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  /** Contenedor del cubo entero; se rota al arrastrar fuera del cubo. */
  private readonly root = new THREE.Group();
  /** Contenedor temporal de la capa que está girando. */
  private readonly pivot = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly bodyGeometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 3, 0.09);
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.45, metalness: 0.1 });
  private readonly stickerGeometry = roundedSquare(STICKER_SIZE, 0.11);
  private readonly stickerMaterials = Object.fromEntries(
    FACES.map((face) => [face, new THREE.MeshStandardMaterial({ color: STICKER_COLORS[face], roughness: 0.28 })]),
  ) as Record<Face, THREE.MeshStandardMaterial>;
  private cubies: Cubie[] = [];
  private turningCubies: Cubie[] = [];
  private turningAxis: Axis = 0;
  private turningLayer = 0;
  private readonly afterRenderListeners = new Set<() => void>();
  private readonly highlightGroups = new Map<string, { signature: string; highlights: LayerHighlight[] }>();
  private highlightObjects: { mesh: THREE.Mesh; edges: THREE.LineSegments; highlight: LayerHighlight }[] = [];
  private readonly slabGeometries = ([0, 1, 2] as const).map((axis) => {
    const size = [3.12, 3.12, 3.12];
    size[axis] = 1.08;
    const box = new THREE.BoxGeometry(size[0], size[1], size[2]);
    return { box, edges: new THREE.EdgesGeometry(box) };
  });
  private readonly pieceGeometry = (() => {
    const box = new THREE.BoxGeometry(1.14, 1.14, 1.14);
    return { box, edges: new THREE.EdgesGeometry(box) };
  })();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 8, 6);
    const rim = new THREE.DirectionalLight(0x8fa8ff, 0.8);
    rim.position.set(-6, -3, -5);
    this.scene.add(key, rim);

    this.scene.add(this.root);
    this.root.add(this.pivot);
    this.buildCubies();

    new ResizeObserver(() => this.resize(container)).observe(container);
    this.resize(container);
    this.renderer.setAnimationLoop((time) => {
      this.animateHighlights(time);
      this.renderer.render(this.scene, this.camera);
      for (const listener of this.afterRenderListeners) listener();
    });
  }

  /**
   * Se llama justo después de dibujar cada fotograma. Es el único momento en
   * que se puede copiar la imagen del lienzo 3D (por ejemplo, para grabar video):
   * después, el navegador la descarta.
   */
  onAfterRender(listener: () => void): () => void {
    this.afterRenderListeners.add(listener);
    return () => this.afterRenderListeners.delete(listener);
  }

  // --- Capas iluminadas -------------------------------------------------

  /** Cambia las capas iluminadas de un grupo (`key`); cada módulo usa el suyo. */
  setHighlights(key: string, highlights: LayerHighlight[]): void {
    const signature = JSON.stringify(highlights);
    if (this.highlightGroups.get(key)?.signature === signature) return;
    this.highlightGroups.set(key, { signature, highlights });
    this.rebuildHighlights();
  }

  private rebuildHighlights(): void {
    for (const { mesh, edges } of this.highlightObjects) {
      this.root.remove(mesh, edges);
      (mesh.material as THREE.Material).dispose();
      (edges.material as THREE.Material).dispose();
    }
    this.highlightObjects = [];
    for (const { highlights } of this.highlightGroups.values()) {
      for (const highlight of highlights) {
        const { box, edges } = highlight.kind === 'piece' ? this.pieceGeometry : this.slabGeometries[highlight.axis];
        const mesh = new THREE.Mesh(
          box,
          new THREE.MeshBasicMaterial({ color: highlight.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: highlight.color, transparent: true }));
        for (const object of [mesh, outline]) {
          if (highlight.kind === 'piece') object.position.set(...highlight.pos);
          else object.position.setComponent(highlight.axis, highlight.layer);
          object.renderOrder = 1;
          this.root.add(object);
        }
        this.highlightObjects.push({ mesh, edges: outline, highlight });
      }
    }
    this.animateHighlights(performance.now());
  }

  private animateHighlights(time: number): void {
    for (const { mesh, edges, highlight } of this.highlightObjects) {
      const strength = (highlight.strength ?? 1) * (highlight.pulse ? 0.65 + 0.35 * Math.sin(time / 180) : 1);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (highlight.kind === 'piece' ? 0.22 : 0.16) * strength;
      (edges.material as THREE.LineBasicMaterial).opacity = 0.9 * strength;
      if (highlight.kind !== 'piece' && highlight.preview) {
        // Balanceo: gira un poco hacia donde va el giro, se detiene y vuelve.
        const angle = Math.sign(highlight.preview) * PREVIEW_ANGLE * previewWave(time);
        for (const object of [mesh, edges]) {
          object.rotation.set(0, 0, 0);
          object.rotation[(['x', 'y', 'z'] as const)[highlight.axis]] = angle;
        }
      }
    }
  }

  /** Vuelve a colocar todas las piezas en su sitio (cubo resuelto). */
  reset(): void {
    this.root.quaternion.identity();
    for (const cubie of this.cubies) {
      this.root.remove(cubie.object);
      this.pivot.remove(cubie.object);
    }
    this.turningCubies = [];
    this.buildCubies();
  }

  // --- Giros de capas ---------------------------------------------------

  async animateTurn(turn: Turn, durationMs: number): Promise<void> {
    this.attachLayers(turn.axis, turn.layers);
    const target = (turn.quarters * Math.PI) / 2;
    await tween(durationMs, easeOutCubic, (k) => this.setPivotAngle(target * k));
    this.detachLayers(turnMatrix(turn));
  }

  /** Empieza un giro que sigue al dedo o a la mano. */
  beginManualTurn(axis: Axis, layer: number): void {
    this.turningLayer = layer;
    this.attachLayers(axis, [layer]);
  }

  setManualAngle(radians: number): void {
    this.setPivotAngle(radians);
  }

  /** Termina el giro manual encajándolo en `quarters` cuartos de vuelta (0 = cancelar). */
  async finishManualTurn(quarters: number): Promise<void> {
    const from = this.pivotAngle();
    const to = (quarters * Math.PI) / 2;
    const durationMs = 60 + 140 * Math.min(1, Math.abs(to - from) / (Math.PI / 2));
    await tween(durationMs, easeOutQuad, (k) => this.setPivotAngle(from + (to - from) * k));
    this.detachLayers(turnMatrix({ axis: this.turningAxis, layers: [this.turningLayer], quarters }));
  }

  // --- Rotación del cubo entero -----------------------------------------

  /** Rota el cubo libremente según el arrastre en pantalla (en píxeles). */
  rotateByScreenDelta(dx: number, dy: number): void {
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * FREE_ROTATION_SPEED);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const tilt = new THREE.Quaternion().setFromAxisAngle(right, dy * FREE_ROTATION_SPEED);
    this.root.quaternion.premultiply(spin).premultiply(tilt);
  }

  /** La orientación "recta" más cercana a la rotación libre actual. */
  nearestRotation(): Mat3 {
    let best = IDENTITY;
    let bestDot = -1;
    for (const rotation of CUBE_ROTATIONS) {
      const dot = Math.abs(this.root.quaternion.dot(toQuaternion(rotation)));
      if (dot > bestDot) {
        bestDot = dot;
        best = rotation;
      }
    }
    return best;
  }

  /** Anima el cubo entero hasta `rotation` y la incorpora a las piezas. */
  async animateRotation(rotation: Mat3, durationMs: number): Promise<void> {
    const from = this.root.quaternion.clone();
    const to = toQuaternion(rotation);
    await tween(durationMs, easeOutCubic, (k) => this.root.quaternion.slerpQuaternions(from, to, k));
    for (const cubie of this.cubies) {
      cubie.pos = mulMatVec(rotation, cubie.pos);
      cubie.orient = mulMat(rotation, cubie.orient);
      applyTransform(cubie);
    }
    this.root.quaternion.identity();
  }

  /**
   * Un segundo renderizador, pequeño, que dibuja el mismo cubo encuadrado en
   * un cuadrado de `size` píxeles. Para grabar video es mucho más barato que
   * copiar el lienzo de la pantalla: en Safari esa copia obliga a leer de la
   * tarjeta gráfica una imagen enorme en cada fotograma.
   */
  createSnapshot(size: number): CubeSnapshot {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    // Cada renderizador necesita su propia iluminación de entorno.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    camera.position.copy(this.camera.position).setLength(CUBE_RADIUS / Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV) / 2));
    camera.lookAt(0, 0, 0);
    return {
      canvas: renderer.domElement,
      render: () => {
        const screenEnvironment = this.scene.environment;
        this.scene.environment = environment;
        renderer.render(this.scene, camera);
        this.scene.environment = screenEnvironment;
      },
      dispose: () => {
        environment.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      },
    };
  }

  // --- Consultas para el control táctil ---------------------------------

  /** ¿Qué pegatina hay bajo este punto de la pantalla? */
  pick(clientX: number, clientY: number): PickResult | null {
    this.root.updateMatrixWorld();
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.cubies.map((c) => c.object),
      true,
    )[0];
    if (!hit?.face) return null;

    const cubie = this.cubies.find((c) => c.object === hit.object.parent);
    if (!cubie) return null;
    const toCube = this.root.quaternion.clone().invert();
    const normal = roundToAxis(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(toCube));
    const axis = normal.findIndex((v) => v !== 0);
    // Solo sirven las caras exteriores del cubo.
    if (cubie.pos[axis] !== normal[axis]) return null;

    const point = this.root.worldToLocal(hit.point.clone());
    return { cubiePos: cubie.pos, normal, point: [point.x, point.y, point.z] };
  }

  /** Cuánto se desplaza en pantalla (en píxeles) un paso de una unidad en `direction` desde `point`. */
  screenDirection(point: Vec3, direction: Vec3): ScreenVector {
    this.root.updateMatrixWorld();
    const rect = this.canvas.getBoundingClientRect();
    const a = this.root.localToWorld(new THREE.Vector3(...point)).project(this.camera);
    const b = this.root
      .localToWorld(new THREE.Vector3(point[0] + direction[0], point[1] + direction[1], point[2] + direction[2]))
      .project(this.camera);
    return { x: ((b.x - a.x) * rect.width) / 2, y: (-(b.y - a.y) * rect.height) / 2 };
  }

  // --- Internos ---------------------------------------------------------

  private buildCubies(): void {
    this.cubies = [];
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        for (const z of [-1, 0, 1]) {
          if (x === 0 && y === 0 && z === 0) continue;
          const pos: Vec3 = [x, y, z];
          const object = new THREE.Group();
          object.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));
          for (const face of FACES) {
            const normal = FACE_NORMALS[face];
            const axis = normal.findIndex((v) => v !== 0);
            if (pos[axis] !== normal[axis]) continue;
            const sticker = new THREE.Mesh(this.stickerGeometry, this.stickerMaterials[face]);
            const n = new THREE.Vector3(...normal);
            sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            sticker.position.copy(n.multiplyScalar(CUBIE_SIZE / 2 + 0.002));
            object.add(sticker);
          }
          const cubie: Cubie = { object, pos, orient: IDENTITY };
          applyTransform(cubie);
          this.root.add(object);
          this.cubies.push(cubie);
        }
      }
    }
  }

  private attachLayers(axis: Axis, layers: readonly number[]): void {
    this.turningAxis = axis;
    this.pivot.rotation.set(0, 0, 0);
    this.turningCubies = this.cubies.filter((c) => layers.includes(c.pos[axis]));
    for (const cubie of this.turningCubies) this.pivot.add(cubie.object);
  }

  private detachLayers(matrix: Mat3): void {
    for (const cubie of this.turningCubies) {
      cubie.pos = mulMatVec(matrix, cubie.pos);
      cubie.orient = mulMat(matrix, cubie.orient);
      this.root.add(cubie.object);
      applyTransform(cubie);
    }
    this.turningCubies = [];
    this.pivot.rotation.set(0, 0, 0);
  }

  private setPivotAngle(radians: number): void {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.rotation[(['x', 'y', 'z'] as const)[this.turningAxis]] = radians;
  }

  private pivotAngle(): number {
    return this.pivot.rotation[(['x', 'y', 'z'] as const)[this.turningAxis]];
  }

  private resize(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;

    // Aleja la cámara lo justo para que el cubo quepa en vertical y en horizontal.
    const vFov = THREE.MathUtils.degToRad(CAMERA_FOV);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance = Math.max(FIT_RADIUS_VERTICAL / Math.sin(vFov / 2), FIT_RADIUS_HORIZONTAL / Math.sin(hFov / 2));
    const azimuth = THREE.MathUtils.degToRad(32);
    const elevation = THREE.MathUtils.degToRad(27);
    this.camera.position.set(
      distance * Math.sin(azimuth) * Math.cos(elevation),
      distance * Math.sin(elevation),
      distance * Math.cos(azimuth) * Math.cos(elevation),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}

const PREVIEW_ANGLE = 0.45;
const PREVIEW_PERIOD_MS = 1500;

/** 0 → 1 (ida suave), pausa, 1 → 0 (vuelta), pausa. */
function previewWave(time: number): number {
  const t = (time % PREVIEW_PERIOD_MS) / PREVIEW_PERIOD_MS;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.4) return smooth(t / 0.4);
  if (t < 0.6) return 1;
  if (t < 0.85) return 1 - smooth((t - 0.6) / 0.25);
  return 0;
}

function applyTransform(cubie: Cubie): void {
  cubie.object.position.set(...cubie.pos);
  cubie.object.quaternion.copy(toQuaternion(cubie.orient));
}

function toQuaternion(m: Mat3): THREE.Quaternion {
  const matrix = new THREE.Matrix4().set(
    m[0][0], m[0][1], m[0][2], 0,
    m[1][0], m[1][1], m[1][2], 0,
    m[2][0], m[2][1], m[2][2], 0,
    0, 0, 0, 1,
  );
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function roundToAxis(v: THREE.Vector3): Vec3 {
  const abs = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  const axis = abs.indexOf(Math.max(...abs));
  const result = [0, 0, 0];
  result[axis] = Math.sign(v.getComponent(axis));
  return result as unknown as Vec3;
}

function roundedSquare(size: number, radius: number): THREE.ShapeGeometry {
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(shape, 6);
}
