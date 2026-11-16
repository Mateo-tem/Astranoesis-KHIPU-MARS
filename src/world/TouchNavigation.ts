import * as THREE from 'three';
import gsap from 'gsap';
import { AnimationController, AstronautPoseState } from './AnimationController';
import { CrewRole } from '@/core/types';

export type QuickStationId =
  | 'tambo-alfa'
  | 'solar-panels'
  | 'water-recycler'
  | 'rover-bay'
  | 'rover-jezero';

export interface StaticObstacleCollider {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface NpcAutonomousAgent {
  id: string;
  roleKey: 'ENGINEER' | 'SCIENTIST' | 'MEDIC';
  crewRole: CrewRole;
  group: THREE.Group;
  waypoints: THREE.Vector2[];
  currentWaypointIndex: number;
  state: 'WALKING' | 'WORKING' | 'TALKING_NPC' | 'GREETING_PLAYER' | 'ASSISTING_PLAYER';
  stateTimer: number;
  socialCooldown: number;
  partnerId?: string;
  assistTarget?: THREE.Vector2;
  assistPose?: AstronautPoseState;
}

export interface PhysicalTaskRequest {
  id: string;
  titleKey: string;
  stationId: QuickStationId;
  pose: AstronautPoseState;
  durationSeconds?: number;
  effectColorHex?: number;
  helperRole?: 'ENGINEER' | 'SCIENTIST' | 'MEDIC';
  onProgress?: (percent: number, phase: 'MOVING' | 'WORKING') => void;
  onComplete: () => void;
}

interface ActivePhysicalTaskState {
  request: PhysicalTaskRequest;
  phase: 'MOVING' | 'WORKING';
  elapsedWorkSeconds: number;
  totalWorkSeconds: number;
  lookAtPoint: THREE.Vector3;
}

export class TouchNavigation {
  private scene: THREE.Scene;
  private animationController: AnimationController;
  private terrainRoot: THREE.Object3D | null = null;
  private terrainRaycaster = new THREE.Raycaster();
  private readonly downVector = new THREE.Vector3(0, -1, 0);
  private readonly rayOriginTemp = new THREE.Vector3();

  private commanderGroup: THREE.Group | null = null;
  private roverGroup: THREE.Group | null = null;
  private npcAgents: NpcAutonomousAgent[] = [];

  private commanderTargetPos: THREE.Vector3 | null = null;
  private roverTargetPos: THREE.Vector3 | null = null;
  private commanderMoveElapsed = 0;
  private roverMoveElapsed = 0;
  private commanderBypassSign: 1 | -1 = 1;
  private roverBypassSign: 1 | -1 = 1;
  private activeNearNpcRole: 'ENGINEER' | 'SCIENTIST' | 'MEDIC' | null = null;

  private activeTask: ActivePhysicalTaskState | null = null;

  private groundMarkerGroup: THREE.Group;
  private outerRingMesh: THREE.Mesh;
  private innerDiscMesh: THREE.Mesh;

  // Efecto visual 3D cuando el personaje o el Rover están ejecutando una acción en una estación
  private workEffectGroup: THREE.Group;
  private workEffectRing: THREE.Mesh;
  private workEffectParticles: THREE.Points;
  private workEffectLight: THREE.PointLight;

  private thumbInputVector = new THREE.Vector2(0, 0);
  private scienceNodeCycleIndex = 0;

  // Límites seguros del terreno calculados dinámicamente a partir de jezero-terrain.glb
  private terrainBounds = {
    minX: -55,
    maxX: 55,
    minZ: -55,
    maxZ: 55,
    maxRadiusCommander: 46,
    maxRadiusRover: 62,
  };

  // Obstáculos físicos ajustados al contorno real de cada modelo 3D (sin solapamientos entre sí)
  private readonly staticObstacles: StaticObstacleCollider[] = [
    { id: 'tambo-alfa-core', x: 0, z: 0, radius: 3.3 },
    { id: 'solar-array-east', x: 14, z: -2, radius: 2.1 },
    { id: 'solar-array-west', x: -14, z: -2, radius: 2.1 },
    { id: 'water-recycler-skid', x: 5, z: 4, radius: 1.1 },
    { id: 'meda-weather-station', x: 18, z: 14, radius: 1.1 },
  ];

  // Coordenadas accesibles de los 4 Science_Node en jezero-terrain.glb
  private readonly scienceNodePositions: THREE.Vector3[] = [
    new THREE.Vector3(28, -2.05, 25), // Science_Node_02_Jezero_Delta_Deposit
    new THREE.Vector3(-19, -0.65, 34), // Science_Node_03_Neretva_Riverbed
    new THREE.Vector3(42, -8.5, 39), // Science_Node_01_Jezero_Crater_Core
    new THREE.Vector3(-36, 1.25, -38), // Science_Node_04_North_Butte
  ];

