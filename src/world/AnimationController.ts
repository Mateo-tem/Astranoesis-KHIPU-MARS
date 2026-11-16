import * as THREE from 'three';
import { BLENDER_NODES } from '@/core/constants';

export type AstronautPoseState =
  | 'IDLE'
  | 'WORKING'
  | 'WAVING'
  | 'TALKING'
  | 'SWEEPING_PANELS'
  | 'REPAIRING_PIPES'
  | 'WATERING_CROPS'
  | 'SCANNING_ROCKS';

export interface AstronautRig {
  id: string;
  root: THREE.Group;
  hipL?: THREE.Object3D;
  hipR?: THREE.Object3D;
  shoulderL?: THREE.Object3D;
  shoulderR?: THREE.Object3D;
  headNeck?: THREE.Object3D;
  isWalking: boolean;
  walkBlend: number;
  walkCyclePhase: number;
  poseState: AstronautPoseState;
  phaseOffset: number;
}

export class AnimationController {
  private astronauts: AstronautRig[] = [];
  private chaskiAntennaDish: THREE.Object3D | null = null;
  private medaWindSensor: THREE.Object3D | null = null;
  private roverMastPivot: THREE.Object3D | null = null;
  private roverArmPivot: THREE.Object3D | null = null;
  private roverWheels: THREE.Object3D[] = [];
  private isRoverMoving = false;
  private isRoverScanning = false;

  private solarCellMaterials: Set<THREE.MeshStandardMaterial> = new Set();
  private recyclerBeaconMesh: THREE.Mesh | null = null;
  private recyclerBeaconMaterial: THREE.MeshStandardMaterial | null = null;
  private recyclerPointLight: THREE.PointLight | null = null;

  private isRecyclerBroken = false;
  private currentDustFactor = 0;

  // Colores exactos especificados para las celdas solares (Mat_Celda_Solar)
  private readonly cleanSolarColor = new THREE.Color(0.03, 0.12, 0.38);
  private readonly dustySolarColor = new THREE.Color(0.58, 0.25, 0.12);

  // Colores para la baliza Recycler_Status_Beacon (Evento B)
  private readonly nominalBeaconColor = new THREE.Color(0x10b981);
  private readonly alertBeaconColor = new THREE.Color(0xff1e1e);

  /**
   * Registra el hábitat Tambo Alfa para animar la antena Chaski_Antenna_Dish en bucle
   */
  public registerTamboAlfa(tamboRoot: THREE.Object3D): void {
    const antenna = tamboRoot.getObjectByName(BLENDER_NODES.TAMBO_ALFA.ANTENNA_DISH);
    if (antenna) {
      this.chaskiAntennaDish = antenna;
    }
  }

  /**
   * Registra sensores ambientales del terreno y las 6 ruedas + pivotes del Rover Perseverance
   */
  public registerEnvironmentNodes(terrainRoot: THREE.Object3D, roverRoot: THREE.Object3D): void {
    const windSensor = terrainRoot.getObjectByName('MEDA_Wind_Sensor');
    if (windSensor) {
      this.medaWindSensor = windSensor;
    }

    const mastPivot = roverRoot.getObjectByName(BLENDER_NODES.MARS_ROVER.MAST_PIVOT);
    if (mastPivot) {
      this.roverMastPivot = mastPivot;
    }

    const armPivot = roverRoot.getObjectByName(BLENDER_NODES.MARS_ROVER.ARM_PIVOT);
    if (armPivot) {
      this.roverArmPivot = armPivot;
    }

    this.roverWheels = [];
    for (const wheelName of BLENDER_NODES.MARS_ROVER.WHEELS) {
      const wheelObj = roverRoot.getObjectByName(wheelName);
      if (wheelObj) {
        this.roverWheels.push(wheelObj);
      }
    }
  }

  /**
   * Activa o desactiva la rotación de las 6 ruedas del Rover durante desplazamientos
   */
  public setRoverMoving(isMoving: boolean): void {
    this.isRoverMoving = isMoving;
  }

  /**
   * Activa o desactiva la animación del brazo robótico del Rover al extraer muestras/hielo
   */
  public setRoverScanning(isScanning: boolean): void {
    this.isRoverScanning = isScanning;
  }

