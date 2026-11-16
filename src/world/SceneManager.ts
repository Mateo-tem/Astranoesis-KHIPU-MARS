import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import { BLENDER_NODES } from '@/core/constants';
import { PlayerSpecialtyRole } from '@/core/types';
import { AssetLoader, AssetProgressCallback, LoadedMarsAssets } from './AssetLoader';
import { AnimationController } from './AnimationController';
import { InputManager, InteractiveTarget } from './InputManager';
import { PhysicalTaskRequest, QuickStationId, TouchNavigation } from './TouchNavigation';

export class SceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private clock: THREE.Clock;

  private assetLoader: AssetLoader;
  private animationController: AnimationController;
  private inputManager: InputManager;
  private touchNavigation: TouchNavigation;

  private loadedAssets: LoadedMarsAssets | null = null;
  private commanderGroup: THREE.Group | null = null;
  private commanderBadgeMaterials: THREE.MeshStandardMaterial[] = [];
  private dustParticles: THREE.Points | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientHemisphereLight: THREE.HemisphereLight | null = null;

  private animationFrameId: number | null = null;
  private boundOnResize: () => void;

  // Vista panorámica inicial de la base Tambo Alfa
  private readonly defaultCameraPosition = new THREE.Vector3(0, 18, 28);
  private readonly defaultCameraTarget = new THREE.Vector3(0, 1.2, 2);

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.assetLoader = new AssetLoader();
    this.animationController = new AnimationController();

    // 1. Escena con atmósfera marciana cálida y niebla exponencial
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc87a55);
    this.scene.fog = new THREE.FogExp2(0xc87a55, 0.0065);

    this.touchNavigation = new TouchNavigation(this.scene, this.animationController);

    // 2. Cámara con ajuste automático a relaciones de aspecto móviles (Portrait/Landscape)
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const isPortrait = height > width;
    this.camera = new THREE.PerspectiveCamera(isPortrait ? 62 : 48, width / height, 0.2, 450);
    this.camera.position.copy(this.defaultCameraPosition);

    // 3. Renderer Mobile-First de alto rendimiento
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Reglas CSS inamovibles en el <canvas> para pantallas táctiles (evitar scroll/zoom del navegador)
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.appendChild(canvas);

    // 4. OrbitControls con configuración táctil explícita
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 140;
    this.controls.target.copy(this.defaultCameraTarget);
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.update();

    // 5. InputManager unificado (Touch + Mouse + Tap-to-Move + WASD + Hotkeys K y Espacio)
    this.inputManager = new InputManager(canvas, this.camera, {
      onSelectTarget: (target) => {
        this.focusCameraOnTarget(target);
        // También acercar al Comandante si es una estación cercana a la base
        if (target.category === 'tambo-alfa') {
          this.touchNavigation.navigateToStation('tambo-alfa');
        } else if (
          target.category === 'solar-array-east' ||
          target.category === 'solar-array-west'
        ) {
          this.touchNavigation.navigateToStation('solar-panels');
        } else if (target.category === 'water-recycler') {
          this.touchNavigation.navigateToStation('water-recycler');
        } else if (target.category === 'mars-rover') {
          this.touchNavigation.navigateToStation('rover-bay');
        } else if (target.category === 'science-node') {
          this.touchNavigation.moveRoverTo(target.focusPoint);
        }
      },
      onTapTerrain: (worldPoint) => {
        const result = this.touchNavigation.handleTerrainTap(worldPoint);
        window.dispatchEvent(
          new CustomEvent('astranoesis:terrain-tapped', { detail: result })
        );
      },
      onResetCamera: () => this.resetCameraView(),
    });

    // 6. Iluminación solar marciana y partículas atmosféricas
    this.setupLighting();
    this.setupAtmosphericDustParticles();

    // 7. Manejador de redimensionamiento y rotación de pantalla (Portrait / Landscape)
    this.boundOnResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundOnResize);
    window.addEventListener('orientationchange', this.boundOnResize);
  }

  private setupLighting(): void {
    this.ambientHemisphereLight = new THREE.HemisphereLight(0xffdfc4, 0x6e3520, 1.15);
    this.scene.add(this.ambientHemisphereLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1e0, 2.4);
    this.sunLight.position.set(42, 58, 32);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 180;

    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;

    this.scene.add(this.sunLight);
  }

  private setupAtmosphericDustParticles(): void {
    const count = 450;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 18 + 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xf4b693,
      size: 0.22,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.dustParticles = new THREE.Points(geometry, material);
    this.scene.add(this.dustParticles);
  }

  /**
   * Carga y ensambla los 7 modelos GLB en sus coordenadas exactas de misión
   */
  public async initWorld(onProgress?: AssetProgressCallback): Promise<void> {
    this.loadedAssets = await this.assetLoader.loadAllMissionAssets(onProgress);

    // 1. jezero-terrain.glb en (0, 0, 0) con recepción de sombras, soporte Tap-to-Move y muestreo de altura
    const terrain = this.loadedAssets.terrain;
    terrain.position.set(0, 0, 0);
    AssetLoader.configureShadows(terrain, { castShadow: false, receiveShadow: true });
    this.scene.add(terrain);
    this.inputManager.registerTerrainSurface(terrain);
    this.touchNavigation.registerTerrain(terrain);

    // 2. tambo-alfa.glb en (0, groundY, 0) con rotación en bucle de Chaski_Antenna_Dish
    const tamboAlfa = this.loadedAssets.tamboAlfa;
    tamboAlfa.position.set(0, 0.15, 0);
    this.touchNavigation.clampObjectToTerrain(tamboAlfa, 0.02);
    AssetLoader.configureShadows(tamboAlfa, { castShadow: true, receiveShadow: true });
    this.scene.add(tamboAlfa);
    this.animationController.registerTamboAlfa(tamboAlfa);
    this.createInteractiveHitbox({
      id: 'tambo-alfa-core',
      category: 'tambo-alfa',
      titleKey: 'targets.tamboAlfa.title',
      subtitleKey: 'targets.tamboAlfa.subtitle',
      position: new THREE.Vector3(0, 2.2, 0),
      size: new THREE.Vector3(11.5, 5.5, 11.5),
      focusPoint: new THREE.Vector3(0, 1.8, 0),
      cameraOffset: new THREE.Vector3(0, 8.5, 15.5),
    });

    // 3. solar-panels-array.glb instanciado dos veces: Este (14, groundY, -2) y Oeste (-14, groundY, -2)
    const { clone: solarEast } = AssetLoader.cloneWithUniqueMaterial(
      this.loadedAssets.solarPanelsTemplate,
      BLENDER_NODES.SOLAR_ARRAY.MATERIAL
    );
    solarEast.position.set(14, 0.15, -2);
    this.touchNavigation.clampObjectToTerrain(solarEast, 0.02);
    AssetLoader.configureShadows(solarEast, { castShadow: true, receiveShadow: true });
    this.scene.add(solarEast);
    this.animationController.registerSolarPanelArray(solarEast);
    this.createInteractiveHitbox({
      id: 'solar-array-east',
      category: 'solar-array-east',
      titleKey: 'targets.solarEast.title',
      subtitleKey: 'targets.solarEast.subtitle',
      position: new THREE.Vector3(14, 1.8, -2),
      size: new THREE.Vector3(8.5, 4.2, 7.5),
      focusPoint: new THREE.Vector3(14, 1.2, -2),
      cameraOffset: new THREE.Vector3(6, 5.5, 10.5),
    });

    const { clone: solarWest } = AssetLoader.cloneWithUniqueMaterial(
      this.loadedAssets.solarPanelsTemplate,
      BLENDER_NODES.SOLAR_ARRAY.MATERIAL
    );
    solarWest.position.set(-14, 0.15, -2);
    this.touchNavigation.clampObjectToTerrain(solarWest, 0.02);
    AssetLoader.configureShadows(solarWest, { castShadow: true, receiveShadow: true });
    this.scene.add(solarWest);
    this.animationController.registerSolarPanelArray(solarWest);
    this.createInteractiveHitbox({
      id: 'solar-array-west',
      category: 'solar-array-west',
      titleKey: 'targets.solarWest.title',
      subtitleKey: 'targets.solarWest.subtitle',
      position: new THREE.Vector3(-14, 1.8, -2),
      size: new THREE.Vector3(8.5, 4.2, 7.5),
      focusPoint: new THREE.Vector3(-14, 1.2, -2),
      cameraOffset: new THREE.Vector3(-6, 5.5, 10.5),
    });

    // 4. mars-rover.glb en la bahía Sur (0, groundY, 12)
    const marsRover = this.loadedAssets.marsRover;
    marsRover.position.set(0, 0.15, 12);
    this.touchNavigation.clampObjectToTerrain(marsRover, 0.08);
    AssetLoader.configureShadows(marsRover, { castShadow: true, receiveShadow: true });
    this.scene.add(marsRover);
    this.animationController.registerEnvironmentNodes(terrain, marsRover);
    this.createInteractiveHitbox({
      id: 'mars-rover-south',
      category: 'mars-rover',
      titleKey: 'targets.marsRover.title',
      subtitleKey: 'targets.marsRover.subtitle',
      position: new THREE.Vector3(0, 1.5, 12),
      size: new THREE.Vector3(5.8, 3.8, 6.2),
      focusPoint: new THREE.Vector3(0, 1.0, 12),
      cameraOffset: new THREE.Vector3(4.5, 4.0, 8.5),
    });

    // 5. external-equipment.glb junto a la esclusa de Tambo Alfa (5, groundY, 4)
    const externalEquipment = this.loadedAssets.externalEquipment;
    externalEquipment.position.set(5, 0.15, 4);
    this.touchNavigation.clampObjectToTerrain(externalEquipment, 0.02);
    AssetLoader.configureShadows(externalEquipment, { castShadow: true, receiveShadow: true });
    this.scene.add(externalEquipment);
    this.animationController.registerExternalEquipment(externalEquipment);
    this.createInteractiveHitbox({
      id: 'water-recycler-skid',
      category: 'water-recycler',
      titleKey: 'targets.waterRecycler.title',
      subtitleKey: 'targets.waterRecycler.subtitle',
      position: new THREE.Vector3(5, 1.4, 4),
      size: new THREE.Vector3(8.2, 3.6, 4.5),
      focusPoint: new THREE.Vector3(5, 1.1, 4),
      cameraOffset: new THREE.Vector3(3.5, 3.8, 7.8),
    });

    // 6. astronaut-character.glb: Personaje Principal (Jugador) + 3 Especialistas NPC autónomos explorando Marte
    this.spawnCrewMembers(this.loadedAssets.astronautTemplate);

    if (this.commanderGroup) {
      this.touchNavigation.registerUnits(this.commanderGroup, marsRover);
    }

    // 7. Hitboxes para Estación Meteorológica MEDA y los 4 Nodos Científicos Minerales
    this.setupTerrainInteractiveNodes(terrain);

    // Iniciar el bucle de renderizado y animación
    this.startLoop();
  }

  private spawnCrewMembers(astronautTemplate: THREE.Group): void {
    // A. Personaje Principal (Jugador) frente a la esclusa de Tambo Alfa en (0, groundY, 6.8)
    const { clone: commander, clonedMaterials: cmdMats } = AssetLoader.cloneWithUniqueMaterial(
      astronautTemplate,
      BLENDER_NODES.ASTRONAUT.ROLE_MATERIAL
    );
    this.commanderBadgeMaterials = cmdMats;
    cmdMats.forEach((mat) => {
      mat.color.setRGB(0.98, 0.45, 0.09);
      mat.needsUpdate = true;
    });
    commander.position.set(0, 0.15, 6.8);
    this.touchNavigation.clampObjectToTerrain(commander, 0.05);
    AssetLoader.configureShadows(commander, { castShadow: true, receiveShadow: true });
    this.scene.add(commander);
    this.commanderGroup = commander;
    this.animationController.registerAstronaut('commander', commander, false, 0);

    // B. Science Officer (NPC Azul: 0.1, 0.5, 0.9) explorando Rover, Biodomo y Estación MEDA
    const { clone: scienceOfficer, clonedMaterials: sciMats } = AssetLoader.cloneWithUniqueMaterial(
      astronautTemplate,
      BLENDER_NODES.ASTRONAUT.ROLE_MATERIAL
    );
    sciMats.forEach((mat) => {
      mat.color.setRGB(0.1, 0.5, 0.9);
      mat.needsUpdate = true;
    });
    scienceOfficer.position.set(-3.4, 0.15, 10.5);
    scienceOfficer.rotation.y = Math.PI * 0.25;
    AssetLoader.configureShadows(scienceOfficer, { castShadow: true, receiveShadow: true });
    this.scene.add(scienceOfficer);
    this.animationController.registerAstronaut('science-officer', scienceOfficer, false, 1.5);
    this.touchNavigation.registerAutonomousNpc('science-officer', 'SCIENTIST', scienceOfficer, [
      new THREE.Vector2(-3.4, 10.5),
      new THREE.Vector2(-7.8, 6.5),
      new THREE.Vector2(14.5, 11.2),
      new THREE.Vector2(3.5, 8.8),
    ]);

    // C. Flight Engineer (NPC Amarillo: 0.95, 0.75, 0.1) explorando Paneles Solares y Reciclador
    const { clone: flightEngineer, clonedMaterials: engMats } = AssetLoader.cloneWithUniqueMaterial(
      astronautTemplate,
      BLENDER_NODES.ASTRONAUT.ROLE_MATERIAL
    );
    engMats.forEach((mat) => {
      mat.color.setRGB(0.95, 0.75, 0.1);
      mat.needsUpdate = true;
    });
    flightEngineer.position.set(11.4, 0.15, -5.2);
    flightEngineer.rotation.y = Math.PI * 0.45;
    AssetLoader.configureShadows(flightEngineer, { castShadow: true, receiveShadow: true });
    this.scene.add(flightEngineer);
    this.animationController.registerAstronaut('flight-engineer', flightEngineer, false, 3.1);
    this.touchNavigation.registerAutonomousNpc('flight-engineer', 'ENGINEER', flightEngineer, [
      new THREE.Vector2(11.4, -5.2),
      new THREE.Vector2(7.2, 6.4),
      new THREE.Vector2(-10.8, -4.8),
      new THREE.Vector2(3.4, 8.6),
    ]);

    // D. Medic Officer (NPC Coral/Blanco: 0.92, 0.22, 0.28) explorando Hábitat y Soporte Vital
    const { clone: medicOfficer, clonedMaterials: medMats } = AssetLoader.cloneWithUniqueMaterial(
      astronautTemplate,
      BLENDER_NODES.ASTRONAUT.ROLE_MATERIAL
    );
    medMats.forEach((mat) => {
      mat.color.setRGB(0.92, 0.22, 0.28);
      mat.needsUpdate = true;
    });
    medicOfficer.position.set(-6.5, 0.15, 4.2);
    medicOfficer.rotation.y = -Math.PI * 0.3;
    AssetLoader.configureShadows(medicOfficer, { castShadow: true, receiveShadow: true });
    this.scene.add(medicOfficer);
    this.animationController.registerAstronaut('medic-officer', medicOfficer, false, 4.6);
    this.touchNavigation.registerAutonomousNpc('medic-officer', 'MEDIC', medicOfficer, [
      new THREE.Vector2(-6.5, 4.2),
      new THREE.Vector2(1.5, 8.2),
      new THREE.Vector2(7.8, 3.2),
      new THREE.Vector2(-2.5, 7.8),
    ]);
  }

  /**
   * Actualiza el color de insignia del Astronauta Principal según el rol elegido por el niño
   */
  public setPlayerRoleBadge(role: PlayerSpecialtyRole): void {
    const colorMap: Record<PlayerSpecialtyRole, [number, number, number]> = {
      COMMANDER: [0.98, 0.45, 0.09], // Naranja
      ENGINEER: [0.95, 0.75, 0.1],   // Amarillo
      MEDIC: [0.92, 0.22, 0.28],     // Rojo Médico
      SCIENTIST: [0.1, 0.65, 0.88],  // Azul Científico
    };
    const [r, g, b] = colorMap[role];
    this.commanderBadgeMaterials.forEach((mat) => {
      mat.color.setRGB(r, g, b);
      mat.needsUpdate = true;
    });
  }

  private setupTerrainInteractiveNodes(terrain: THREE.Object3D): void {
    const medaNode = terrain.getObjectByName(BLENDER_NODES.TERRAIN.WEATHER_STATION);
    const medaWorldPos = new THREE.Vector3(18, 0.5, 14);
    if (medaNode) {
      medaNode.getWorldPosition(medaWorldPos);
    }
    this.createInteractiveHitbox({
      id: 'nasa-meda-station',
      category: 'meda-station',
      titleKey: 'targets.medaStation.title',
      subtitleKey: 'targets.medaStation.subtitle',
      position: new THREE.Vector3(medaWorldPos.x, medaWorldPos.y + 1.5, medaWorldPos.z),
      size: new THREE.Vector3(5.0, 4.5, 5.0),
      focusPoint: new THREE.Vector3(medaWorldPos.x, medaWorldPos.y + 1.2, medaWorldPos.z),
      cameraOffset: new THREE.Vector3(4.5, 4.2, 8.5),
    });

    BLENDER_NODES.TERRAIN.SCIENCE_NODES.forEach((nodeName, index) => {
      const nodeObj = terrain.getObjectByName(nodeName);
      if (nodeObj) {
        const worldPos = new THREE.Vector3();
        nodeObj.getWorldPosition(worldPos);
        this.createInteractiveHitbox({
          id: nodeName,
          category: 'science-node',
          titleKey: `targets.scienceNode${index + 1}.title`,
          subtitleKey: `targets.scienceNode${index + 1}.subtitle`,
          position: new THREE.Vector3(worldPos.x, worldPos.y + 1.6, worldPos.z),
          size: new THREE.Vector3(6.5, 4.5, 6.5),
          focusPoint: new THREE.Vector3(worldPos.x, worldPos.y + 0.8, worldPos.z),
          cameraOffset: new THREE.Vector3(5.5, 5.0, 9.5),
        });
      }
    });
  }

  private createInteractiveHitbox(config: {
    id: string;
    category: InteractiveTarget['category'];
    titleKey: string;
    subtitleKey: string;
    position: THREE.Vector3;
    size: THREE.Vector3;
    focusPoint: THREE.Vector3;
    cameraOffset: THREE.Vector3;
  }): void {
    const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const hitboxMesh = new THREE.Mesh(geometry, material);
    hitboxMesh.name = `Hitbox_${config.id}`;
    hitboxMesh.position.copy(config.position);
    this.scene.add(hitboxMesh);

    const target: InteractiveTarget = {
      id: config.id,
      category: config.category,
      titleKey: config.titleKey,
      subtitleKey: config.subtitleKey,
      hitboxMesh,
      focusPoint: config.focusPoint,
      cameraOffset: config.cameraOffset,
    };

    this.inputManager.registerInteractiveTarget(target);
  }

  /**
   * Enfoca suavemente la cámara hacia el elemento tocado/clicado usando GSAP
   */
  public focusCameraOnTarget(target: InteractiveTarget): void {
    const destinationTarget = target.focusPoint.clone();
    const destinationCameraPos = target.focusPoint.clone().add(target.cameraOffset);

    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    gsap.to(this.camera.position, {
      x: destinationCameraPos.x,
      y: Math.max(2.5, destinationCameraPos.y),
      z: destinationCameraPos.z,
      duration: 1.15,
      ease: 'power2.out',
    });

    gsap.to(this.controls.target, {
      x: destinationTarget.x,
      y: destinationTarget.y,
      z: destinationTarget.z,
      duration: 1.15,
      ease: 'power2.out',
    });
  }

  public resetCameraView(): void {
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    gsap.to(this.camera.position, {
      x: this.defaultCameraPosition.x,
      y: this.defaultCameraPosition.y,
      z: this.defaultCameraPosition.z,
      duration: 1.2,
      ease: 'power2.inOut',
    });

    gsap.to(this.controls.target, {
      x: this.defaultCameraTarget.x,
      y: this.defaultCameraTarget.y,
      z: this.defaultCameraTarget.z,
      duration: 1.2,
      ease: 'power2.inOut',
    });
  }

  /**
   * Cámara Rápida con un solo toque hacia: Base (Tambo Alfa), Paneles, Rover o Cráter Jezero
   */
  public focusQuickPreset(preset: 'base' | 'panels' | 'rover' | 'crater'): void {
    const presets: Record<
      'base' | 'panels' | 'rover' | 'crater',
      { cam: THREE.Vector3; target: THREE.Vector3 }
    > = {
      base: {
        cam: new THREE.Vector3(0, 11, 18),
        target: new THREE.Vector3(0, 1.8, 0),
      },
      panels: {
        cam: new THREE.Vector3(20, 7.5, 9),
        target: new THREE.Vector3(14, 1.2, -2),
      },
      rover: {
        cam: new THREE.Vector3(5, 5.2, 20.5),
        target: new THREE.Vector3(0, 1.0, 12),
      },
      crater: {
        cam: new THREE.Vector3(44, 14, 38),
        target: new THREE.Vector3(56, -10.5, 52),
      },
    };

    const chosen = presets[preset];
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    gsap.to(this.camera.position, {
      x: chosen.cam.x,
      y: chosen.cam.y,
      z: chosen.cam.z,
      duration: 1.15,
      ease: 'power2.out',
    });

    gsap.to(this.controls.target, {
      x: chosen.target.x,
      y: chosen.target.y,
      z: chosen.target.z,
      duration: 1.15,
      ease: 'power2.out',
    });
  }

  /**
   * Navegación rápida táctil del Astronauta o del Rover hacia una estación clave
   */
  public navigateUnitToStation(stationId: QuickStationId): void {
    const dest = this.touchNavigation.navigateToStation(stationId);
    const camOffset =
      stationId === 'rover-jezero'
        ? new THREE.Vector3(10, 9, 14)
        : new THREE.Vector3(4.5, 6.5, 11);

    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    gsap.to(this.camera.position, {
      x: dest.x + camOffset.x,
      y: Math.max(3, dest.y + camOffset.y),
      z: dest.z + camOffset.z,
      duration: 1.25,
      ease: 'power2.out',
    });

    gsap.to(this.controls.target, {
      x: dest.x,
      y: dest.y + 1.0,
      z: dest.z,
      duration: 1.25,
      ease: 'power2.out',
    });
  }

  /**
   * Ejecuta una misión física real: mueve al Astronauta (o Rover) + NPC ayudante a la estación,
   * enfoca la cámara suavemente para que el jugador vea la acción en vivo y ejecuta la animación de trabajo
   */
  public executePhysicalTask(request: PhysicalTaskRequest): void {
    const dest = this.touchNavigation.startPhysicalTask(request);
    const camOffset =
      request.stationId === 'rover-jezero'
        ? new THREE.Vector3(9, 7.5, 12)
        : new THREE.Vector3(3.8, 4.8, 8.8);

    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    gsap.to(this.camera.position, {
      x: dest.x + camOffset.x,
      y: Math.max(2.6, dest.y + camOffset.y),
      z: dest.z + camOffset.z,
      duration: 1.15,
      ease: 'power2.out',
    });

    gsap.to(this.controls.target, {
      x: dest.x,
      y: dest.y + 1.1,
      z: dest.z,
      duration: 1.15,
      ease: 'power2.out',
    });
  }

  /**
   * Coreografía cinematográfica 3D en primera persona para las 4 escenas de la Intro (Storytelling)
   */
  public playIntroSceneCamera(sceneIndex: 1 | 2 | 3 | 4): void {
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);

    if (sceneIndex === 1) {
      // Escena 1: Descenso en primera persona hacia el hábitat MARS-EF03 brillando en el cráter Jezero
      this.setAtmosphericDustLevel(0.06);
      this.animationController.setRecyclerAlert(false);
      this.camera.position.set(0, 46, 64);
      this.controls.target.set(0, 1.5, 0);

      gsap.to(this.camera.position, {
        x: 0,
        y: 8.5,
        z: 20,
        duration: 6.5,
        ease: 'power2.out',
      });
      gsap.to(this.controls.target, {
        x: 0,
        y: 1.8,
        z: 0,
        duration: 6.5,
        ease: 'power2.out',
      });
    } else if (sceneIndex === 2) {
      // Escena 2: El Incidente — Tormenta de polvo repentina, alerta roja en el módulo de carga y carrera al hábitat
      this.setAtmosphericDustLevel(0.86);
      this.animationController.setRecyclerAlert(true);
      this.touchNavigation.triggerEmergencyRushToHabitat();

      gsap.to(this.camera.position, {
        x: 9.5,
        y: 4.2,
        z: 13.5,
        duration: 2.2,
        ease: 'power2.inOut',
      });
      gsap.to(this.controls.target, {
        x: 2.2,
        y: 1.2,
        z: 4.5,
        duration: 2.2,
        ease: 'power2.inOut',
      });
    } else if (sceneIndex === 3) {
      // Escena 3: La Cuenta Regresiva (Conexión NASA-ESA) — Vista orbital del cráter y antena Chaski
      this.setAtmosphericDustLevel(0.22);
      this.animationController.setRecyclerAlert(false);

      gsap.to(this.camera.position, {
        x: -24,
        y: 28,
        z: 32,
        duration: 3.5,
        ease: 'power2.inOut',
      });
      gsap.to(this.controls.target, {
        x: 0,
        y: 2.5,
        z: 0,
        duration: 3.5,
        ease: 'power2.inOut',
      });
    } else {
      // Escena 4: Tu Misión — Los 4 astronautas frente al hábitat mientras se enciende el Khipu
      this.setAtmosphericDustLevel(0.08);
      this.animationController.setRecyclerAlert(false);

      gsap.to(this.camera.position, {
        x: 0,
        y: 4.4,
        z: 13.2,
        duration: 2.6,
        ease: 'power2.out',
      });
      gsap.to(this.controls.target, {
        x: 0,
        y: 1.4,
        z: 3.2,
        duration: 2.6,
        ease: 'power2.out',
      });
    }
  }

  /**
   * Expone el controlador de navegación táctil (Tap-to-Move y Cruceta Virtual)
   */
  public getTouchNavigation(): TouchNavigation {
    return this.touchNavigation;
  }

  public getAnimationController(): AnimationController {
    return this.animationController;
  }

  public getKhipuTrackerModel(): THREE.Group | null {
    return this.loadedAssets?.khipuTracker ?? null;
  }

  public setAtmosphericDustLevel(dustFactor: number): void {
    const clamped = THREE.MathUtils.clamp(dustFactor, 0, 1);
    this.animationController.setSolarPanelsDustLevel(clamped);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = THREE.MathUtils.lerp(0.0065, 0.022, clamped);
    }
    if (this.sunLight) {
      this.sunLight.intensity = THREE.MathUtils.lerp(2.4, 1.05, clamped);
    }
  }

  private startLoop(): void {
    if (this.animationFrameId !== null) return;

    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      const deltaTime = Math.min(this.clock.getDelta(), 0.1);
      const elapsedTime = this.clock.getElapsedTime();

      // 1. Navegación combinada por Teclado WASD (PC) o Cruceta Táctil (Móvil)
      const kbMove = this.inputManager.getMovementVector(this.camera);
      const thumbMove = this.touchNavigation.getThumbDirection();

      const activeMoveX = kbMove.isMoving ? kbMove.x : thumbMove.x;
      const activeMoveZ = kbMove.isMoving ? kbMove.z : thumbMove.z;
      const isDirectMoving = kbMove.isMoving || thumbMove.isActive;

      const isFollowingCommander =
        isDirectMoving || this.touchNavigation.isCommanderMoving();

      if (isDirectMoving && this.commanderGroup) {
        gsap.killTweensOf(this.camera.position);
        gsap.killTweensOf(this.controls.target);

        this.touchNavigation.cancelAstronautTarget();
        const step = 5.4 * deltaTime;
        const desiredX = this.commanderGroup.position.x + activeMoveX * step;
        const desiredZ = this.commanderGroup.position.z + activeMoveZ * step;
        let safeXZ = this.touchNavigation.resolvePositionWithCollisions(
          desiredX,
          desiredZ,
          0.4,
          'commander'
        );
        const moved = Math.hypot(
          safeXZ.x - this.commanderGroup.position.x,
          safeXZ.z - this.commanderGroup.position.z
        );
        if (moved < step * 0.25) {
          const slideLeft = this.touchNavigation.resolvePositionWithCollisions(
            this.commanderGroup.position.x - activeMoveZ * step,
            this.commanderGroup.position.z + activeMoveX * step,
            0.4,
            'commander'
          );
          const slideRight = this.touchNavigation.resolvePositionWithCollisions(
            this.commanderGroup.position.x + activeMoveZ * step,
            this.commanderGroup.position.z - activeMoveX * step,
            0.4,
            'commander'
          );
          const distL = Math.hypot(
            slideLeft.x - this.commanderGroup.position.x,
            slideLeft.z - this.commanderGroup.position.z
          );
          const distR = Math.hypot(
            slideRight.x - this.commanderGroup.position.x,
            slideRight.z - this.commanderGroup.position.z
          );
          safeXZ = distL >= distR ? slideLeft : slideRight;
        }
        this.commanderGroup.position.x = safeXZ.x;
        this.commanderGroup.position.z = safeXZ.z;
        this.touchNavigation.clampObjectToTerrain(this.commanderGroup, 0.05);
        this.commanderGroup.rotation.y = Math.atan2(activeMoveX, activeMoveZ);
      }

      // 2. Actualizar movimiento con colisiones, exploración NPC y animaciones procedurales
      this.touchNavigation.update(elapsedTime, deltaTime, isDirectMoving);

      // 2.5 Seguimiento suave de cámara: mantiene al personaje centrado en pantalla cuando avanza
      if (isFollowingCommander && this.commanderGroup) {
        const camOffsetX = this.camera.position.x - this.controls.target.x;
        const camOffsetY = this.camera.position.y - this.controls.target.y;
        const camOffsetZ = this.camera.position.z - this.controls.target.z;

        const targetX = this.commanderGroup.position.x;
        const targetY = this.commanderGroup.position.y + 1.25;
        const targetZ = this.commanderGroup.position.z;

        this.controls.target.x = THREE.MathUtils.damp(
          this.controls.target.x,
          targetX,
          9.0,
          deltaTime
        );
        this.controls.target.y = THREE.MathUtils.damp(
          this.controls.target.y,
          targetY,
          9.0,
          deltaTime
        );
        this.controls.target.z = THREE.MathUtils.damp(
          this.controls.target.z,
          targetZ,
          9.0,
          deltaTime
        );

        this.camera.position.set(
          this.controls.target.x + camOffsetX,
          this.controls.target.y + camOffsetY,
          this.controls.target.z + camOffsetZ
        );
      }

      // Evitar que la cámara atraviese el suelo marciano
      const camGroundY = this.touchNavigation.sampleTerrainHeight(
        this.camera.position.x,
        this.camera.position.z,
        0
      );
      if (this.camera.position.y < camGroundY + 1.8) {
        this.camera.position.y = camGroundY + 1.8;
      }

      this.animationController.update(elapsedTime, deltaTime);

      // 3. Deriva suave de partículas de polvo marciano
      if (this.dustParticles) {
        this.dustParticles.rotation.y += deltaTime * 0.035;
      }

      // 4. Actualizar OrbitControls y renderizar escena
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  private handleResize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;

    const isPortrait = height > width;
    this.camera.fov = isPortrait ? 62 : 48;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('orientationchange', this.boundOnResize);
    this.inputManager.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
