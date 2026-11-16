import * as THREE from 'three';

export type InteractiveTargetCategory =
  | 'tambo-alfa'
  | 'solar-array-east'
  | 'solar-array-west'
  | 'mars-rover'
  | 'water-recycler'
  | 'meda-station'
  | 'science-node'
  | 'astronaut';

export interface InteractiveTarget {
  id: string;
  category: InteractiveTargetCategory;
  titleKey: string;
  subtitleKey: string;
  /** Hitbox invisible agrandada para facilitar el toque infantil en pantallas móviles */
  hitboxMesh: THREE.Object3D;
  /** Punto exacto en coordenadas de mundo hacia donde enfocará OrbitControls.target */
  focusPoint: THREE.Vector3;
  /** Offset relativo sugerido para posicionar la cámara al enfocar con GSAP */
  cameraOffset: THREE.Vector3;
}

export interface InputManagerCallbacks {
  onSelectTarget?: (target: InteractiveTarget) => void;
  onTapTerrain?: (worldPoint: THREE.Vector3) => void;
  onToggleKhipu?: () => void;
  onAdvanceSol?: () => void;
  onResetCamera?: () => void;
}

export class InputManager {
  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private pointerNDC: THREE.Vector2;

  private interactiveTargets: Map<THREE.Object3D, InteractiveTarget> = new Map();
  private hitboxObjects: THREE.Object3D[] = [];
  private terrainObject: THREE.Object3D | null = null;

  private pointerDownPos: { x: number; y: number } | null = null;
  private activePointerId: number | null = null;
  private readonly tapThresholdPx = 6; // Menor a 6px diferencia entre arrastre de cámara y tap/clic

  // Estado de teclas WASD / Flechas para navegación en PC
  private keysPressed: Set<string> = new Set();
  private callbacks: InputManagerCallbacks;

  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnBlur: () => void;

  constructor(
    domElement: HTMLElement,
    camera: THREE.PerspectiveCamera,
    callbacks: InputManagerCallbacks = {}
  ) {
    this.domElement = domElement;
    this.camera = camera;
    this.callbacks = callbacks;
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();

    this.boundOnPointerDown = this.handlePointerDown.bind(this);
    this.boundOnPointerUp = this.handlePointerUp.bind(this);
    this.boundOnPointerMove = this.handlePointerMove.bind(this);
    this.boundOnKeyDown = this.handleKeyDown.bind(this);
    this.boundOnKeyUp = this.handleKeyUp.bind(this);
    this.boundOnBlur = () => this.keysPressed.clear();

    this.attachListeners();
  }

  private attachListeners(): void {
    this.domElement.addEventListener('pointerdown', this.boundOnPointerDown, { passive: true });
    this.domElement.addEventListener('pointerup', this.boundOnPointerUp, { passive: true });
    this.domElement.addEventListener('pointermove', this.boundOnPointerMove, { passive: true });

    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
    window.addEventListener('blur', this.boundOnBlur);
  }

  /**
   * Registra un objetivo 3D interactivo y su hitbox invisible agrandada
   */
  public registerInteractiveTarget(target: InteractiveTarget): void {
    this.interactiveTargets.set(target.hitboxMesh, target);
    this.hitboxObjects.push(target.hitboxMesh);
  }

  /**
   * Registra el terreno marciano (jezero-terrain.glb) para soportar navegación Tap-to-Move
   */
  public registerTerrainSurface(terrain: THREE.Object3D): void {
    this.terrainObject = terrain;
  }

  public getInteractiveTargets(): InteractiveTarget[] {
    return Array.from(this.interactiveTargets.values());
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.pointerDownPos = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  /**
   * Evalúa si el gesto fue un toque rápido / clic (<6px de desplazamiento) y ejecuta el Raycaster
   */
  private handlePointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId || !this.pointerDownPos) {
      return;
    }

    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const distancePx = Math.hypot(dx, dy);

    this.pointerDownPos = null;
    this.activePointerId = null;

    if (distancePx < this.tapThresholdPx) {
      this.performRaycastSelection(event.clientX, event.clientY);
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || this.hitboxObjects.length === 0) {
      return;
    }

    this.updateNormalizedPointer(event.clientX, event.clientY);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxObjects, true);

    this.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  }

  private updateNormalizedPointer(clientX: number, clientY: number): void {
    const rect = this.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Ejecuta el Raycaster:
   * 1. Prioriza las hitboxes invisibles agrandadas de edificios/equipos/nodos.
   * 2. Si no tocó un edificio, comprueba intersección con jezero-terrain.glb para Tap-to-Move.
   */
  private performRaycastSelection(clientX: number, clientY: number): void {
    this.updateNormalizedPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // 1. Verificar hitboxes de estaciones y equipos interactivos
    if (this.hitboxObjects.length > 0) {
      const intersections = this.raycaster.intersectObjects(this.hitboxObjects, true);
      for (const hit of intersections) {
        let currentObj: THREE.Object3D | null = hit.object;
        while (currentObj) {
          const target = this.interactiveTargets.get(currentObj);
          if (target) {
            this.callbacks.onSelectTarget?.(target);
            window.dispatchEvent(
              new CustomEvent('astranoesis:target-selected', { detail: { target } })
            );
            return;
          }
          currentObj = currentObj.parent;
        }
      }
    }

    // 2. Navegación Tap-to-Move sobre jezero-terrain.glb
    if (this.terrainObject) {
      const terrainHits = this.raycaster.intersectObject(this.terrainObject, true);
      if (terrainHits.length > 0) {
        const hitPoint = terrainHits[0].point.clone();
        this.callbacks.onTapTerrain?.(hitPoint);
      }
    }
  }

  /**
   * Manejo de teclado en PC: WASD para navegar, K para Khipu, Espacio para avanzar el Sol, R/Esc para vista global
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
      return;
    }

    const code = event.code;
    this.keysPressed.add(code);

    if (code === 'KeyK' && !event.repeat) {
      event.preventDefault();
      this.callbacks.onToggleKhipu?.();
      window.dispatchEvent(new CustomEvent('astranoesis:toggle-khipu'));
    } else if (code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.callbacks.onAdvanceSol?.();
      window.dispatchEvent(new CustomEvent('astranoesis:advance-sol'));
    } else if ((code === 'KeyR' || code === 'Escape') && !event.repeat) {
      event.preventDefault();
      this.callbacks.onResetCamera?.();
      window.dispatchEvent(new CustomEvent('astranoesis:reset-camera'));
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.code);
  }

  /**
   * Calcula el vector de dirección en el plano XZ a partir de las teclas WASD o Flechas presionadas
   */
  public getMovementVector(camera: THREE.Camera): { x: number; z: number; isMoving: boolean } {
    let forwardInput = 0;
    let rightInput = 0;

    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) forwardInput += 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) forwardInput -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) rightInput += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) rightInput -= 1;

    if (forwardInput === 0 && rightInput === 0) {
      return { x: 0, z: 0, isMoving: false };
    }

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.0001) {
      forward.normalize();
    } else {
      forward.set(0, 0, -1);
    }

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, forwardInput)
      .addScaledVector(right, rightInput);

    if (moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
    }

    return {
      x: moveDir.x,
      z: moveDir.z,
      isMoving: true,
    };
  }

  public dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.domElement.removeEventListener('pointerup', this.boundOnPointerUp);
    this.domElement.removeEventListener('pointermove', this.boundOnPointerMove);
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
    window.removeEventListener('blur', this.boundOnBlur);
  }
}