  constructor(scene: THREE.Scene, animationController: AnimationController) {
    this.scene = scene;
    this.animationController = animationController;

    // 1. Marcador circular 3D en el suelo para Tap-to-Move
    this.groundMarkerGroup = new THREE.Group();
    this.groundMarkerGroup.visible = false;

    const ringGeo = new THREE.RingGeometry(0.65, 0.92, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.outerRingMesh = new THREE.Mesh(ringGeo, ringMat);

    const discGeo = new THREE.CircleGeometry(0.45, 24);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.innerDiscMesh = new THREE.Mesh(discGeo, discMat);

    this.groundMarkerGroup.add(this.outerRingMesh, this.innerDiscMesh);
    this.scene.add(this.groundMarkerGroup);

    // 2. Grupo de efectos 3D de trabajo (chispas de reparación, rocío de agua, limpieza solar, escaneo)
    this.workEffectGroup = new THREE.Group();
    this.workEffectGroup.visible = false;

    const workRingGeo = new THREE.RingGeometry(0.9, 1.35, 36);
    workRingGeo.rotateX(-Math.PI / 2);
    const workRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.workEffectRing = new THREE.Mesh(workRingGeo, workRingMat);

    const particleCount = 36;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.35 + Math.random() * 0.85;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = Math.random() * 1.8;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.workEffectParticles = new THREE.Points(particleGeo, particleMat);

    this.workEffectLight = new THREE.PointLight(0x38bdf8, 2.2, 8);
    this.workEffectLight.position.set(0, 1.4, 0);

    this.workEffectGroup.add(this.workEffectRing, this.workEffectParticles, this.workEffectLight);
    this.scene.add(this.workEffectGroup);
  }

  public registerTerrain(terrainRoot: THREE.Object3D): void {
    this.terrainRoot = terrainRoot;
    const box = new THREE.Box3().setFromObject(terrainRoot);
    if (!box.isEmpty()) {
      const margin = 4.5;
      this.terrainBounds.minX = box.min.x + margin;
      this.terrainBounds.maxX = box.max.x - margin;
      this.terrainBounds.minZ = box.min.z + margin;
      this.terrainBounds.maxZ = box.max.z - margin;
      const halfSpan = Math.min(
        Math.abs(this.terrainBounds.minX),
        Math.abs(this.terrainBounds.maxX),
        Math.abs(this.terrainBounds.minZ),
        Math.abs(this.terrainBounds.maxZ)
      );
      if (halfSpan > 15) {
        this.terrainBounds.maxRadiusCommander = Math.min(48, halfSpan - 2);
        this.terrainBounds.maxRadiusRover = Math.min(64, halfSpan);
      }
    }
  }

  public isCommanderMoving(): boolean {
    return this.commanderTargetPos !== null || this.thumbInputVector.lengthSq() > 0.001;
  }

  public registerUnits(commander: THREE.Group, rover: THREE.Group): void {
    this.commanderGroup = commander;
    this.roverGroup = rover;
    this.clampObjectToTerrain(commander, 0.05);
    this.clampObjectToTerrain(rover, 0.08);
  }

  /**
   * Registra un especialista NPC autónomo con su ruta de trabajo real en la colonia
   */
  public registerAutonomousNpc(
    id: string,
    roleKey: 'ENGINEER' | 'SCIENTIST' | 'MEDIC',
    group: THREE.Group,
    waypoints: THREE.Vector2[]
  ): void {
    this.clampObjectToTerrain(group, 0.05);
    const crewRole: CrewRole =
      roleKey === 'ENGINEER'
        ? 'FLIGHT_ENGINEER'
        : roleKey === 'SCIENTIST'
        ? 'SCIENCE_OFFICER'
        : 'MEDIC_OFFICER';

    this.npcAgents.push({
      id,
      roleKey,
      crewRole,
      group,
      waypoints,
      currentWaypointIndex: 0,
      state: 'WALKING',
      stateTimer: 3.0 + Math.random() * 2.0,
      socialCooldown: 0,
    });
  }

  /**
   * Calcula la altura exacta Y del terreno marciano en (x, z) mediante Raycasting vertical
   */
  public sampleTerrainHeight(x: number, z: number, fallbackY = 0.12): number {
    if (!this.terrainRoot) return fallbackY;
    this.rayOriginTemp.set(x, 80, z);
    this.terrainRaycaster.set(this.rayOriginTemp, this.downVector);
    const hits = this.terrainRaycaster.intersectObject(this.terrainRoot, true);
    if (hits.length > 0) {
      return hits[0].point.y;
    }
    return fallbackY;
  }

  public clampObjectToTerrain(obj: THREE.Object3D, heightOffset = 0.05): void {
    const groundY = this.sampleTerrainHeight(obj.position.x, obj.position.z, obj.position.y);
    obj.position.y = groundY + heightOffset;
  }

  /**
   * Resuelve colisiones 2D en el plano XZ contra los límites del terreno, edificios, paneles, Rover y otros astronautas
   */
  public resolvePositionWithCollisions(
    desiredX: number,
    desiredZ: number,
    unitRadius: number,
    selfId: string
  ): { x: number; z: number } {
    // 0. Limitar estrictamente dentro de los bordes reales del terreno marciano
    let resolvedX = THREE.MathUtils.clamp(
      desiredX,
      this.terrainBounds.minX + unitRadius,
      this.terrainBounds.maxX - unitRadius
    );
    let resolvedZ = THREE.MathUtils.clamp(
      desiredZ,
      this.terrainBounds.minZ + unitRadius,
      this.terrainBounds.maxZ - unitRadius
    );

    const maxAllowedRadius =
      selfId === 'rover'
        ? this.terrainBounds.maxRadiusRover
        : this.terrainBounds.maxRadiusCommander;
    const radialDist = Math.hypot(resolvedX, resolvedZ);
    if (radialDist > maxAllowedRadius) {
      const scale = maxAllowedRadius / radialDist;
      resolvedX *= scale;
      resolvedZ *= scale;
    }

    // Verificar por Raycast que exista malla de terreno debajo del punto; si no, mantener dentro del borde válido
    if (this.terrainRoot) {
      this.rayOriginTemp.set(resolvedX, 80, resolvedZ);
      this.terrainRaycaster.set(this.rayOriginTemp, this.downVector);
      const hits = this.terrainRaycaster.intersectObject(this.terrainRoot, true);
      if (hits.length === 0 && radialDist > 1.0) {
        const pullBack = Math.max(0, radialDist - 1.5) / radialDist;
        resolvedX *= pullBack;
        resolvedZ *= pullBack;
      }
    }

    // 1. Colisión contra edificios y estructuras fijas (2 pasadas para evitar quedar atrapado entre 2 bordes)
    for (let pass = 0; pass < 2; pass++) {
      for (const obs of this.staticObstacles) {
        const dx = resolvedX - obs.x;
        const dz = resolvedZ - obs.z;
        const dist = Math.hypot(dx, dz);
        const minAllowed = obs.radius + unitRadius;
        if (dist < minAllowed) {
          const nx = dist > 0.0001 ? dx / dist : 0;
          const nz = dist > 0.0001 ? dz / dist : 1;
          resolvedX = obs.x + nx * minAllowed;
          resolvedZ = obs.z + nz * minAllowed;
        }
      }
    }

    // 2. Colisión contra el Rover Perseverance (solo para peatones, con radio ajustado al chasis real)
    if (selfId !== 'rover' && this.roverGroup) {
      const dx = resolvedX - this.roverGroup.position.x;
      const dz = resolvedZ - this.roverGroup.position.z;
      const dist = Math.hypot(dx, dz);
      const minAllowed = 1.3 + unitRadius;
      if (dist < minAllowed) {
        const nx = dist > 0.0001 ? dx / dist : -1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        resolvedX = this.roverGroup.position.x + nx * minAllowed;
        resolvedZ = this.roverGroup.position.z + nz * minAllowed;
      }
    }

    // Si es el Rover en movimiento, no bloquearlo contra astronautas/NPCs
    if (selfId === 'rover') {
      return { x: resolvedX, z: resolvedZ };
    }

    // 3. Colisión de los NPCs contra el personaje principal (los NPCs ceden el paso al jugador)
    if (selfId !== 'commander' && this.commanderGroup) {
      const dx = resolvedX - this.commanderGroup.position.x;
      const dz = resolvedZ - this.commanderGroup.position.z;
      const dist = Math.hypot(dx, dz);
      const minAllowed = 0.55 + unitRadius;
      if (dist < minAllowed) {
        const nx = dist > 0.0001 ? dx / dist : 1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        resolvedX = this.commanderGroup.position.x + nx * minAllowed;
        resolvedZ = this.commanderGroup.position.z + nz * minAllowed;
      }
    }

    // 4. Colisión contra los especialistas NPC:
    // Si el jugador se dirige automáticamente a una estación o misión, los NPCs NUNCA lo bloquean.
    const isCommanderNavigating =
      selfId === 'commander' && (this.commanderTargetPos !== null || this.activeTask !== null);

    if (!isCommanderNavigating) {
      for (const npc of this.npcAgents) {
        if (npc.id === selfId) continue;
        const dx = resolvedX - npc.group.position.x;
        const dz = resolvedZ - npc.group.position.z;
        const dist = Math.hypot(dx, dz);
        const minAllowed = 0.45 + unitRadius;
        if (dist < minAllowed) {
          const nx = dist > 0.0001 ? dx / dist : 1;
          const nz = dist > 0.0001 ? dz / dist : 0;
          resolvedX = npc.group.position.x + nx * minAllowed;
          resolvedZ = npc.group.position.z + nz * minAllowed;
        }
      }
    }

    return { x: resolvedX, z: resolvedZ };
  }

  /**
   * Calcula el siguiente paso hacia (targetX, targetZ) rodeando suavemente cualquier obstáculo circular
   * (base, paneles solares, reciclador o Rover) sin quedarse atascado jamás.
   */
  private computeSteeredStep(
    currentX: number,
    currentZ: number,
    targetX: number,
    targetZ: number,
    step: number,
    unitRadius: number,
    selfId: string,
    preferredSign: 1 | -1
  ): { x: number; z: number; yaw: number; chosenSign: 1 | -1 } {
    const dx = targetX - currentX;
    const dz = targetZ - currentZ;
    const baseDist = Math.hypot(dx, dz);
    if (baseDist <= 0.0001) {
      return { x: currentX, z: currentZ, yaw: 0, chosenSign: preferredSign };
    }

    const baseAngle = Math.atan2(dx, dz);

    // 1. Probar línea recta directa hacia el destino
    const directX = currentX + Math.sin(baseAngle) * step;
    const directZ = currentZ + Math.cos(baseAngle) * step;
    const resolvedDirect = this.resolvePositionWithCollisions(directX, directZ, unitRadius, selfId);
    const directNewDist = Math.hypot(targetX - resolvedDirect.x, targetZ - resolvedDirect.z);
    const directProgress = baseDist - directNewDist;

    if (directProgress >= step * 0.72) {
      return {
        x: resolvedDirect.x,
        z: resolvedDirect.z,
        yaw: baseAngle,
        chosenSign: preferredSign,
      };
    }

    // 2. Si hay un edificio u obstáculo enfrente, probar ángulos tangenciales a ambos lados
    const candidateOffsets = [
      0.45 * preferredSign,
      -0.45 * preferredSign,
      0.85 * preferredSign,
      -0.85 * preferredSign,
      1.25 * preferredSign,
      -1.25 * preferredSign,
      1.62 * preferredSign,
      -1.62 * preferredSign,
    ];

    let bestX = resolvedDirect.x;
    let bestZ = resolvedDirect.z;
    let bestYaw = baseAngle;
    let bestScore = -Infinity;
    let bestSign: 1 | -1 = preferredSign;

    for (const offset of candidateOffsets) {
      const angle = baseAngle + offset;
      const candX = currentX + Math.sin(angle) * step;
      const candZ = currentZ + Math.cos(angle) * step;
      const res = this.resolvePositionWithCollisions(candX, candZ, unitRadius, selfId);
      const moved = Math.hypot(res.x - currentX, res.z - currentZ);
      if (moved < step * 0.35) continue;

      const newDist = Math.hypot(targetX - res.x, targetZ - res.z);
      const progress = baseDist - newDist;
      const sign: 1 | -1 = offset >= 0 ? 1 : -1;
      const signBonus = sign === preferredSign ? step * 0.12 : 0;
      const score = progress + moved * 0.35 + signBonus;

      if (score > bestScore) {
        bestScore = score;
        bestX = res.x;
        bestZ = res.z;
        bestYaw = Math.atan2(res.x - currentX, res.z - currentZ);
        bestSign = sign;
      }
    }

    return {
      x: bestX,
      z: bestZ,
      yaw: bestYaw,
      chosenSign: bestSign,
    };
  }

  /**
   * Ejecuta una tarea física real en la simulación:
   * 1. El Astronauta Principal (o el Rover) se desplaza físicamente hasta la estación.
   * 2. El especialista NPC correspondiente también acude a ayudar (ubicándose a un lado sin estorbar).
   * 3. Al llegar, realizan la animación de trabajo (barrer paneles, reparar tubos, regar plantas, escanear)
   *    con efectos visuales 3D y barra de progreso antes de aplicar la recompensa.
   */
  public startPhysicalTask(request: PhysicalTaskRequest): THREE.Vector3 {
    const dest = this.navigateToStation(request.stationId);

    let lookAtPoint = new THREE.Vector3(0, 0.5, 0);
    if (request.stationId === 'solar-panels') {
      lookAtPoint = new THREE.Vector3(14, 1.0, -2);
    } else if (request.stationId === 'water-recycler') {
      lookAtPoint = new THREE.Vector3(5, 1.0, 4);
    } else if (request.stationId === 'rover-bay') {
      lookAtPoint = this.roverGroup ? this.roverGroup.position.clone() : new THREE.Vector3(0, 1.0, 12);
    } else if (request.stationId === 'rover-jezero') {
      lookAtPoint = dest.clone();
    }

    // Enviar también al especialista NPC correspondiente a trabajar junto al jugador sin bloquear su destino
    if (request.helperRole) {
      const helperNpc = this.npcAgents.find((n) => n.roleKey === request.helperRole);
      if (helperNpc) {
        helperNpc.state = 'ASSISTING_PLAYER';
        helperNpc.stateTimer = 8.0;
        const npcAnchor =
          request.stationId === 'rover-jezero'
            ? new THREE.Vector2(2.4, 11.2)
            : new THREE.Vector2(dest.x - 1.9, dest.z + 1.3);
        helperNpc.assistTarget = npcAnchor;
        helperNpc.assistPose = request.pose;
      }
    }

    this.activeTask = {
      request,
      phase: 'MOVING',
      elapsedWorkSeconds: 0,
      totalWorkSeconds: request.durationSeconds ?? 2.5,
      lookAtPoint,
    };

    const effectColor = request.effectColorHex ?? 0x38bdf8;
    (this.workEffectRing.material as THREE.MeshBasicMaterial).color.setHex(effectColor);
    (this.workEffectParticles.material as THREE.PointsMaterial).color.setHex(effectColor);
    this.workEffectLight.color.setHex(effectColor);
    this.workEffectGroup.visible = false;

    this.emitTaskProgress(5, 'MOVING', request.titleKey, request.stationId);
    return dest;
  }

  public isTaskInProgress(): boolean {
    return this.activeTask !== null;
  }

  /**
   * Coreografía para la Escena 2 de la Intro Cinematográfica:
   * Los astronautas corren hacia la esclusa del hábitat Tambo Alfa durante la tormenta de aterrizaje.
   */
  public triggerEmergencyRushToHabitat(): void {
    this.moveAstronautTo(new THREE.Vector3(0, 0.15, 5.6));
    this.npcAgents.forEach((npc, idx) => {
      npc.state = 'ASSISTING_PLAYER';
      npc.stateTimer = 6.0;
      npc.assistTarget = new THREE.Vector2((idx - 1) * 2.4, 6.6);
      npc.assistPose = 'WORKING';
    });
  }

  private emitTaskProgress(
    percent: number,
    phase: 'MOVING' | 'WORKING' | 'DONE',
    titleKey: string,
    stationId: QuickStationId
  ): void {
    window.dispatchEvent(
      new CustomEvent('astranoesis:task-progress', {
        detail: {
          percent: Math.round(percent),
          phase,
          titleKey,
          stationId,
        },
      })
    );
  }

  /**
   * Ejecuta navegación Tap-to-Move cuando el jugador toca un punto válido sobre jezero-terrain.glb
   */
  public handleTerrainTap(worldPoint: THREE.Vector3): {
    unitMoved: 'astronaut' | 'rover';
    destination: THREE.Vector3;
  } {
    const distanceFromBase = Math.hypot(worldPoint.x, worldPoint.z);

    if (distanceFromBase <= 30) {
      const safeXZ = this.resolvePositionWithCollisions(worldPoint.x, worldPoint.z, 0.4, 'commander');
      const groundY = this.sampleTerrainHeight(safeXZ.x, safeXZ.z, worldPoint.y);
      const targetPos = new THREE.Vector3(safeXZ.x, groundY + 0.05, safeXZ.z);
      this.moveAstronautTo(targetPos);
      return { unitMoved: 'astronaut', destination: targetPos };
    } else {
      const safeXZ = this.resolvePositionWithCollisions(worldPoint.x, worldPoint.z, 1.1, 'rover');
      const groundY = this.sampleTerrainHeight(safeXZ.x, safeXZ.z, worldPoint.y);
      const targetPos = new THREE.Vector3(safeXZ.x, groundY + 0.08, safeXZ.z);
      this.moveRoverTo(targetPos);
      return { unitMoved: 'rover', destination: targetPos };
    }
  }

  public moveAstronautTo(destination: THREE.Vector3): void {
    if (!this.commanderGroup) return;
    const safeXZ = this.resolvePositionWithCollisions(destination.x, destination.z, 0.4, 'commander');
    const groundY = this.sampleTerrainHeight(safeXZ.x, safeXZ.z, destination.y);
    this.commanderTargetPos = new THREE.Vector3(safeXZ.x, groundY + 0.05, safeXZ.z);
    this.commanderMoveElapsed = 0;
    this.showGroundMarker(this.commanderTargetPos, 0xf59e0b);
  }

  public cancelAstronautTarget(): void {
    this.commanderTargetPos = null;
    this.commanderMoveElapsed = 0;
    this.hideGroundMarker();
  }

  public moveRoverTo(destination: THREE.Vector3): void {
    if (!this.roverGroup) return;
    const safeXZ = this.resolvePositionWithCollisions(destination.x, destination.z, 1.1, 'rover');
    const groundY = this.sampleTerrainHeight(safeXZ.x, safeXZ.z, destination.y);
    this.roverTargetPos = new THREE.Vector3(safeXZ.x, groundY + 0.08, safeXZ.z);
    this.roverMoveElapsed = 0;
    this.showGroundMarker(this.roverTargetPos, 0x38bdf8);
  }

  public navigateToStation(stationId: QuickStationId): THREE.Vector3 {
    if (stationId === 'tambo-alfa') {
      const dest = new THREE.Vector3(0.0, 0.15, 5.6);
      this.moveAstronautTo(dest);
      return dest;
    }
    if (stationId === 'solar-panels') {
      const dest = new THREE.Vector3(10.2, 0.15, -2.0);
      this.moveAstronautTo(dest);
      return dest;
    }
    if (stationId === 'water-recycler') {
      const dest = new THREE.Vector3(5.0, 0.15, 6.4);
      this.moveAstronautTo(dest);
      return dest;
    }
    if (stationId === 'rover-bay') {
      const roverPos = this.roverGroup ? this.roverGroup.position : new THREE.Vector3(0, 0.15, 12);
      const dest = new THREE.Vector3(roverPos.x - 2.4, 0.15, roverPos.z - 0.6);
      this.moveAstronautTo(dest);
      return dest;
    }

    // Estación 'rover-jezero': Acercar al astronauta a la bahía de control y enviar al Rover al nodo científico
    this.moveAstronautTo(new THREE.Vector3(-2.4, 0.15, 11.2));
    const targetNodePos =
      this.scienceNodePositions[this.scienceNodeCycleIndex % this.scienceNodePositions.length];
    this.scienceNodeCycleIndex += 1;
    this.moveRoverTo(targetNodePos);
    return targetNodePos;
  }

  public setThumbDirection(x: number, z: number): void {
    this.thumbInputVector.set(x, z);
    if (x === 0 && z === 0 && !this.commanderTargetPos) {
      this.animationController.setAstronautWalking('commander', false);
    }
  }

  public getThumbDirection(): { x: number; z: number; isActive: boolean } {
    const isActive = this.thumbInputVector.lengthSq() > 0.001;
    return {
      x: this.thumbInputVector.x,
      z: this.thumbInputVector.y,
      isActive,
    };
  }

  private showGroundMarker(position: THREE.Vector3, accentHex: number): void {
    this.groundMarkerGroup.position.set(position.x, position.y + 0.06, position.z);
    this.groundMarkerGroup.visible = true;
    (this.innerDiscMesh.material as THREE.MeshBasicMaterial).color.setHex(accentHex);

    gsap.killTweensOf(this.outerRingMesh.scale);
    this.outerRingMesh.scale.set(0.5, 0.5, 0.5);
    gsap.to(this.outerRingMesh.scale, {
      x: 1.35,
      y: 1.35,
      z: 1.35,
      duration: 0.65,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  private hideGroundMarker(): void {
    gsap.killTweensOf(this.outerRingMesh.scale);
    this.groundMarkerGroup.visible = false;
  }

  /**
   * Actualiza frame a frame el movimiento con colisiones del Astronauta Principal, el Rover,
   * la ejecución física de misiones y el trabajo autónomo de los 3 NPCs
   */
  public update(elapsedTime: number, deltaTime = 0.016, isDirectInputMoving = false): void {
    if (this.groundMarkerGroup.visible) {
      this.groundMarkerGroup.rotation.y = elapsedTime * 1.8;
    }

    // 1. Movimiento inteligente con evasión de obstáculos del Astronauta Principal
    if (this.commanderGroup) {
      if (isDirectInputMoving) {
        this.commanderTargetPos = null;
        this.commanderMoveElapsed = 0;
        this.animationController.setAstronautWalking('commander', true);
        this.animationController.setAstronautPose('commander', 'IDLE');
      } else if (this.commanderTargetPos) {
        this.commanderMoveElapsed += deltaTime;
        const dx = this.commanderTargetPos.x - this.commanderGroup.position.x;
        const dz = this.commanderTargetPos.z - this.commanderGroup.position.z;
        const dist = Math.hypot(dx, dz);

        const arrivalTolerance = this.activeTask ? 0.65 : 0.42;

        if (dist <= arrivalTolerance || this.commanderMoveElapsed >= 3.6) {
          this.commanderGroup.position.x = this.commanderTargetPos.x;
          this.commanderGroup.position.z = this.commanderTargetPos.z;
          this.clampObjectToTerrain(this.commanderGroup, 0.05);
          this.commanderTargetPos = null;
          this.commanderMoveElapsed = 0;
          this.animationController.setAstronautWalking('commander', false);
          this.hideGroundMarker();
        } else {
          const walkSpeed = this.activeTask ? 7.4 : 6.4;
          const step = Math.min(dist, walkSpeed * deltaTime);

          const steered = this.computeSteeredStep(
            this.commanderGroup.position.x,
            this.commanderGroup.position.z,
            this.commanderTargetPos.x,
            this.commanderTargetPos.z,
            step,
            0.4,
            'commander',
            this.commanderBypassSign
          );
          this.commanderBypassSign = steered.chosenSign;

          this.commanderGroup.position.x = steered.x;
          this.commanderGroup.position.z = steered.z;
          this.clampObjectToTerrain(this.commanderGroup, 0.05);

          this.commanderGroup.rotation.y = this.lerpAngle(
            this.commanderGroup.rotation.y,
            steered.yaw,
            11 * deltaTime
          );
          this.animationController.setAstronautWalking('commander', true);
        }
      } else if (!this.activeTask || this.activeTask.phase !== 'WORKING') {
        this.animationController.setAstronautWalking('commander', false);
        this.animationController.setAstronautPose('commander', 'IDLE');
      }
    }

    // 2. Movimiento con evasión de obstáculos y altura de terreno del Rover Perseverance
    if (this.roverGroup && this.roverTargetPos) {
      this.roverMoveElapsed += deltaTime;
      const dx = this.roverTargetPos.x - this.roverGroup.position.x;
      const dz = this.roverTargetPos.z - this.roverGroup.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= 0.85 || this.roverMoveElapsed >= 3.8) {
        this.roverGroup.position.x = this.roverTargetPos.x;
        this.roverGroup.position.z = this.roverTargetPos.z;
        this.clampObjectToTerrain(this.roverGroup, 0.08);
        this.roverTargetPos = null;
        this.roverMoveElapsed = 0;
        this.animationController.setRoverMoving(false);
        this.hideGroundMarker();
      } else {
        const step = Math.min(dist, 14.0 * deltaTime);
        const steered = this.computeSteeredStep(
          this.roverGroup.position.x,
          this.roverGroup.position.z,
          this.roverTargetPos.x,
          this.roverTargetPos.z,
          step,
          1.1,
          'rover',
          this.roverBypassSign
        );
        this.roverBypassSign = steered.chosenSign;

        this.roverGroup.position.x = steered.x;
        this.roverGroup.position.z = steered.z;
        this.clampObjectToTerrain(this.roverGroup, 0.08);

        this.roverGroup.rotation.y = this.lerpAngle(
          this.roverGroup.rotation.y,
          steered.yaw,
          8 * deltaTime
        );
        this.animationController.setRoverMoving(true);
      }
    }

    // 3. Actualizar ejecución de tarea física activa (MOVING -> WORKING -> DONE)
    this.updateActivePhysicalTask(elapsedTime, deltaTime);

    // 4. IA Autónoma de los Especialistas NPC: Cumplen sus funciones + Interactúan entre sí y con el Jugador
    this.updateAutonomousNpcs(deltaTime);
  }

  private updateActivePhysicalTask(elapsedTime: number, deltaTime: number): void {
    if (!this.activeTask) return;

    const { request } = this.activeTask;
    const isRoverTask = request.stationId === 'rover-jezero';

    if (this.activeTask.phase === 'MOVING') {
      const stillMoving = isRoverTask
        ? this.roverTargetPos !== null
        : this.commanderTargetPos !== null;

      if (stillMoving) {
        this.emitTaskProgress(22, 'MOVING', request.titleKey, request.stationId);
        return;
      }

      // Llegó a la estación: iniciar fase WORKING con animación real y efectos 3D
      this.activeTask.phase = 'WORKING';
      this.activeTask.elapsedWorkSeconds = 0;

      if (isRoverTask && this.roverGroup) {
        this.animationController.setRoverScanning(true);
        this.workEffectGroup.position.copy(this.roverGroup.position);
      } else if (this.commanderGroup) {
        const dx = this.activeTask.lookAtPoint.x - this.commanderGroup.position.x;
        const dz = this.activeTask.lookAtPoint.z - this.commanderGroup.position.z;
        this.commanderGroup.rotation.y = Math.atan2(dx, dz);
        this.animationController.setAstronautWalking('commander', false);
        this.animationController.setAstronautPose('commander', request.pose);
        this.workEffectGroup.position.copy(this.commanderGroup.position);
      }

      this.workEffectGroup.visible = true;
    }

    if (this.activeTask.phase === 'WORKING') {
      this.activeTask.elapsedWorkSeconds += deltaTime;
      const ratio = Math.min(
        1,
        this.activeTask.elapsedWorkSeconds / Math.max(0.5, this.activeTask.totalWorkSeconds)
      );
      const totalPercent = 30 + ratio * 70;

      // Animar partículas y anillo de trabajo 3D
      this.workEffectRing.rotation.z = elapsedTime * 3.2;
      const ringScale = 0.85 + Math.sin(elapsedTime * 7.0) * 0.2;
      this.workEffectRing.scale.set(ringScale, ringScale, 1);
      this.workEffectParticles.rotation.y = elapsedTime * 2.4;
      this.workEffectParticles.position.y = (elapsedTime * 0.9) % 0.6;

      // Si está limpiando paneles solares, limpiar visualmente el polvo poco a poco en tiempo real
      if (request.pose === 'SWEEPING_PANELS') {
        const currentDust = this.animationController.getSolarPanelsDustLevel();
        this.animationController.setSolarPanelsDustLevel(
          THREE.MathUtils.lerp(currentDust, 0.02, deltaTime * 2.2)
        );
      }

      this.emitTaskProgress(totalPercent, 'WORKING', request.titleKey, request.stationId);

      if (ratio >= 1) {
        const completedRequest = this.activeTask.request;
        this.activeTask = null;
        this.workEffectGroup.visible = false;
        this.animationController.setRoverScanning(false);
        this.animationController.setAstronautPose('commander', 'IDLE');

        this.emitTaskProgress(100, 'DONE', completedRequest.titleKey, completedRequest.stationId);
        completedRequest.onComplete();
      }
    }
  }

  /**
   * Obtiene la animación de especialidad que realiza cada NPC según la estación donde se encuentra
   */
  private getSpecialistWorkPoseForNpc(npc: NpcAutonomousAgent): AstronautPoseState {
    if (npc.roleKey === 'ENGINEER') {
      // El Ingeniero alterna entre limpiar paneles solares y reparar tuberías del reciclador
      return npc.currentWaypointIndex % 2 === 0 ? 'SWEEPING_PANELS' : 'REPAIRING_PIPES';
    }
    if (npc.roleKey === 'SCIENTIST') {
      // La Científica alterna entre cuidar plantas del invernadero y escanear muestras/clima
      return npc.currentWaypointIndex % 2 === 0 ? 'WATERING_CROPS' : 'SCANNING_ROCKS';
    }
    // El Médico revisa el escudo del hábitat y el soporte vital de la tripulación
    return 'SCANNING_ROCKS';
  }

  private updateAutonomousNpcs(deltaTime: number): void {
    let nearestGreetingNpc: NpcAutonomousAgent | null = null;
    let nearestGreetingDist = Infinity;

    for (const npc of this.npcAgents) {
      if (npc.socialCooldown > 0) {
        npc.socialCooldown = Math.max(0, npc.socialCooldown - deltaTime);
      }

      // Prioridad 0: Si el NPC fue llamado a asistir al jugador en una estación activa
      if (npc.state === 'ASSISTING_PLAYER' && npc.assistTarget) {
        npc.stateTimer -= deltaTime;
        const dx = npc.assistTarget.x - npc.group.position.x;
        const dz = npc.assistTarget.y - npc.group.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.45) {
          const step = Math.min(dist, 4.6 * deltaTime);
          const steered = this.computeSteeredStep(
            npc.group.position.x,
            npc.group.position.z,
            npc.assistTarget.x,
            npc.assistTarget.y,
            step,
            0.4,
            npc.id,
            1
          );
          npc.group.position.x = steered.x;
          npc.group.position.z = steered.z;
          this.clampObjectToTerrain(npc.group, 0.05);
          npc.group.rotation.y = this.lerpAngle(npc.group.rotation.y, steered.yaw, 9 * deltaTime);
          this.animationController.setAstronautWalking(npc.id, true);
          this.animationController.setAstronautPose(npc.id, 'IDLE');
        } else {
          this.animationController.setAstronautWalking(npc.id, false);
          this.animationController.setAstronautPose(npc.id, npc.assistPose ?? 'WORKING');
        }

        if (npc.stateTimer <= 0) {
          npc.state = 'WALKING';
          npc.assistTarget = undefined;
        }
        continue;
      }

      // A. Prioridad 1: Si el Astronauta Principal se acerca a <= 3.8m, el NPC se detiene, lo mira y lo saluda
      if (this.commanderGroup) {
        const dxPlayer = this.commanderGroup.position.x - npc.group.position.x;
        const dzPlayer = this.commanderGroup.position.z - npc.group.position.z;
        const distToPlayer = Math.hypot(dxPlayer, dzPlayer);

        if (distToPlayer <= 3.8) {
          npc.state = 'GREETING_PLAYER';
          npc.stateTimer = 1.5;
          if (distToPlayer < nearestGreetingDist) {
            nearestGreetingDist = distToPlayer;
            nearestGreetingNpc = npc;
          }

          const angleToPlayer = Math.atan2(dxPlayer, dzPlayer);
          npc.group.rotation.y = this.lerpAngle(npc.group.rotation.y, angleToPlayer, 8 * deltaTime);
          this.animationController.setAstronautWalking(npc.id, false);
          this.animationController.setAstronautPose(npc.id, 'WAVING');
          this.clampObjectToTerrain(npc.group, 0.05);
          continue;
        }
      }

      // B. Prioridad 2: Interacción social entre dos NPCs cuando se cruzan cerca (<= 3.2m)
      if (npc.state === 'WALKING' && npc.socialCooldown <= 0) {
        const otherNpc = this.npcAgents.find(
          (other) =>
            other.id !== npc.id &&
            other.socialCooldown <= 0 &&
            (other.state === 'WALKING' || other.state === 'WORKING') &&
            Math.hypot(
              other.group.position.x - npc.group.position.x,
              other.group.position.z - npc.group.position.z
            ) <= 3.2
        );

        if (otherNpc) {
          npc.state = 'TALKING_NPC';
          npc.stateTimer = 4.0;
          npc.socialCooldown = 14.0;
          npc.partnerId = otherNpc.id;

          otherNpc.state = 'TALKING_NPC';
          otherNpc.stateTimer = 4.0;
          otherNpc.socialCooldown = 14.0;
          otherNpc.partnerId = npc.id;
        }
      }

      // C. Ejecutar estado actual del NPC
      if (npc.state === 'TALKING_NPC') {
        npc.stateTimer -= deltaTime;
        this.animationController.setAstronautWalking(npc.id, false);
        this.animationController.setAstronautPose(npc.id, 'TALKING');

        const partner = this.npcAgents.find((o) => o.id === npc.partnerId);
        if (partner) {
          const dx = partner.group.position.x - npc.group.position.x;
          const dz = partner.group.position.z - npc.group.position.z;
          npc.group.rotation.y = this.lerpAngle(
            npc.group.rotation.y,
            Math.atan2(dx, dz),
            8 * deltaTime
          );
        }

        if (npc.stateTimer <= 0) {
          npc.state = 'WALKING';
          npc.currentWaypointIndex = (npc.currentWaypointIndex + 1) % npc.waypoints.length;
        }
        continue;
      }

      if (npc.state === 'WORKING' || npc.state === 'GREETING_PLAYER') {
        npc.stateTimer -= deltaTime;
        this.animationController.setAstronautWalking(npc.id, false);
        this.animationController.setAstronautPose(npc.id, this.getSpecialistWorkPoseForNpc(npc));

        if (npc.stateTimer <= 0) {
          npc.state = 'WALKING';
          npc.currentWaypointIndex = (npc.currentWaypointIndex + 1) % npc.waypoints.length;
        }
        continue;
      }

      // Estado WALKING: Patrullar hacia la siguiente estación de su especialidad
      const targetWp = npc.waypoints[npc.currentWaypointIndex];
      const dx = targetWp.x - npc.group.position.x;
      const dz = targetWp.y - npc.group.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= 0.45) {
        npc.state = 'WORKING';
        npc.stateTimer = 5.0 + Math.random() * 3.0;
        this.animationController.setAstronautWalking(npc.id, false);
        this.animationController.setAstronautPose(npc.id, this.getSpecialistWorkPoseForNpc(npc));
      } else {
        const speed = 2.4;
        const step = Math.min(dist, speed * deltaTime);
        const steered = this.computeSteeredStep(
          npc.group.position.x,
          npc.group.position.z,
          targetWp.x,
          targetWp.y,
          step,
          0.4,
          npc.id,
          1
        );

        npc.group.position.x = steered.x;
        npc.group.position.z = steered.z;
        this.clampObjectToTerrain(npc.group, 0.05);

        npc.group.rotation.y = this.lerpAngle(npc.group.rotation.y, steered.yaw, 7 * deltaTime);
        this.animationController.setAstronautWalking(npc.id, true);
        this.animationController.setAstronautPose(npc.id, 'IDLE');
      }
    }

    const nextRole = nearestGreetingNpc?.roleKey ?? null;
    if (nextRole !== this.activeNearNpcRole) {
      this.activeNearNpcRole = nextRole;
      if (nearestGreetingNpc) {
        window.dispatchEvent(
          new CustomEvent('astranoesis:npc-proximity', {
            detail: {
              npcId: nearestGreetingNpc.id,
              role: nearestGreetingNpc.crewRole,
              roleKey: nearestGreetingNpc.roleKey,
              distance: nearestGreetingDist,
            },
          })
        );
      }
    }
  }

  private lerpAngle(current: number, target: number, t: number): number {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, t);
  }
}
