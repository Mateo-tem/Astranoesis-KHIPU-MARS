import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '@/core/constants';

export interface LoadedMarsAssets {
  terrain: THREE.Group;
  tamboAlfa: THREE.Group;
  solarPanelsTemplate: THREE.Group;
  marsRover: THREE.Group;
  externalEquipment: THREE.Group;
  khipuTracker: THREE.Group;
  astronautTemplate: THREE.Group;
}

export type AssetProgressCallback = (
  progressPercent: number,
  assetName: string,
  itemsLoaded?: number,
  itemsTotal?: number
) => void;

export class AssetLoader {
  private loadingManager: THREE.LoadingManager;
  private loader: GLTFLoader;
  private cache: Map<string, GLTF> = new Map();
  private progressCallback?: AssetProgressCallback;

  private readonly urlLabels: Record<string, string> = {
    [ASSET_PATHS.TERRAIN]: 'Cráter Jezero (jezero-terrain.glb)',
    [ASSET_PATHS.TAMBO_ALFA]: 'Hábitat Tambo Alfa (tambo-alfa.glb)',
    [ASSET_PATHS.SOLAR_PANELS]: 'Matrices Solares (solar-panels-array.glb)',
    [ASSET_PATHS.MARS_ROVER]: 'Rover Perseverance (mars-rover.glb)',
    [ASSET_PATHS.EXTERNAL_EQUIPMENT]: 'Reciclador H₂O y Estación EVA (external-equipment.glb)',
    [ASSET_PATHS.KHIPU_TRACKER]: 'Khipu Tracker 3D (khipu-tracker.glb)',
    [ASSET_PATHS.ASTRONAUT]: 'Trajes Espaciales xEMU (astronaut-character.glb)',
  };

  constructor() {
    this.loadingManager = new THREE.LoadingManager();

    this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      const percent = itemsTotal > 0 ? Math.min(100, Math.round((itemsLoaded / itemsTotal) * 100)) : 0;
      const cleanKey = Object.keys(this.urlLabels).find((k) => url.includes(k));
      const label = cleanKey ? this.urlLabels[cleanKey] : url.split('/').pop() ?? 'Modelo 3D';
      this.progressCallback?.(percent, label, itemsLoaded, itemsTotal);
    };

    this.loader = new GLTFLoader(this.loadingManager);
  }

  /**
   * Carga un archivo GLB individual con caché en memoria
   */
  public async loadGLTF(url: string): Promise<GLTF> {
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    return new Promise<GLTF>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error(`[AssetLoader] Error cargando modelo ${url}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Carga en paralelo los 7 modelos GLB oficiales de ASTRANOESIS (/public/models/)
   * utilizando THREE.LoadingManager para reportar el progreso real en redes móviles
   */
  public async loadAllMissionAssets(onProgress?: AssetProgressCallback): Promise<LoadedMarsAssets> {
    this.progressCallback = onProgress;

    const entries: { key: keyof LoadedMarsAssets; url: string; label: string }[] = [
      { key: 'terrain', url: ASSET_PATHS.TERRAIN, label: this.urlLabels[ASSET_PATHS.TERRAIN] },
      { key: 'tamboAlfa', url: ASSET_PATHS.TAMBO_ALFA, label: this.urlLabels[ASSET_PATHS.TAMBO_ALFA] },
      {
        key: 'solarPanelsTemplate',
        url: ASSET_PATHS.SOLAR_PANELS,
        label: this.urlLabels[ASSET_PATHS.SOLAR_PANELS],
      },
      { key: 'marsRover', url: ASSET_PATHS.MARS_ROVER, label: this.urlLabels[ASSET_PATHS.MARS_ROVER] },
      {
        key: 'externalEquipment',
        url: ASSET_PATHS.EXTERNAL_EQUIPMENT,
        label: this.urlLabels[ASSET_PATHS.EXTERNAL_EQUIPMENT],
      },
      {
        key: 'khipuTracker',
        url: ASSET_PATHS.KHIPU_TRACKER,
        label: this.urlLabels[ASSET_PATHS.KHIPU_TRACKER],
      },
      {
        key: 'astronautTemplate',
        url: ASSET_PATHS.ASTRONAUT,
        label: this.urlLabels[ASSET_PATHS.ASTRONAUT],
      },
    ];

    let completed = 0;
    const total = entries.length;

    const results = await Promise.all(
      entries.map(async (entry) => {
        const gltf = await this.loadGLTF(entry.url);
        completed += 1;
        const percent = Math.round((completed / total) * 100);
        onProgress?.(percent, entry.label, completed, total);
        return { key: entry.key, scene: gltf.scene };
      })
    );

    const assetsMap = {} as Record<keyof LoadedMarsAssets, THREE.Group>;
    for (const item of results) {
      assetsMap[item.key] = item.scene;
    }

    return assetsMap as LoadedMarsAssets;
  }

  /**
   * Configura sombras en un árbol Object3D
   */
  public static configureShadows(
    root: THREE.Object3D,
    options: { castShadow: boolean; receiveShadow: boolean }
  ): void {
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = options.castShadow;
        mesh.receiveShadow = options.receiveShadow;
      }
    });
  }

  /**
   * Clona una jerarquía 3D e independiza un material específico por nombre
   */
  public static cloneWithUniqueMaterial(
    source: THREE.Group,
    materialNameToClone?: string
  ): { clone: THREE.Group; clonedMaterials: THREE.MeshStandardMaterial[] } {
    const clone = source.clone(true);
    const clonedMaterials: THREE.MeshStandardMaterial[] = [];
    const materialMap = new Map<THREE.Material, THREE.Material>();

    if (materialNameToClone) {
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              if (mat.name === materialNameToClone) {
                let cloned = materialMap.get(mat) as THREE.MeshStandardMaterial | undefined;
                if (!cloned) {
                  cloned = (mat as THREE.MeshStandardMaterial).clone();
                  materialMap.set(mat, cloned);
                  clonedMaterials.push(cloned);
                }
                return cloned;
              }
              return mat;
            });
          } else if (mesh.material && mesh.material.name === materialNameToClone) {
            let cloned = materialMap.get(mesh.material) as THREE.MeshStandardMaterial | undefined;
            if (!cloned) {
              cloned = (mesh.material as THREE.MeshStandardMaterial).clone();
              materialMap.set(mesh.material, cloned);
              clonedMaterials.push(cloned);
            }
            mesh.material = cloned;
          }
        }
      });
    }

    return { clone, clonedMaterials };
  }
}