  /**
   * Registra una matriz de paneles solares (Este u Oeste) y extrae los materiales de Solar_Cells_Surface_01..03
   */
  public registerSolarPanelArray(solarArrayRoot: THREE.Object3D): void {
    for (const surfaceName of BLENDER_NODES.SOLAR_ARRAY.SURFACES) {
      const surfaceObj = solarArrayRoot.getObjectByName(surfaceName);
      if (surfaceObj) {
        surfaceObj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((mat) => {
              if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                this.solarCellMaterials.add(mat as THREE.MeshStandardMaterial);
              }
            });
          }
        });
      }
    }

    solarArrayRoot.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (
            mat &&
            mat.name === BLENDER_NODES.SOLAR_ARRAY.MATERIAL &&
            (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial
          ) {
            this.solarCellMaterials.add(mat as THREE.MeshStandardMaterial);
          }
        });
      }
    });

    this.setSolarPanelsDustLevel(this.currentDustFactor);
  }

  /**
   * Registra el módulo de equipamiento externo y configura la baliza Recycler_Status_Beacon
   */
  public registerExternalEquipment(equipmentRoot: THREE.Object3D): void {
    const beaconNode = equipmentRoot.getObjectByName(BLENDER_NODES.EXTERNAL_EQUIPMENT.RECYCLER_BEACON);
    if (!beaconNode) return;

    beaconNode.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !this.recyclerBeaconMesh) {
        const mesh = child as THREE.Mesh;
        this.recyclerBeaconMesh = mesh;
        const clonedMat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.material = clonedMat;
        this.recyclerBeaconMaterial = clonedMat;
      }
    });

    if (!this.recyclerPointLight) {
      this.recyclerPointLight = new THREE.PointLight(0x10b981, 0.8, 5);
      this.recyclerPointLight.position.set(0, 0.25, 0);
      beaconNode.add(this.recyclerPointLight);
    }

    this.setRecyclerAlert(this.isRecyclerBroken);
  }

  /**
   * Registra una instancia de astronauta xEMU con sus pivotes articulares
   */
  public registerAstronaut(
    id: string,
    astronautRoot: THREE.Group,
    isWalking = false,
    phaseOffset = 0
  ): AstronautRig {
    const rig: AstronautRig = {
      id,
      root: astronautRoot,
      hipL: astronautRoot.getObjectByName(BLENDER_NODES.ASTRONAUT.PIVOTS.HIP_L),
      hipR: astronautRoot.getObjectByName(BLENDER_NODES.ASTRONAUT.PIVOTS.HIP_R),
      shoulderL: astronautRoot.getObjectByName(BLENDER_NODES.ASTRONAUT.PIVOTS.SHOULDER_L),
      shoulderR: astronautRoot.getObjectByName(BLENDER_NODES.ASTRONAUT.PIVOTS.SHOULDER_R),
      headNeck: astronautRoot.getObjectByName(BLENDER_NODES.ASTRONAUT.PIVOTS.HEAD_NECK),
      isWalking,
      walkBlend: isWalking ? 1 : 0,
      walkCyclePhase: phaseOffset,
      poseState: 'IDLE',
      phaseOffset,
    };

    this.astronauts.push(rig);
    return rig;
  }

  /**
   * Activa o desactiva el estado de caminata de un astronauta por su ID
   */
  public setAstronautWalking(id: string, isWalking: boolean): void {
    const rig = this.astronauts.find((a) => a.id === id);
    if (rig) {
      rig.isWalking = isWalking;
    }
  }

  /**
   * Define la pose expresiva cuando el astronauta está detenido o realizando una tarea real
   */
  public setAstronautPose(id: string, poseState: AstronautPoseState): void {
    const rig = this.astronauts.find((a) => a.id === id);
    if (rig) {
      rig.poseState = poseState;
    }
  }

  /**
   * Interpola el color de Solar_Cells_Surface_01..03 entre azul (0.03, 0.12, 0.38)
   * y marrón polvo (0.58, 0.25, 0.12) según la opacidad atmosférica (tau / dustFactor)
   */
  public setSolarPanelsDustLevel(dustFactor: number): void {
    const clamped = THREE.MathUtils.clamp(dustFactor, 0, 1);
    this.currentDustFactor = clamped;

    this.solarCellMaterials.forEach((mat) => {
      mat.color.lerpColors(this.cleanSolarColor, this.dustySolarColor, clamped);
      mat.roughness = THREE.MathUtils.lerp(0.22, 0.88, clamped);
      mat.metalness = THREE.MathUtils.lerp(0.65, 0.15, clamped);
      mat.needsUpdate = true;
    });
  }

  public getSolarPanelsDustLevel(): number {
    return this.currentDustFactor;
  }

  /**
   * Activa o desactiva el parpadeo en rojo de Recycler_Status_Beacon en external-equipment.glb (Evento B)
   */
  public setRecyclerAlert(isBroken: boolean): void {
    this.isRecyclerBroken = isBroken;

    if (!this.recyclerBeaconMaterial) return;

    if (!isBroken) {
      this.recyclerBeaconMaterial.color.copy(this.nominalBeaconColor);
      this.recyclerBeaconMaterial.emissive.copy(this.nominalBeaconColor);
      this.recyclerBeaconMaterial.emissiveIntensity = 0.9;
      if (this.recyclerPointLight) {
        this.recyclerPointLight.color.copy(this.nominalBeaconColor);
        this.recyclerPointLight.intensity = 0.6;
      }
    }
  }

  public getRecyclerAlertState(): boolean {
    return this.isRecyclerBroken;
  }

  /**
   * Actualización frame a frame de todas las animaciones procedurales
   */
  public update(elapsedTime: number, deltaTime: number): void {
    // 1. Rotación suave en bucle de Chaski_Antenna_Dish en Tambo Alfa
    if (this.chaskiAntennaDish) {
      this.chaskiAntennaDish.rotation.y += deltaTime * 0.55;
    }

    // 2. Anemómetro MEDA y mástil/brazo/ruedas del Rover
    if (this.medaWindSensor) {
      this.medaWindSensor.rotation.y += deltaTime * 2.2;
    }
    if (this.roverMastPivot) {
      this.roverMastPivot.rotation.y = this.isRoverScanning
        ? Math.sin(elapsedTime * 2.8) * 0.6
        : Math.sin(elapsedTime * 0.45) * 0.35;
    }
    if (this.roverArmPivot) {
      if (this.isRoverScanning) {
        this.roverArmPivot.rotation.x = -0.65 + Math.sin(elapsedTime * 6.0) * 0.25;
      } else {
        this.roverArmPivot.rotation.x = this.isRoverMoving
          ? -0.25
          : Math.sin(elapsedTime * 1.1) * 0.12;
      }
    }
    if (this.isRoverMoving) {
      for (const wheel of this.roverWheels) {
        wheel.rotation.x += deltaTime * 6.0;
      }
    }

    // 3. Animación procedural fluida de astronaut-character.glb:
    //    - Solo camina cuando rig.isWalking === true (con suavizado damp).
    //    - Cuando realiza una misión (SWEEPING_PANELS, REPAIRING_PIPES, WATERING_CROPS, SCANNING_ROCKS),
    //      ejecuta movimientos físicos claros con ambos brazos, torso y cabeza.
    for (const rig of this.astronauts) {
      const targetBlend = rig.isWalking ? 1.0 : 0.0;
      rig.walkBlend = THREE.MathUtils.damp(rig.walkBlend, targetBlend, 11.0, deltaTime);

      if (rig.walkBlend > 0.01) {
        rig.walkCyclePhase += deltaTime * 8.4;
      }

      const walkWave = Math.sin(rig.walkCyclePhase);
      const legAmplitude = 0.52 * rig.walkBlend;
      const idleFactor = 1.0 - rig.walkBlend;
      const t = elapsedTime + rig.phaseOffset;

      // Piernas: zancada al caminar + ligera flexión al trabajar/reparar
      let crouchLegOffset = 0;
      if (!rig.isWalking && (rig.poseState === 'REPAIRING_PIPES' || rig.poseState === 'WATERING_CROPS')) {
        crouchLegOffset = 0.14 + Math.sin(t * 3.2) * 0.04;
      }

      if (rig.hipL) {
        rig.hipL.rotation.x = walkWave * legAmplitude - crouchLegOffset * idleFactor;
      }
      if (rig.hipR) {
        rig.hipR.rotation.x = -walkWave * legAmplitude + crouchLegOffset * 0.5 * idleFactor;
      }

      // Brazos: balanceo natural al caminar + animaciones específicas de tarea
      let idleShoulderLX = Math.sin(t * 1.6) * 0.04;
      let idleShoulderRX = -Math.sin(t * 1.6) * 0.04;
      let idleShoulderLZ = 0;
      let idleShoulderRZ = 0;

      if (rig.poseState === 'SWEEPING_PANELS') {
        // Barrido enérgico con ambos brazos limpiando el polvo de los paneles solares
        const sweepWave = Math.sin(t * 6.5);
        idleShoulderRX = -0.95 + Math.cos(t * 6.5) * 0.22;
        idleShoulderLX = -0.85 + Math.sin(t * 6.5) * 0.22;
        idleShoulderRZ = sweepWave * 0.38;
        idleShoulderLZ = sweepWave * 0.32;
      } else if (rig.poseState === 'REPAIRING_PIPES') {
        // Giro de llave inglesa / soldadura en tuberías del reciclador
        idleShoulderRX = -1.05 + Math.sin(t * 9.0) * 0.28;
        idleShoulderRZ = Math.cos(t * 9.0) * 0.24;
        idleShoulderLX = -0.75 + Math.sin(t * 3.0) * 0.08;
      } else if (rig.poseState === 'WATERING_CROPS') {
        // Riego y cuidado de plantas del invernadero en abanico suave
        const sprayArc = Math.sin(t * 4.0);
        idleShoulderRX = -0.82 + Math.sin(t * 8.0) * 0.1;
        idleShoulderLX = -0.68 + Math.cos(t * 4.0) * 0.12;
        idleShoulderRZ = sprayArc * 0.28;
        idleShoulderLZ = -sprayArc * 0.15;
      } else if (rig.poseState === 'SCANNING_ROCKS' || rig.poseState === 'WORKING') {
        // Escaneo científico e inspección técnica de instrumentos
        idleShoulderRX = -0.78 + Math.sin(t * 3.8) * 0.16;
        idleShoulderLX = -0.42 + Math.cos(t * 2.8) * 0.1;
        idleShoulderRZ = Math.sin(t * 2.5) * 0.12;
      } else if (rig.poseState === 'WAVING') {
        idleShoulderRX = -1.45 + Math.sin(t * 7.0) * 0.28;
        idleShoulderRZ = Math.sin(t * 7.0) * 0.22;
        idleShoulderLX = Math.sin(t * 2.0) * 0.05;
      } else if (rig.poseState === 'TALKING') {
        idleShoulderRX = -0.45 + Math.sin(t * 4.5) * 0.22;
        idleShoulderLX = -0.38 + Math.cos(t * 3.8) * 0.18;
      }

      if (rig.shoulderL) {
        rig.shoulderL.rotation.x =
          -walkWave * (legAmplitude * 0.82) + idleShoulderLX * idleFactor;
        rig.shoulderL.rotation.z = THREE.MathUtils.damp(
          rig.shoulderL.rotation.z,
          idleShoulderLZ * idleFactor,
          9.0,
          deltaTime
        );
      }
      if (rig.shoulderR) {
        rig.shoulderR.rotation.x =
          walkWave * (legAmplitude * 0.82) + idleShoulderRX * idleFactor;
        rig.shoulderR.rotation.z = THREE.MathUtils.damp(
          rig.shoulderR.rotation.z,
          idleShoulderRZ * idleFactor,
          9.0,
          deltaTime
        );
      }

      if (rig.headNeck) {
        let headYaw = Math.sin(t * 1.1) * 0.15;
        let headPitch = 0;

        if (rig.poseState === 'SWEEPING_PANELS') {
          headYaw = Math.sin(t * 6.5) * 0.22;
          headPitch = 0.22;
        } else if (rig.poseState === 'REPAIRING_PIPES') {
          headYaw = Math.sin(t * 4.0) * 0.1;
          headPitch = 0.28 + Math.sin(t * 9.0) * 0.05;
        } else if (rig.poseState === 'WATERING_CROPS') {
          headYaw = Math.sin(t * 4.0) * 0.25;
          headPitch = 0.18;
        } else if (rig.poseState === 'SCANNING_ROCKS' || rig.poseState === 'WORKING') {
          headYaw = Math.sin(t * 2.2) * 0.24;
          headPitch = 0.15 + Math.sin(t * 2.4) * 0.06;
        } else if (rig.poseState === 'TALKING' || rig.poseState === 'WAVING') {
          headYaw = Math.sin(t * 2.8) * 0.14;
          headPitch = Math.sin(t * 5.0) * 0.08;
        }

        rig.headNeck.rotation.y = THREE.MathUtils.damp(
          rig.headNeck.rotation.y,
          headYaw,
          8.0,
          deltaTime
        );
        rig.headNeck.rotation.x = THREE.MathUtils.damp(
          rig.headNeck.rotation.x,
          headPitch,
          8.0,
          deltaTime
        );
      }
    }

    // 4. Parpadeo rojo de emergencia en Recycler_Status_Beacon (Evento B)
    if (this.isRecyclerBroken && this.recyclerBeaconMaterial) {
      const pulse = (Math.sin(elapsedTime * 10) + 1) * 0.5;
      this.recyclerBeaconMaterial.color.copy(this.alertBeaconColor);
      this.recyclerBeaconMaterial.emissive.copy(this.alertBeaconColor);
      this.recyclerBeaconMaterial.emissiveIntensity = 0.4 + pulse * 2.6;

      if (this.recyclerPointLight) {
        this.recyclerPointLight.color.copy(this.alertBeaconColor);
        this.recyclerPointLight.intensity = 0.3 + pulse * 2.5;
      }
    }
  }
}
