import * as THREE from 'three';
import gsap from 'gsap';
import { BLENDER_NODES } from '@/core/constants';
import { KhipuResourceNode, ResourcesState } from '@/core/types';

interface KnotNodeEntry {
  node: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
}

export class KhipuController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  private khipuRoot: THREE.Group | null = null;
  private currentHost: HTMLElement | null = null;

  private resourceKnots: Record<KhipuResourceNode, KnotNodeEntry[]> = {
    Water: [],
    Oxygen: [],
    Energy: [],
    Radiation: [],
  };
  private actKnots: KnotNodeEntry[] = [];
  private branchPivots: THREE.Object3D[] = [];
  private intiMedallion: THREE.Object3D | null = null;

  private isDragging = false;
  private previousPointerX = 0;
  private targetRotationY = 0;
  private animationFrameId: number | null = null;

  private readonly activeScale = new THREE.Vector3(1, 1, 1);
  private readonly attenuatedScale = new THREE.Vector3(0.35, 0.35, 0.35);

  constructor() {
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();

    // Cámara encuadrando el Khipu 3D completo (X: [-2.4, 2.4], Y: [0.3, 3.85])
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 2.1, 6.2);
    this.camera.lookAt(0, 2.05, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    const canvas = this.renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';

    this.setupLighting();
    this.setupInteractiveRotation(canvas);
    this.startLoop();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xfff4e6, 1.4);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffdfa8, 2.6);
    keyLight.position.set(3, 5, 5);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 1.8, 12);
    rimLight.position.set(-3, 2, -2);
    this.scene.add(rimLight);
  }

  /**
   * Permite a los niños girar el Khipu 3D con un dedo o con el ratón
   */
  private setupInteractiveRotation(canvas: HTMLCanvasElement): void {
    canvas.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        this.isDragging = true;
        this.previousPointerX = e.clientX;
        canvas.style.cursor = 'grabbing';
      },
      { passive: true }
    );

    window.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (!this.isDragging) return;
        const deltaX = e.clientX - this.previousPointerX;
        this.previousPointerX = e.clientX;
        this.targetRotationY = THREE.MathUtils.clamp(
          this.targetRotationY + deltaX * 0.012,
          -0.65,
          0.65
        );
      },
      { passive: true }
    );

    window.addEventListener(
      'pointerup',
      () => {
        this.isDragging = false;
        canvas.style.cursor = 'grab';
      },
      { passive: true }
    );
  }

  /**
   * Vincula el modelo khipu-tracker.glb cargado y aísla los materiales de los 20 nudos y 4 marcadores de acto
   */
  public bindKhipuModel(khipuTemplate: THREE.Group): void {
    if (this.khipuRoot) {
      this.scene.remove(this.khipuRoot);
    }

    this.khipuRoot = khipuTemplate.clone(true);
    this.scene.add(this.khipuRoot);

    // 1. Registrar los 20 nudos de recursos: Knot_[Water|Oxygen|Energy|Radiation]_L1..L5
    for (const cord of BLENDER_NODES.KHIPU.CORDS) {
      this.resourceKnots[cord] = [];
      for (let level = 1 as 1 | 2 | 3 | 4 | 5; level <= 5; level++) {
        const knotName = BLENDER_NODES.KHIPU.getKnotName(cord, level as 1 | 2 | 3 | 4 | 5);
        const knotNode = this.khipuRoot.getObjectByName(knotName);
        if (knotNode) {
          this.resourceKnots[cord].push(this.prepareIndependentKnotEntry(knotNode));
        }
      }
    }

    // 2. Registrar los 4 nudos de Acto: Act_Knot_01..04
    this.actKnots = [];
    for (const actKnotName of BLENDER_NODES.KHIPU.ACT_KNOTS) {
      const actNode = this.khipuRoot.getObjectByName(actKnotName);
      if (actNode) {
        this.actKnots.push(this.prepareIndependentKnotEntry(actNode, new THREE.Color(0xf59e0b)));
      }
    }

    // 3. Registrar pivotes de las 4 cuerdas y medallón Inti para oscilación orgánica
    this.branchPivots = [
      'Branch_Pivot_01_Water',
      'Branch_Pivot_02_Oxygen',
      'Branch_Pivot_03_Energy',
      'Branch_Pivot_04_Radiation',
    ]
      .map((name) => this.khipuRoot?.getObjectByName(name))
      .filter((obj): obj is THREE.Object3D => Boolean(obj));

    this.intiMedallion = this.khipuRoot.getObjectByName('Inti_Core_Medallion') ?? null;
  }

  /**
   * Clona el material de un nudo individual para poder controlar su emisión independientemente
   */
  private prepareIndependentKnotEntry(
    node: THREE.Object3D,
    overrideEmissive?: THREE.Color
  ): KnotNodeEntry {
    const materials: THREE.MeshStandardMaterial[] = [];
    const baseEmissive: THREE.Color[] = [];

    node.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const clonedMat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mesh.material = clonedMat;
          materials.push(clonedMat);

          const hasEmissive =
            clonedMat.emissive.r + clonedMat.emissive.g + clonedMat.emissive.b > 0.001;
          const emissiveColor = overrideEmissive
            ? overrideEmissive.clone()
            : hasEmissive
              ? clonedMat.emissive.clone()
              : clonedMat.color.clone().multiplyScalar(0.5);

          baseEmissive.push(emissiveColor);
        }
      }
    });

    return { node, materials, baseEmissive };
  }

  /**
   * Monta el canvas 3D del Khipu en el contenedor DOM activo (Panel Lateral en PC o Drawer en Móvil)
   */
  public mountToContainer(container: HTMLElement | null): void {
    this.currentHost = container;
    if (!container) return;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);
    this.resizeToHost();
  }

  public resizeToHost(): void {
    if (!this.currentHost) return;
    const width = Math.max(180, this.currentHost.clientWidth || 260);
    const height = Math.max(180, this.currentHost.clientHeight || 240);

    this.camera.aspect = width / height;
    // Ajustar distancia según relación de aspecto del contenedor
    this.camera.position.z = width < 240 ? 6.8 : 6.1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Sincroniza los 20 nudos (Knot_[Recurso]_L1..L5) donde cada nudo representa un 20%
   * - Activos: escala (1, 1, 1) con emisión activa
   * - Atenuados: escala (0.35, 0.35, 0.35) sin emisión brillante
   * Y sincroniza Act_Knot_01..04 según el Acto actual (1..4).
   */
  public syncState(resources: ResourcesState, currentAct: 1 | 2 | 3 | 4): void {
    const percents: Record<KhipuResourceNode, number> = {
      Water: THREE.MathUtils.clamp((resources.water.current / resources.water.capacity) * 100, 0, 100),
      Oxygen: THREE.MathUtils.clamp(
        (resources.oxygen.current / resources.oxygen.capacity) * 100,
        0,
        100
      ),
      Energy: THREE.MathUtils.clamp(
        (resources.energy.current / resources.energy.capacity) * 100,
        0,
        100
      ),
      Radiation: THREE.MathUtils.clamp(
        (resources.radiation.current / (resources.radiation.capacity * 0.6)) * 100,
        0,
        100
      ),
    };

    // Actualizar los 20 nudos de recursos (cada nudo = 20%)
    (Object.keys(percents) as KhipuResourceNode[]).forEach((cordKey) => {
      const pct = percents[cordKey];
      // Si un recurso está al 60%, L1..L3 (3 nudos) se activan y L4..L5 se atenúan
      const activeKnotsCount = pct <= 0 ? 0 : Math.min(5, Math.max(1, Math.round(pct / 20)));
      const knotEntries = this.resourceKnots[cordKey];

      knotEntries.forEach((entry, index) => {
        const isKnotActive = index < activeKnotsCount;
        const targetScale = isKnotActive ? this.activeScale : this.attenuatedScale;

        gsap.to(entry.node.scale, {
          x: targetScale.x,
          y: targetScale.y,
          z: targetScale.z,
          duration: 0.45,
          ease: 'back.out(1.6)',
        });

        entry.materials.forEach((mat, matIdx) => {
          mat.emissive.copy(entry.baseEmissive[matIdx]);
          mat.emissiveIntensity = isKnotActive ? 1.65 : 0.08;
          mat.opacity = isKnotActive ? 1.0 : 0.6;
          mat.needsUpdate = true;
        });
      });
    });

    // Actualizar los 4 marcadores de acto: Act_Knot_01..04
    this.actKnots.forEach((entry, index) => {
      const actNumber = index + 1;
      const isCurrentOrCompletedAct = actNumber <= currentAct;
      const isCurrentAct = actNumber === currentAct;
      const targetScale = isCurrentOrCompletedAct ? this.activeScale : this.attenuatedScale;

      gsap.to(entry.node.scale, {
        x: targetScale.x,
        y: targetScale.y,
        z: targetScale.z,
        duration: 0.45,
        ease: 'back.out(1.6)',
      });

      entry.materials.forEach((mat, matIdx) => {
        mat.emissive.copy(entry.baseEmissive[matIdx]);
        mat.emissiveIntensity = isCurrentAct ? 2.1 : isCurrentOrCompletedAct ? 1.1 : 0.06;
        mat.needsUpdate = true;
      });
    });
  }

  private startLoop(): void {
    if (this.animationFrameId !== null) return;

    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      const elapsed = this.clock.getElapsedTime();

      if (this.khipuRoot) {
        if (!this.isDragging) {
          this.targetRotationY = Math.sin(elapsed * 0.55) * 0.16;
        }
        this.khipuRoot.rotation.y += (this.targetRotationY - this.khipuRoot.rotation.y) * 0.08;
      }

      // Oscilación pendular suave de las 4 cuerdas del Khipu
      this.branchPivots.forEach((pivot, idx) => {
        pivot.rotation.z = Math.sin(elapsed * 1.6 + idx * 0.9) * 0.025;
      });

      if (this.intiMedallion) {
        this.intiMedallion.rotation.z = Math.sin(elapsed * 0.9) * 0.05;
      }

      if (this.currentHost && this.currentHost.isConnected) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.renderer.dispose();
  }
}
