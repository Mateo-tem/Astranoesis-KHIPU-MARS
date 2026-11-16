import './style.css';
import { initI18n } from '@/locales/i18n';
import { SceneManager } from '@/world';
import { NasaDataService } from '@/services';
import { EventSystem, ResourceEngine } from '@/simulation';
import { createMissionHud } from '@/ui';

async function bootstrap(): Promise<void> {
  await initI18n('es');

  const canvasContainer = document.getElementById('canvas-container');
  const uiLayer = document.getElementById('ui-layer');

  if (!canvasContainer || !uiLayer) {
    throw new Error('[ASTRANOESIS] No se encontraron los contenedores #canvas-container o #ui-layer.');
  }

  // 1. Inicializar Servicios de Datos NASA (DONKI / MEDA con respaldo offline pre-calibrado)
  const nasaService = new NasaDataService();
  void nasaService.syncLiveNasaData();

  // 2. Inicializar Motor Matemático R(t+1) = R(t) + P(t) - C(t) - L(t) y Sistema de Eventos
  const resourceEngine = new ResourceEngine();
  const eventSystem = new EventSystem();

  // 3. Inicializar Motor Gráfico 3D (Mobile-First + PC), TouchNavigation y HUD con KhipuController
  const sceneManager = new SceneManager(canvasContainer);
  const hud = createMissionHud(uiLayer, sceneManager, nasaService, resourceEngine, eventSystem);

  // 4. Cargar y ensamblar los 7 modelos GLB con barra de progreso real (THREE.LoadingManager)
  await sceneManager.initWorld((percent, assetLabel, itemsLoaded, itemsTotal) => {
    hud.updateLoadingProgress(percent, assetLabel, itemsLoaded, itemsTotal);
  });

  hud.setLoaded(sceneManager.getKhipuTrackerModel());
}

void bootstrap();
