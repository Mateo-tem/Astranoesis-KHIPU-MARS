import * as THREE from 'three';
import { PlayerSpecialtyRole, CrewRole } from '@/core/types';
import i18next, { t, changeLanguage, SupportedLocale } from '@/locales/i18n';
import { SceneManager, InteractiveTarget, QuickStationId, AstronautPoseState } from '@/world';
import {
  ResourceEngine,
  EventSystem,
  ContextualSpecialistMenu,
  ActiveMissionEvent,
} from '@/simulation';
import { NasaDataService } from '@/services';
import { KhipuController } from './KhipuController';
import { GAME_ICONS } from './icons';

type OnboardingScreenState =
  | 'LOADING'
  | 'SPLASH'
  | 'INTRO_STORY'
  | 'WELCOME'
  | 'ROLE_SELECT'
  | 'ROLE_CONFIRM'
  | 'PLAYING';

type BottomDrawerMenu = 'NONE' | 'EXPLORE' | 'BUILD' | 'CULTIVATE' | 'CONTEXTUAL';

interface ActiveNpcGreeting {
  npcId: string;
  role: CrewRole;
  timestamp: number;
}

interface ActiveTaskProgressUI {
  percent: number;
  phase: 'MOVING' | 'WORKING' | 'DONE';
  titleKey: string;
  stationId: QuickStationId;
}

export interface MissionHudController {
  updateLoadingProgress: (
    percent: number,
    assetLabel: string,
    itemsLoaded?: number,
    itemsTotal?: number
  ) => void;
  setLoaded: (khipuTemplate: THREE.Group | null) => void;
}

/**
 * Sintetizador de audio espacial ambiental (Web Audio API) para la intro cinematográfica y efectos de misión
 */
class CinematicSpaceAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private isMuted = false;
  private isPlayingDrone = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.16;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public startAmbientIntroScore(sceneIndex: 1 | 2 | 3 | 4): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (!this.isPlayingDrone) {
      this.droneOsc1 = ctx.createOscillator();
      this.droneOsc2 = ctx.createOscillator();
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.22;

      this.droneOsc1.type = 'sine';
      this.droneOsc2.type = 'triangle';
      this.droneOsc1.frequency.setValueAtTime(110, ctx.currentTime);
      this.droneOsc2.frequency.setValueAtTime(164.81, ctx.currentTime);

      this.droneOsc1.connect(droneGain);
      this.droneOsc2.connect(droneGain);
      droneGain.connect(this.masterGain);

      this.droneOsc1.start();
      this.droneOsc2.start();
      this.isPlayingDrone = true;
    }

    // Cambiar atmósfera musical según la escena cinematográfica (1..4)
    const now = ctx.currentTime;
    if (this.droneOsc1 && this.droneOsc2) {
      if (sceneIndex === 1) {
        // Despegue del Futuro: acorde espacial abierto (A2 + E3)
        this.droneOsc1.frequency.exponentialRampToValueAtTime(110, now + 0.8);
        this.droneOsc2.frequency.exponentialRampToValueAtTime(164.81, now + 0.8);
      } else if (sceneIndex === 2) {
        // El Incidente: tensión grave de tormenta (F2 + C3) y pulso de alarma
        this.droneOsc1.frequency.exponentialRampToValueAtTime(87.31, now + 0.5);
        this.droneOsc2.frequency.exponentialRampToValueAtTime(130.81, now + 0.5);
        this.playAlertBeep();
      } else if (sceneIndex === 3) {
        // Cuenta Regresiva ESA: pulso orbital esperanzador (G2 + D3)
        this.droneOsc1.frequency.exponentialRampToValueAtTime(98.0, now + 0.8);
        this.droneOsc2.frequency.exponentialRampToValueAtTime(146.83, now + 0.8);
      } else {
        // Escena 4 Khipu: acorde luminoso andino-espacial (C3 + G3)
        this.droneOsc1.frequency.exponentialRampToValueAtTime(130.81, now + 0.8);
        this.droneOsc2.frequency.exponentialRampToValueAtTime(196.0, now + 0.8);
      }
    }
  }

  public stopAmbientIntroScore(): void {
    if (this.droneOsc1) {
      try {
        this.droneOsc1.stop();
        this.droneOsc1.disconnect();
      } catch {
        // ignore
      }
      this.droneOsc1 = null;
    }
    if (this.droneOsc2) {
      try {
        this.droneOsc2.stop();
        this.droneOsc2.disconnect();
      } catch {
        // ignore
      }
      this.droneOsc2 = null;
    }
    this.isPlayingDrone = false;
  }

  public playAlertBeep(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  public playTaskCompleteChime(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.34);
    });
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAmbientIntroScore();
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }
}

/**
 * UI Manager principal de ASTRANOESIS: Tambo Alfa
 * Incluye:
 * - Intro Cinematográfica de 4 escenas estilo película en primera persona (ES / EN / QU)
 * - Tutorial interactivo paso a paso para aprender a jugar fácilmente
 * - Ejecución física real de tareas con animaciones de personajes/NPCs y barra de progreso en vivo
 * - Ocultación automática del joystick en PC (solo visible en dispositivos táctiles)
 */
export class UIManager implements MissionHudController {
  private root: HTMLElement;
  private sceneManager: SceneManager;
  private resourceEngine: ResourceEngine;
  private eventSystem: EventSystem;
  private nasaService: NasaDataService;
  private khipuController: KhipuController;
  private spaceAudio: CinematicSpaceAudio;

  private screenState: OnboardingScreenState = 'LOADING';
  private introSceneIndex: 1 | 2 | 3 | 4 = 1;
  private introAutoTimer: number | null = null;

  private tutorialStep: 1 | 2 | 3 | 4 | null = 1;
  private hasCompletedTutorial = false;

  private loadingPercent = 0;
  private loadingLabel = '';
  private selectedRole: PlayerSpecialtyRole = 'SCIENTIST';
  private isRoleRandomlyAssigned = false;
  private activeBottomMenu: BottomDrawerMenu = 'NONE';
  private activeContextualMenu: ContextualSpecialistMenu | null = null;
  private isMobileKhipuOpen = false;
  private isGuideModalOpen = false;
  private missionStepIndex: 1 | 2 | 3 | 4 = 1;
  private activeNpcGreeting: ActiveNpcGreeting | null = null;
  private activeTaskProgress: ActiveTaskProgressUI | null = null;

  private dpadCleanup: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    sceneManager: SceneManager,
    nasaService: NasaDataService,
    resourceEngine: ResourceEngine,
    eventSystem: EventSystem
  ) {
    this.root = root;
    this.sceneManager = sceneManager;
    this.nasaService = nasaService;
    this.resourceEngine = resourceEngine;
    this.eventSystem = eventSystem;
    this.khipuController = new KhipuController();
    this.spaceAudio = new CinematicSpaceAudio();

    this.evaluateCurrentSolEvents();

    // Escuchar toques 3D directos sobre edificios, Rover o nodos científicos
    window.addEventListener('astranoesis:target-selected', (evt: Event) => {
      if (this.screenState !== 'PLAYING' || this.activeTaskProgress) return;
      const customEvt = evt as CustomEvent<{ target: InteractiveTarget }>;
      if (!customEvt.detail?.target) return;
      const target = customEvt.detail.target;
      const currentSol = this.resourceEngine.getCurrentSol();
      const telemetry = this.nasaService.getTelemetryForSol(currentSol);
      this.activeContextualMenu = this.eventSystem.getContextualSpecialistMenu(
        target,
        this.resourceEngine,
        this.sceneManager,
        telemetry
      );
      this.activeBottomMenu = 'CONTEXTUAL';
      if (this.missionStepIndex === 1) {
        this.missionStepIndex = 2;
      }
      this.renderHUD();
    });

    // Escuchar progreso en tiempo real cuando el personaje o el Rover ejecutan físicamente una acción
    window.addEventListener('astranoesis:task-progress', (evt: Event) => {
      const customEvt = evt as CustomEvent<ActiveTaskProgressUI>;
      if (!customEvt.detail) return;
      if (customEvt.detail.phase === 'DONE') {
        this.activeTaskProgress = null;
        this.spaceAudio.playTaskCompleteChime();
        this.renderHUD();
      } else {
        this.activeTaskProgress = customEvt.detail;
        this.updateLiveTaskProgressBanner();
      }
    });

    // Escuchar saludo social cuando un NPC explorador se acerca al jugador
    window.addEventListener('astranoesis:npc-proximity', (evt: Event) => {
      const customEvt = evt as CustomEvent<{ npcId: string; role: CrewRole; distance: number }>;
      if (!customEvt.detail) return;
      this.activeNpcGreeting = {
        npcId: customEvt.detail.npcId,
        role: customEvt.detail.role,
        timestamp: Date.now(),
      };
      if (this.screenState === 'PLAYING') {
        this.renderNpcDialogueToast();
      }
    });

    window.addEventListener('astranoesis:locale-changed', () => {
      this.renderHUD();
    });

    this.renderHUD();
  }

  /**
   * Detecta si el usuario está en un dispositivo móvil o tablet táctil para mostrar/ocultar el joystick
   */
  private isTouchMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const smallViewport = window.innerWidth <= 900;
    return coarsePointer || smallViewport;
  }

  public updateLoadingProgress(
    percent: number,
    assetLabel: string,
    _itemsLoaded?: number,
    _itemsTotal?: number
  ): void {
    this.loadingPercent = Math.min(100, Math.max(0, Math.round(percent)));
    this.loadingLabel = assetLabel;
    if (this.screenState === 'LOADING') {
      const bar = document.getElementById('loading-progress-bar');
      const pctText = document.getElementById('loading-progress-pct');
      const labelText = document.getElementById('loading-progress-label');
      if (bar) bar.style.width = `${this.loadingPercent}%`;
      if (pctText) pctText.textContent = `${this.loadingPercent}%`;
      if (labelText) labelText.textContent = this.loadingLabel;
    }
  }

  public setLoaded(khipuTemplate: THREE.Group | null): void {
    if (khipuTemplate) {
      this.khipuController.bindKhipuModel(khipuTemplate);
    }
    this.screenState = 'SPLASH';
    this.renderHUD();
  }

  private getCurrentLocale(): SupportedLocale {
    const lang = (i18next.language || 'es').slice(0, 2);
    if (lang === 'en' || lang === 'qu') return lang;
    return 'es';
  }

  private evaluateCurrentSolEvents(): void {
    const sol = this.resourceEngine.getCurrentSol();
    const schedule = this.nasaService.getSolSchedule(sol);
    const telemetry = this.nasaService.getTelemetryForSol(sol);
    this.eventSystem.evaluateSolEvent(
      sol,
      schedule.scheduledEventId,
      this.resourceEngine,
      this.sceneManager,
      telemetry
    );
  }

  private advanceSol(): void {
    if (this.activeTaskProgress) return;
    const currentSol = this.resourceEngine.getCurrentSol();
    const nextSol = Math.min(28, currentSol + 1);
    const nextTelemetry = this.nasaService.getTelemetryForSol(nextSol);

    this.resourceEngine.advanceSol(nextTelemetry);
    this.sceneManager.setAtmosphericDustLevel(this.resourceEngine.getModifiers().solarDustFactor);
    this.evaluateCurrentSolEvents();

    if (this.missionStepIndex < 4) {
      this.missionStepIndex = (this.missionStepIndex + 1) as 1 | 2 | 3 | 4;
    }

    this.renderHUD();
  }

  private getRoleTitle(role: PlayerSpecialtyRole): string {
    switch (role) {
      case 'COMMANDER':
        return t('roles.commander.title');
      case 'ENGINEER':
        return t('roles.engineer.title');
      case 'MEDIC':
        return t('roles.medic.title');
      case 'SCIENTIST':
      default:
        return t('roles.scientist.title');
    }
  }

  private getRolePerk(role: PlayerSpecialtyRole): string {
    switch (role) {
      case 'COMMANDER':
        return t('roles.commander.perk');
      case 'ENGINEER':
        return t('roles.engineer.perk');
      case 'MEDIC':
        return t('roles.medic.perk');
      case 'SCIENTIST':
      default:
        return t('roles.scientist.perk');
    }
  }

  private getRoleDescription(role: PlayerSpecialtyRole): string {
    switch (role) {
      case 'COMMANDER':
        return t('roles.commander.desc');
      case 'ENGINEER':
        return t('roles.engineer.desc');
      case 'MEDIC':
        return t('roles.medic.desc');
      case 'SCIENTIST':
      default:
        return t('roles.scientist.desc');
    }
  }

  private assignRandomRole(): void {
    const allRoles: PlayerSpecialtyRole[] = ['COMMANDER', 'ENGINEER', 'MEDIC', 'SCIENTIST'];
    const randomIndex = Math.floor(Math.random() * allRoles.length);
    const randomRole = allRoles[randomIndex];
    this.selectedRole = randomRole;
    this.isRoleRandomlyAssigned = true;
    this.resourceEngine.updateModifiers({ playerRole: randomRole });
    this.sceneManager.setPlayerRoleBadge(randomRole);
    this.spaceAudio.playTaskCompleteChime();
    this.screenState = 'ROLE_CONFIRM';
    this.renderHUD();
  }

  private getRoleIllustration(role: PlayerSpecialtyRole): string {
    switch (role) {
      case 'COMMANDER':
        return GAME_ICONS.roleCommander;
      case 'ENGINEER':
        return GAME_ICONS.roleEngineer;
      case 'MEDIC':
        return GAME_ICONS.roleMedic;
      case 'SCIENTIST':
      default:
        return GAME_ICONS.roleScientist;
    }
  }

  private renderLanguageSelectorPills(): string {
    const currentLocale = this.getCurrentLocale();
    return (['es', 'en', 'qu'] as SupportedLocale[])
      .map(
        (loc) => `
        <button
          data-locale="${loc}"
          class="pointer-events-auto min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all active:scale-95 ${
            currentLocale === loc
              ? 'bg-gradient-to-b from-amber-400 to-orange-600 text-slate-950 shadow-md shadow-orange-500/30 border border-amber-200'
              : 'bg-slate-900/80 text-amber-100/80 hover:text-white border border-amber-500/30'
          }"
        >
          ${loc === 'es' ? 'ESPAÑOL' : loc === 'en' ? 'ENGLISH' : 'RUNASIMI'}
        </button>
      `
      )
      .join('');
  }

  /**
   * PANTALLA 0: CARGA DE MODELOS 3D
   */
  private renderLoadingScreen(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-center items-center overflow-hidden bg-[#04060c] select-none p-6">
        <div class="pointer-events-none absolute inset-0 opacity-35" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 64px 64px;"></div>
        <div class="pointer-events-none absolute -bottom-[52vw] left-1/2 -translate-x-1/2 w-[140vw] h-[75vw] rounded-[100%] bg-[radial-gradient(circle_at_50%_15%,_#fde047_0%,_#ea580c_40%,_#431407_85%)] opacity-85"></div>

        <div class="relative z-10 w-full max-w-md rounded-3xl bg-[#1f150e]/95 border-2 border-amber-500/70 p-8 text-center shadow-[0_0_60px_rgba(0,0,0,0.9)]">
          <h1
            class="text-3xl sm:text-5xl font-black uppercase tracking-[0.14em] text-white mb-3"
            style="text-shadow: -2px -2px 0px #38bdf8, 2px 2px 0px #ef4444;"
          >
            ${t('splash.title')}
          </h1>
          <p class="text-xs font-extrabold uppercase tracking-widest text-amber-300 mb-6">
            ${t('loading.title')}
          </p>

          <div class="w-full h-6 rounded-xl bg-slate-950 border-2 border-amber-400/70 p-1 overflow-hidden mb-3">
            <div
              id="loading-progress-bar"
              class="h-full rounded-lg bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 transition-all duration-200"
              style="width: ${this.loadingPercent}%"
            ></div>
          </div>

          <div class="flex items-center justify-between text-xs font-extrabold text-amber-100">
            <span id="loading-progress-label" class="truncate max-w-[240px]">${this.loadingLabel || t('loading.subtitle')}</span>
            <span id="loading-progress-pct">${this.loadingPercent}%</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 1: SPLASH SCREEN (Página 1 del PDF Astranoesis Interface)
   */
  private renderSplashScreen(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center overflow-hidden bg-[#04060c] select-none p-6">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(30,58,138,0.28)_0%,_rgba(4,6,12,0.95)_70%)]"></div>
        <div class="pointer-events-none absolute inset-0 opacity-35" style="background-image: radial-gradient(#ffffff 1px, transparent 1px), radial-gradient(#fde68a 1px, transparent 1px); background-size: 64px 64px, 110px 110px; background-position: 0 0, 30px 45px;"></div>

        <div class="pointer-events-none absolute top-16 left-20 text-slate-400/50 text-2xl font-light">+</div>
        <div class="pointer-events-none absolute top-24 right-28 text-slate-400/50 text-2xl font-light">+</div>
        <div class="pointer-events-none absolute bottom-44 left-28 text-slate-400/40 text-xl font-light">+</div>
        <div class="pointer-events-none absolute bottom-52 right-24 text-slate-400/40 text-xl font-light">+</div>

        <div class="pointer-events-none absolute -bottom-[52vw] left-1/2 -translate-x-1/2 w-[140vw] h-[75vw] rounded-[100%] bg-gradient-to-t from-[#7c2d12] via-[#ea580c] to-[#fbbf24] opacity-90 blur-[2px] shadow-[0_-35px_120px_rgba(249,115,22,0.85)]"></div>
        <div class="pointer-events-none absolute -bottom-[53vw] left-1/2 -translate-x-1/2 w-[138vw] h-[74vw] rounded-[100%] bg-[radial-gradient(circle_at_50%_15%,_#fde047_0%,_#ea580c_38%,_#431407_85%)]"></div>

        <div class="relative z-10 w-full max-w-5xl flex items-center justify-between pt-2">
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-widest uppercase">
            <span>${GAME_ICONS.planet}</span>
            <span>${t('splash.subtitle')}</span>
          </div>
          <div class="flex items-center gap-2">
            ${this.renderLanguageSelectorPills()}
          </div>
        </div>

        <div class="relative z-10 flex flex-col items-center text-center my-auto px-4">
          <h1
            class="text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-[0.14em] text-white select-none"
            style="text-shadow: -3px -2px 0px #38bdf8, 3px 3px 0px #ef4444, 0px 8px 25px rgba(0,0,0,0.9);"
          >
            ${t('splash.title')}
          </h1>
          <p class="mt-4 max-w-xl text-sm sm:text-base font-bold uppercase tracking-[0.25em] text-amber-200/90 drop-shadow">
            ${t('app.subtitle')}
          </p>

          <button
            id="btn-splash-start"
            class="mt-10 min-h-[60px] min-w-[230px] px-10 py-4 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-xl sm:text-2xl uppercase tracking-[0.18em] border-2 border-amber-100 shadow-[0_0_35px_rgba(245,158,11,0.7),inset_0_2px_4px_rgba(255,255,255,0.8)] active:scale-95 transition-all"
          >
            ${t('splash.start')}
          </button>
        </div>

        <div class="relative z-10 pb-2 text-xs font-bold uppercase tracking-widest text-amber-100/80 drop-shadow">
          NASA SPACE APPS CHALLENGE
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 1.5: INTRO CINEMATOGRÁFICA EN PRIMERA PERSONA (4 Escenas estilo película)
   * Muestra en tiempo real el escenario 3D de Marte detrás con franjas negras de cine (Letterbox 2.35:1),
   * visor de casco en primera persona, mapa orbital ESA en la Escena 3 y Khipu Ledger en la Escena 4.
   */
  private renderCinematicIntroScreen(): string {
    const s = this.introSceneIndex;
    const isScene2Alert = s === 2;
    const isScene3Orbit = s === 3;
    const isScene4Khipu = s === 4;

    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between select-none overflow-hidden">
        <!-- Viñeta de casco de astronauta en primera persona sobre la escena 3D en vivo -->
        <div class="pointer-events-none absolute inset-0 ${
          isScene2Alert
            ? 'bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.18)_0%,_rgba(15,4,4,0.82)_88%)] animate-pulse'
            : 'bg-[radial-gradient(circle_at_center,_transparent_35%,_rgba(4,6,12,0.82)_92%)]'
        }"></div>

        <!-- Marco curvo del visor del casco en primera persona -->
        <div class="pointer-events-none absolute inset-3 sm:inset-6 rounded-[44px] border ${
          isScene2Alert ? 'border-red-500/50 shadow-[inset_0_0_50px_rgba(239,68,68,0.35)]' : 'border-amber-400/25 shadow-[inset_0_0_40px_rgba(56,189,248,0.12)]'
        }"></div>

        <!-- FRANJA NEGRA SUPERIOR DE CINE (Letterbox) -->
        <div class="relative z-20 w-full bg-black/95 border-b border-amber-500/30 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 text-amber-300 text-xs font-black uppercase tracking-[0.2em]">
            <span>${GAME_ICONS.film}</span>
            <span>CHAPEA-3 // MARS-EF03 JEZERO</span>
          </div>

          <!-- Indicadores de las 4 escenas -->
          <div class="flex items-center gap-2">
            ${[1, 2, 3, 4]
              .map(
                (idx) => `
                <button
                  data-intro-goto="${idx}"
                  class="h-2.5 rounded-full transition-all ${
                    idx === s ? 'w-10 bg-amber-400 shadow-[0_0_10px_#fbbf24]' : 'w-3 bg-slate-700 hover:bg-slate-500'
                  }"
                  title="Escena ${idx}"
                ></button>
              `
              )
              .join('')}
          </div>

          <div class="flex items-center gap-2">
            ${this.renderLanguageSelectorPills()}
            <button
              id="btn-intro-mute"
              class="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5"
            >
              <span>${this.spaceAudio.getMuted() ? GAME_ICONS.volumeOff : GAME_ICONS.volumeOn}</span>
              <span class="hidden md:inline">${this.spaceAudio.getMuted() ? t('intro.audioOff') : t('intro.audioOn')}</span>
            </button>
            <button
              id="btn-intro-skip"
              class="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs font-extrabold uppercase tracking-wider"
            >
              ${t('intro.skip')}
            </button>
          </div>
        </div>

        <!-- ELEMENTO VISUAL CENTRAL SEGÚN LA ESCENA (Mapa Orbital ESA en Escena 3 / Khipu en Escena 4) -->
        <div class="relative z-10 flex-1 flex items-center justify-center px-4 pointer-events-none">
          ${
            s === 1
              ? `
              <!-- Escena 1: HUD de Aterrizaje en Primera Persona sobre MARS-EF03 -->
              <div class="flex flex-col items-center text-center">
                <div class="px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-black tracking-[0.25em] uppercase backdrop-blur-sm">
                  MARS-EF03 HABITAT LOCK // JEZERO CRATER 18.38 N 77.58 E
                </div>
              </div>
            `
              : ''
          }

          ${
            isScene2Alert
              ? `
              <!-- Escena 2: Alerta Roja de Tormenta en el Módulo de Carga -->
              <div class="flex items-center gap-3 px-6 py-3 rounded-2xl bg-red-950/90 border-2 border-red-400 text-red-100 shadow-[0_0_45px_rgba(239,68,68,0.8)] animate-bounce">
                <span class="text-amber-300">${GAME_ICONS.alertTriangle}</span>
                <span class="text-sm sm:text-lg font-black uppercase tracking-widest">
                  ${t('intro.scene2.title')}
                </span>
              </div>
            `
              : ''
          }

          ${
            isScene3Orbit
              ? `
              <!-- Escena 3: Mapa Orbital mostrando la cápsula de rescate de la ESA descendiendo hacia el cráter en 28 soles -->
              <div class="w-full max-w-lg rounded-3xl bg-slate-950/85 border-2 border-sky-400/70 p-5 backdrop-blur-md shadow-[0_0_50px_rgba(56,189,248,0.35)]">
                <div class="flex items-center justify-between text-xs font-black uppercase tracking-widest text-sky-300 mb-2">
                  <span>NASA - ESA ORBITAL TELEMETRY</span>
                  <span class="px-2.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-400/50">ETA: 28 SOLS</span>
                </div>
                <svg class="w-full h-44" viewBox="0 0 420 170" fill="none">
                  <!-- Planeta Marte y Cráter Jezero -->
                  <circle cx="320" cy="185" r="115" fill="#9a3412" stroke="#fb923c" stroke-width="3"/>
                  <circle cx="295" cy="105" r="8" fill="#fde047" stroke="#ffffff" stroke-width="2"/>
                  <text x="235" y="92" fill="#fde68a" font-size="11" font-weight="bold">MARS-EF03 (Jezero)</text>

                  <!-- Órbita punteada de descenso de la cápsula ESA -->
                  <path d="M 35 35 Q 190 10 295 105" stroke="#38bdf8" stroke-width="3" stroke-dasharray="7 5" fill="none"/>
                  
                  <!-- Nave de carga de la ESA en órbita -->
                  <g transform="translate(95, 26)">
                    <circle cx="0" cy="0" r="14" fill="#0284c7" fill-opacity="0.35" stroke="#38bdf8" stroke-width="2"/>
                    <polygon points="-8,-5 10,0 -8,5" fill="#f8fafc"/>
                  </g>
                  <text x="20" y="64" fill="#7dd3fc" font-size="11" font-weight="bold">ESA SUPPLY CAPSULE</text>
                </svg>
              </div>
            `
              : ''
          }

          ${
            isScene4Khipu
              ? `
              <!-- Escena 4: El Khipu Mission Ledger encendiéndose frente a los 4 astronautas -->
              <div class="w-full max-w-md rounded-3xl bg-[#1f150e]/90 border-2 border-amber-400 p-5 backdrop-blur-md shadow-[0_0_55px_rgba(245,158,11,0.5)] text-center">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-300/50 text-amber-300 text-xs font-black uppercase tracking-widest mb-3">
                  <span>${GAME_ICONS.khipu}</span>
                  <span>KHIPU MISSION LEDGER</span>
                </div>
                <div class="grid grid-cols-4 gap-2 py-3 px-2 rounded-2xl bg-slate-950/85 border border-amber-500/40">
                  ${this.renderKhipuCordColumn(t('khipu.food'), 80, 'bg-emerald-400 shadow-emerald-400/80')}
                  ${this.renderKhipuCordColumn(t('khipu.energy'), 85, 'bg-amber-400 shadow-amber-400/80')}
                  ${this.renderKhipuCordColumn(t('khipu.radiation'), 20, 'bg-rose-400 shadow-rose-400/80')}
                  ${this.renderKhipuCordColumn(t('khipu.supplies'), 90, 'bg-sky-400 shadow-sky-400/80')}
                </div>
              </div>
            `
              : ''
          }
        </div>

        <!-- FRANJA NEGRA INFERIOR DE CINE CON SUBTÍTULOS DE PELÍCULA Y CONTROLES -->
        <div class="relative z-20 w-full bg-black/95 border-t border-amber-500/40 px-4 sm:px-10 py-5">
          <div class="max-w-4xl mx-auto flex flex-col items-center text-center">
            <span class="text-xs font-black uppercase tracking-[0.24em] ${
              isScene2Alert ? 'text-red-400' : 'text-amber-400'
            } mb-1">
              ${t(`intro.scene${s}.tag`)}
            </span>

            <p class="text-base sm:text-xl md:text-2xl font-extrabold text-white leading-relaxed max-w-3xl mb-5 drop-shadow">
              "${t(`intro.scene${s}.text`)}"
            </p>

            <div class="flex flex-wrap items-center justify-center gap-4">
              ${
                s > 1
                  ? `
                  <button
                    id="btn-intro-prev"
                    class="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border border-amber-500/40 flex items-center gap-2 active:scale-95 transition-all"
                  >
                    <span>${GAME_ICONS.chevronLeft}</span>
                    <span>${t('intro.prevScene')}</span>
                  </button>
                `
                  : ''
              }

              ${
                s < 4
                  ? `
                  <button
                    id="btn-intro-next"
                    class="min-h-[52px] min-w-[210px] px-8 py-3 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-sm sm:text-base uppercase tracking-widest border-2 border-amber-100 shadow-[0_0_25px_rgba(245,158,11,0.55)] flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <span>${t('intro.nextScene')}</span>
                    <span>${GAME_ICONS.chevronRight}</span>
                  </button>
                `
                  : `
                  <button
                    id="btn-intro-finish"
                    class="min-h-[56px] min-w-[260px] px-9 py-3.5 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-base sm:text-lg uppercase tracking-widest border-2 border-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.75)] flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <span>${t('intro.chooseRoleBtn')}</span>
                    <span>${GAME_ICONS.chevronRight}</span>
                  </button>
                `
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 2: WELCOME SCREEN (Página 2 del PDF Astranoesis Interface)
   */
  private renderWelcomeScreen(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center overflow-hidden bg-[#05070f] select-none p-6 sm:p-10">
        <div class="pointer-events-none absolute inset-0 opacity-35" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 70px 70px;"></div>
        <div class="pointer-events-none absolute top-16 left-20 text-slate-400/50 text-2xl font-light">+</div>
        <div class="pointer-events-none absolute top-20 right-24 text-slate-400/50 text-2xl font-light">+</div>

        <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25">
          <div class="w-[540px] h-[540px] rounded-full border-[14px] border-amber-500/40 bg-gradient-to-b from-amber-500/20 via-orange-900/15 to-transparent shadow-[0_0_120px_rgba(245,158,11,0.25)]"></div>
        </div>

        <div class="relative z-10 w-full max-w-5xl flex justify-end">
          <div class="flex items-center gap-2">
            ${this.renderLanguageSelectorPills()}
          </div>
        </div>

        <div class="relative z-10 max-w-3xl text-center my-auto px-6 py-10 rounded-3xl bg-slate-950/75 border-2 border-amber-500/40 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.85)]">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-extrabold uppercase tracking-widest mb-4">
            <span>${GAME_ICONS.shield}</span>
            <span>${t('splash.subtitle')}</span>
          </div>

          <h2
            class="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-wider text-white mb-6"
            style="text-shadow: -2px -2px 0px #38bdf8, 2px 2px 0px #ef4444;"
          >
            ${t('welcome.title')}
          </h2>

          <p class="text-base sm:text-xl md:text-2xl font-extrabold uppercase leading-relaxed tracking-wide text-slate-100 max-w-2xl mx-auto">
            ${t('welcome.message')}
          </p>

          <p class="mt-5 text-xs sm:text-sm font-semibold text-amber-300/90 max-w-xl mx-auto">
            ${t('welcome.hint')}
          </p>
        </div>

        <div class="relative z-10 w-full max-w-4xl flex items-center justify-between gap-4 pb-2">
          <button
            id="btn-welcome-back"
            class="min-h-[54px] min-w-[150px] px-7 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-200 font-black text-base sm:text-lg uppercase tracking-widest border-2 border-amber-500/50 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>${GAME_ICONS.chevronLeft}</span>
            <span>${t('welcome.back')}</span>
          </button>

          <button
            id="btn-welcome-next"
            class="min-h-[54px] min-w-[170px] px-8 py-3 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-base sm:text-lg uppercase tracking-widest border-2 border-amber-100 shadow-[0_0_25px_rgba(245,158,11,0.5)] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>${t('welcome.next')}</span>
            <span>${GAME_ICONS.chevronRight}</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 3: SELECCIÓN DE ROL (Página 5 del PDF Astranoesis Interface + Opción de Rol Aleatorio)
   */
  private renderRoleSelectScreen(): string {
    const roles: { id: PlayerSpecialtyRole; key: 'commander' | 'engineer' | 'medic' | 'scientist'; borderGlow: string }[] = [
      { id: 'COMMANDER', key: 'commander', borderGlow: 'hover:border-orange-400' },
      { id: 'ENGINEER', key: 'engineer', borderGlow: 'hover:border-amber-300' },
      { id: 'MEDIC', key: 'medic', borderGlow: 'hover:border-emerald-400' },
      { id: 'SCIENTIST', key: 'scientist', borderGlow: 'hover:border-sky-400' },
    ];

    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center overflow-y-auto bg-[#060913] select-none p-4 sm:p-8">
        <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_55%,_rgba(180,83,9,0.22)_0%,_rgba(6,9,19,0.96)_70%)]"></div>

        <div class="relative z-10 text-center pt-2 pb-4">
          <h2
            class="text-3xl sm:text-5xl font-black uppercase tracking-[0.12em] text-white"
            style="text-shadow: -2px -2px 0px #38bdf8, 2px 2px 0px #ef4444;"
          >
            ${t('roles.screenTitle')}
          </h2>
          <p class="mt-1.5 text-xs sm:text-sm font-extrabold uppercase tracking-[0.22em] text-amber-300">
            ${t('roles.screenSubtitle')}
          </p>
        </div>

        <div class="relative z-10 w-full max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 my-auto py-2">
          ${roles
            .map(
              (r) => `
              <div class="flex flex-col justify-between rounded-2xl bg-gradient-to-b from-[#2b1d12]/95 via-[#1f150e]/95 to-[#140d08]/95 border-2 border-amber-500/50 ${r.borderGlow} p-4 shadow-[0_8px_30px_rgba(0,0,0,0.8)] transition-all hover:-translate-y-1">
                <div>
                  <div class="w-full h-40 rounded-xl bg-gradient-to-b from-amber-500/20 via-orange-950/40 to-slate-950/90 border border-amber-500/30 flex items-center justify-center p-3 mb-3 overflow-hidden">
                    ${this.getRoleIllustration(r.id)}
                  </div>

                  <h3 class="text-lg sm:text-xl font-black uppercase tracking-wider text-center text-white mb-2">
                    ${t(`roles.${r.key}.title`)}
                  </h3>

                  <p class="text-xs sm:text-sm text-amber-100/90 text-center leading-relaxed mb-3">
                    ${t(`roles.${r.key}.desc`)}
                  </p>
                </div>

                <div>
                  <div class="rounded-xl bg-amber-500/15 border border-amber-400/35 px-3 py-2 mb-3 text-center">
                    <span class="block text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                      ${t(`roles.${r.key}.perk`)}
                    </span>
                  </div>

                  <button
                    data-select-role="${r.id}"
                    class="w-full min-h-[48px] py-2.5 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-sm sm:text-base uppercase tracking-widest border border-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.45)] active:scale-95 transition-all"
                  >
                    ${t('roles.selectBtn')}
                  </button>
                </div>
              </div>
            `
            )
            .join('')}

          <!-- 5ta Tarjeta: Opción de ROL ALEATORIO -->
          <div class="sm:col-span-2 lg:col-span-1 flex flex-col justify-between rounded-2xl bg-gradient-to-b from-[#1e1b4b]/95 via-[#172554]/95 to-[#0f172a]/95 border-2 border-cyan-400/70 hover:border-amber-300 p-4 shadow-[0_8px_35px_rgba(56,189,248,0.3)] transition-all hover:-translate-y-1">
            <div>
              <div class="w-full h-40 rounded-xl bg-gradient-to-b from-cyan-500/25 via-indigo-950/50 to-slate-950/90 border border-cyan-400/40 flex items-center justify-center p-3 mb-3 overflow-hidden">
                ${GAME_ICONS.roleRandom}
              </div>

              <h3 class="text-lg sm:text-xl font-black uppercase tracking-wider text-center text-cyan-200 mb-2">
                ${t('roles.random.title')}
              </h3>

              <p class="text-xs sm:text-sm text-cyan-100/90 text-center leading-relaxed mb-3">
                ${t('roles.random.desc')}
              </p>
            </div>

            <div>
              <div class="rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-3 py-2 mb-3 text-center">
                <span class="block text-[11px] font-extrabold uppercase tracking-wider text-cyan-200">
                  ${t('roles.random.perk')}
                </span>
              </div>

              <button
                data-random-role="true"
                class="w-full min-h-[48px] py-2.5 px-3 rounded-xl bg-gradient-to-b from-cyan-300 via-sky-500 to-blue-700 hover:from-cyan-200 hover:to-sky-400 text-slate-950 font-black text-sm sm:text-base uppercase tracking-wider border border-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.55)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span>${GAME_ICONS.dice}</span>
                <span>${t('roles.random.btn')}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="relative z-10 w-full max-w-7xl flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            id="btn-roles-back"
            class="min-h-[46px] px-5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-200 font-bold text-xs uppercase tracking-widest border border-amber-500/40 flex items-center gap-2"
          >
            <span>${GAME_ICONS.chevronLeft}</span>
            <span>${t('welcome.back')}</span>
          </button>

          <button
            data-random-role="true"
            class="min-h-[46px] px-6 py-2 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 text-cyan-200 font-extrabold text-xs sm:text-sm uppercase tracking-widest border border-cyan-400/60 shadow-[0_0_18px_rgba(56,189,248,0.3)] flex items-center gap-2 active:scale-95 transition-all"
          >
            <span>${GAME_ICONS.dice}</span>
            <span>${t('roles.random.btn')}</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 4: CONFIRMACIÓN DE ROL Y CARTEL "ROL ASIGNADO: X" (Página 6 del PDF Astranoesis Interface)
   */
  private renderRoleConfirmScreen(): string {
    const roleTitle = this.getRoleTitle(this.selectedRole);
    const roleDesc = this.getRoleDescription(this.selectedRole);
    const rolePerk = this.getRolePerk(this.selectedRole);

    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center bg-slate-950/75 backdrop-blur-md select-none p-6 sm:p-10 overflow-y-auto">
        <!-- Cartel superior destacado: "Rol asignado: X" -->
        <div class="relative z-10 mt-2 px-8 py-3.5 rounded-2xl bg-[#2b1d12]/95 border-2 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.5)] text-center">
          <div class="flex items-center justify-center gap-2.5">
            <span class="text-amber-300">${this.isRoleRandomlyAssigned ? GAME_ICONS.dice : GAME_ICONS.userCheck}</span>
            <span class="text-base sm:text-xl font-black text-amber-100 tracking-wider uppercase">
              ${t('roles.assignedLabel')} <strong class="text-amber-300 underline decoration-amber-400/80 underline-offset-4">${roleTitle}</strong>
            </span>
          </div>
        </div>

        <!-- Cartel central con la insignia del Rol Asignado -->
        <div class="relative z-10 w-full max-w-xl rounded-3xl bg-[#23170e]/95 border-2 border-amber-500/70 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] text-center my-auto">
          ${
            this.isRoleRandomlyAssigned
              ? `
              <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 text-xs font-black uppercase tracking-widest mb-4">
                <span>${GAME_ICONS.dice}</span>
                <span>${t('roles.random.badge')}</span>
              </div>
            `
              : ''
          }

          <div class="w-28 h-28 mx-auto mb-4 rounded-2xl bg-amber-500/15 border border-amber-400/40 p-2 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.25)]">
            ${this.getRoleIllustration(this.selectedRole)}
          </div>

          <!-- Cartel principal dentro de la tarjeta -->
          <div class="mb-4 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/30 to-amber-500/20 border-2 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.3)]">
            <span class="block text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300 mb-0.5">
              ${t('roles.assignedLabel')}
            </span>
            <h3 class="text-2xl sm:text-4xl font-black uppercase tracking-wider text-white">
              ${roleTitle}
            </h3>
          </div>

          <p class="text-xs sm:text-sm font-semibold text-amber-100/90 leading-relaxed mb-4">
            ${roleDesc}
          </p>

          <div class="w-full h-6 rounded-lg bg-slate-950 border-2 border-amber-400/70 p-1 overflow-hidden mb-3">
            <div class="h-full w-full rounded bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 animate-pulse"></div>
          </div>

          <p class="text-sm sm:text-base font-black uppercase tracking-[0.16em] text-amber-200 mb-3">
            ${t('roles.startingMission')}
          </p>

          <p class="text-xs sm:text-sm font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-4 py-2.5">
            ${rolePerk}
          </p>
        </div>

        <div class="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 pb-2">
          <button
            id="btn-confirm-change-role"
            class="min-h-[54px] px-6 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border-2 border-amber-500/40 active:scale-95 transition-all"
          >
            ${t('roles.changeRoleBtn')}
          </button>

          <button
            data-random-role="true"
            class="min-h-[54px] px-6 py-3 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 text-cyan-200 font-extrabold text-xs sm:text-sm uppercase tracking-wider border-2 border-cyan-400/60 flex items-center gap-2 active:scale-95 transition-all"
          >
            <span>${GAME_ICONS.dice}</span>
            <span>${t('roles.random.rerollBtn')}</span>
          </button>

          <button
            id="btn-confirm-start-day1"
            class="min-h-[58px] min-w-[230px] px-10 py-3.5 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-lg sm:text-xl uppercase tracking-[0.15em] border-2 border-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.65)] active:scale-95 transition-all"
          >
            ${t('roles.startDay1Btn')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 5: HUD INTERACTIVO PRINCIPAL (Páginas 3, 4, 7, 8 y 9 del PDF)
   */
  public renderHUD(): void {
    this.dpadCleanup.forEach((fn) => fn());
    this.dpadCleanup = [];

    if (this.screenState === 'LOADING') {
      this.root.innerHTML = this.renderLoadingScreen();
      return;
    }
    if (this.screenState === 'SPLASH') {
      this.root.innerHTML = this.renderSplashScreen();
      this.bindOnboardingEvents();
      return;
    }
    if (this.screenState === 'INTRO_STORY') {
      this.root.innerHTML = this.renderCinematicIntroScreen();
      this.bindIntroStoryEvents();
      return;
    }
    if (this.screenState === 'WELCOME') {
      this.root.innerHTML = this.renderWelcomeScreen();
      this.bindOnboardingEvents();
      return;
    }
    if (this.screenState === 'ROLE_SELECT') {
      this.root.innerHTML = this.renderRoleSelectScreen();
      this.bindOnboardingEvents();
      return;
    }
    if (this.screenState === 'ROLE_CONFIRM') {
      this.root.innerHTML = this.renderRoleConfirmScreen();
      this.bindOnboardingEvents();
      return;
    }

    const sol = this.resourceEngine.getCurrentSol();
    const act = this.resourceEngine.getCurrentAct();
    const res = this.resourceEngine.getResources();
    const mods = this.resourceEngine.getModifiers();
    const activeEvent = this.eventSystem.getActiveEvent();
    const feedbackKey = this.eventSystem.getLastFeedbackKey();
    const missionState = this.resourceEngine.getMissionStatus();
    const isGameOver = missionState.status === 'DEFEAT';
    const isMissionSuccess = missionState.status === 'VICTORY';

    const oxygenPct = Math.round(
      THREE.MathUtils.clamp((res.oxygen.current / res.oxygen.capacity) * 100, 0, 100)
    );
    const energyPct = Math.round(
      THREE.MathUtils.clamp((res.energy.current / res.energy.capacity) * 100, 0, 100)
    );
    const waterPct = Math.round(
      THREE.MathUtils.clamp((res.water.current / res.water.capacity) * 100, 0, 100)
    );
    const foodPct = Math.round(THREE.MathUtils.clamp(mods.hydroponicGrowthPercent, 0, 100));
    const radiationPct = Math.round(
      THREE.MathUtils.clamp((res.radiation.current / res.radiation.capacity) * 100, 0, 100)
    );
    const solFormatted = sol < 10 ? `0${sol}` : `${sol}`;
    const signalDelayMin = 14;

    const highlightStep1 = this.tutorialStep === 1 ? 'ring-4 ring-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.75)]' : '';
    const highlightStep4 = this.tutorialStep === 4 ? 'ring-4 ring-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.9)] animate-pulse' : '';

    this.root.innerHTML = `
      <div class="pointer-events-none fixed inset-0 flex flex-col justify-between p-2 sm:p-3.5 select-none z-10 overflow-hidden">
        
        <!-- 1. BARRA SUPERIOR ESTILO VIDEOJUEGO ESPACIAL -->
        <header class="pointer-events-auto w-full rounded-2xl bg-[#1a120b]/95 border-2 border-amber-500/60 ${highlightStep1} backdrop-blur-md px-3 py-2 shadow-[0_6px_25px_rgba(0,0,0,0.85)] transition-all">
          <div class="flex flex-wrap items-center justify-between gap-2">
            
            <!-- Día actual + Rol del jugador -->
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-2 bg-[#2b1d12] border border-amber-400/50 rounded-xl px-3 py-1.5">
                <span class="text-amber-300">${GAME_ICONS.calendar}</span>
                <span class="text-sm sm:text-base font-black tracking-wider text-white">
                  ${t('hud.day')} ${solFormatted} / 28
                </span>
                <span class="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  ${t('hud.act')} ${act}
                </span>
              </div>

              <button
                id="btn-switch-role"
                title="${t('roles.changeRoleBtn')}"
                class="hidden xl:flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-extrabold text-amber-200 transition-all active:scale-95"
              >
                <span class="text-amber-400">${GAME_ICONS.userCheck}</span>
                <span>${this.getRoleTitle(this.selectedRole)}</span>
              </button>
            </div>

            <!-- Barras centrales de recursos (Oxígeno, Energía, Comida, Agua, Radiación) -->
            <div class="flex flex-wrap items-center gap-2 sm:gap-3">
              <!-- Oxígeno -->
              <div class="flex items-center gap-2 bg-slate-950/85 border border-sky-500/40 rounded-xl px-2.5 py-1">
                <span class="text-sky-400">${GAME_ICONS.oxygen}</span>
                <div class="w-20 sm:w-24">
                  <div class="flex justify-between text-[10px] font-extrabold uppercase text-sky-200 mb-0.5">
                    <span>${t('hud.oxygen')}</span>
                    <span>${oxygenPct}%</span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div class="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-300" style="width: ${oxygenPct}%"></div>
                  </div>
                </div>
              </div>

              <!-- Energía -->
              <div class="flex items-center gap-2 bg-slate-950/85 border border-amber-500/40 rounded-xl px-2.5 py-1">
                <span class="text-amber-400">${GAME_ICONS.energy}</span>
                <div class="w-20 sm:w-24">
                  <div class="flex justify-between text-[10px] font-extrabold uppercase text-amber-200 mb-0.5">
                    <span>${t('hud.energy')}</span>
                    <span>${energyPct}%</span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-300" style="width: ${energyPct}%"></div>
                  </div>
                </div>
              </div>

              <!-- Comida / Invernadero -->
              <div class="flex items-center gap-2 bg-slate-950/85 border border-emerald-500/40 rounded-xl px-2.5 py-1">
                <span class="text-emerald-400">${GAME_ICONS.leaf}</span>
                <div class="w-20 sm:w-24">
                  <div class="flex justify-between text-[10px] font-extrabold uppercase text-emerald-200 mb-0.5">
                    <span>${t('hud.food')}</span>
                    <span>${foodPct}%</span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300 transition-all duration-300" style="width: ${foodPct}%"></div>
                  </div>
                </div>
              </div>

              <!-- Agua -->
              <div class="flex items-center gap-2 bg-slate-950/85 border border-blue-500/40 rounded-xl px-2.5 py-1">
                <span class="text-blue-400">${GAME_ICONS.water}</span>
                <div class="w-20 sm:w-24">
                  <div class="flex justify-between text-[10px] font-extrabold uppercase text-blue-200 mb-0.5">
                    <span>${t('hud.water')}</span>
                    <span>${waterPct}%</span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-300 transition-all duration-300" style="width: ${waterPct}%"></div>
                  </div>
                </div>
              </div>

              <!-- Radiación -->
              <div class="flex items-center gap-2 bg-slate-950/85 border ${radiationPct > 55 ? 'border-rose-500 animate-pulse' : 'border-purple-500/40'} rounded-xl px-2.5 py-1">
                <span class="${radiationPct > 55 ? 'text-rose-400' : 'text-purple-400'}">${GAME_ICONS.radiation}</span>
                <div class="w-20 sm:w-24">
                  <div class="flex justify-between text-[10px] font-extrabold uppercase text-purple-200 mb-0.5">
                    <span>${t('hud.radiation')}</span>
                    <span>${radiationPct}%</span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-rose-500 transition-all duration-300" style="width: ${radiationPct}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Indicadores derechos: Señal, Metal, Piezas, Tutorial y Siguiente Día -->
            <div class="flex items-center gap-2">
              <div class="hidden xl:flex items-center rounded-xl bg-slate-950/85 border border-amber-500/35 divide-x divide-amber-500/30 text-xs font-extrabold text-amber-100">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <span class="text-amber-400">${GAME_ICONS.signal}</span>
                  <span>${t('hud.signal')}: ${signalDelayMin} ${t('hud.minutes')}</span>
                </div>
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <span class="text-slate-300">${GAME_ICONS.metal}</span>
                  <span>${t('hud.metal')}: ${mods.metal}</span>
                </div>
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <span class="text-amber-300">${GAME_ICONS.scrap}</span>
                  <span>${t('hud.scrap')}: ${mods.scrap}</span>
                </div>
              </div>

              <button
                id="btn-toggle-khipu-mobile"
                class="lg:hidden min-h-[42px] px-3 py-1.5 rounded-xl bg-[#2b1d12] border border-amber-400/60 text-amber-200 text-xs font-black uppercase flex items-center gap-1.5 active:scale-95"
              >
                <span>${GAME_ICONS.khipu}</span>
                <span>${t('khipu.title')}</span>
              </button>

              <button
                id="btn-open-guide"
                title="${t('guide.title')}"
                class="min-h-[42px] min-w-[42px] rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 text-amber-300 flex items-center justify-center active:scale-95"
              >
                ${GAME_ICONS.info}
              </button>

              <button
                id="btn-advance-sol"
                ${activeEvent || isGameOver || isMissionSuccess || this.activeTaskProgress ? 'disabled' : ''}
                class="min-h-[42px] px-4 py-1.5 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 ${highlightStep4} ${
                  activeEvent || isGameOver || isMissionSuccess || this.activeTaskProgress
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : 'bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 border border-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
                }"
              >
                <span>${t('hud.nextDay')}</span>
                <span>${GAME_ICONS.chevronRight}</span>
              </button>
            </div>
          </div>
        </header>

        <!-- 2. ZONA CENTRAL: PINES DE ESTACIONES + BANNER DE MISIÓN/PROGRESO + PANEL KHIPU DERECHO -->
        <div class="relative flex-1 flex items-start justify-between my-2 overflow-hidden">
          
          <!-- Columna izquierda: Pines de estaciones rápidas + Burbuja Social de NPCs -->
          <div class="pointer-events-auto flex flex-col gap-2 z-20 ${this.tutorialStep === 2 ? 'ring-4 ring-amber-300 rounded-2xl p-1' : ''}">
            ${this.renderStationPins(activeEvent !== null, mods.isWaterRecyclerBroken)}
            <div id="npc-greeting-container">
              ${this.renderNpcGreetingCard()}
            </div>
          </div>

          <!-- Centro Superior: Banner de Misión / Progreso físico en vivo / Tutorial Interactivo -->
          <div class="pointer-events-auto flex flex-col items-center mx-auto max-w-2xl px-2 z-20">
            ${
              activeEvent
                ? `
                <div class="flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-red-950/95 via-red-800/95 to-red-950/95 border-2 border-red-400 shadow-[0_0_35px_rgba(239,68,68,0.75)] animate-pulse">
                  <span class="text-amber-300">${GAME_ICONS.alertTriangle}</span>
                  <div class="text-center">
                    <h2 class="text-base sm:text-xl font-black uppercase tracking-wider text-white">
                      ${t(activeEvent.titleKey)}
                    </h2>
                    <p class="text-xs font-bold text-red-100">
                      ${t(activeEvent.subtitleKey)}
                    </p>
                  </div>
                </div>
              `
                : `
                <div class="flex items-center gap-2.5 px-5 py-2 rounded-2xl bg-[#1a120b]/90 border border-amber-400/60 shadow-lg text-center">
                  <span class="text-amber-400">${GAME_ICONS.compass}</span>
                  <span class="text-xs sm:text-sm font-extrabold text-amber-100">
                    ${t(`missions.step${this.missionStepIndex}`)}
                  </span>
                </div>
              `
            }

            <!-- Contenedor de Barra de Progreso Física en Vivo cuando el personaje/Rover realiza una acción -->
            <div id="live-task-progress-host" class="w-full flex justify-center">
              ${this.renderLiveTaskProgressCard()}
            </div>

            ${
              feedbackKey && !this.activeTaskProgress
                ? `
                <div class="mt-2 flex items-center gap-3 px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-400/70 text-emerald-100 text-xs sm:text-sm font-bold shadow-lg">
                  <span class="text-emerald-400">${GAME_ICONS.check}</span>
                  <span>${t(feedbackKey)}</span>
                  <button id="btn-dismiss-feedback" class="ml-2 px-2 py-0.5 rounded bg-emerald-800/80 hover:bg-emerald-700 text-white text-[11px] font-black">OK</button>
                </div>
              `
                : ''
            }

            <!-- Tarjeta de Tutorial Interactivo Paso a Paso (Pasos 1 a 4) -->
            ${this.tutorialStep !== null ? this.renderInteractiveTutorialCard() : ''}
          </div>

          <!-- Columna Derecha: Panel KHIPU -->
          <aside
            id="khipu-panel-wrapper"
            class="pointer-events-auto ${
              this.isMobileKhipuOpen ? 'fixed right-3 top-20 z-40 flex' : 'hidden lg:flex'
            } flex-col w-60 rounded-2xl bg-[#1f150e]/95 border-2 border-amber-500/60 ${highlightStep1} p-3 shadow-[0_8px_30px_rgba(0,0,0,0.85)]"
          >
            <div class="flex items-center justify-between border-b border-amber-500/30 pb-2 mb-2.5">
              <div class="flex items-center gap-2">
                <span class="text-amber-400">${GAME_ICONS.khipu}</span>
                <div>
                  <h3 class="text-sm font-black uppercase tracking-widest text-amber-200">
                    ${t('khipu.title')}
                  </h3>
                  <p class="text-[10px] font-bold text-amber-400/80">
                    ${t('khipu.subtitle')}
                  </p>
                </div>
              </div>
              <button
                id="btn-close-khipu-mobile"
                class="lg:hidden p-1 rounded-lg bg-slate-900 text-amber-200"
              >
                ${GAME_ICONS.close}
              </button>
            </div>

            <div class="grid grid-cols-4 gap-1.5 text-center py-2 px-1 rounded-xl bg-slate-950/80 border border-amber-500/30 mb-2.5">
              ${this.renderKhipuCordColumn(t('khipu.food'), foodPct, 'bg-emerald-400 shadow-emerald-400/60')}
              ${this.renderKhipuCordColumn(t('khipu.energy'), energyPct, 'bg-amber-400 shadow-amber-400/60')}
              ${this.renderKhipuCordColumn(t('khipu.radiation'), radiationPct, 'bg-rose-400 shadow-rose-400/60')}
              ${this.renderKhipuCordColumn(t('khipu.supplies'), waterPct, 'bg-sky-400 shadow-sky-400/60')}
            </div>

            <div
              id="khipu-3d-canvas-container"
              class="w-full h-36 rounded-xl bg-slate-950/90 border border-amber-500/30 overflow-hidden relative"
            ></div>

            <p class="mt-2 text-[10px] font-semibold text-amber-200/80 text-center leading-snug">
              ${t('khipu.legend')}
            </p>
          </aside>
        </div>

        <!-- 3. POPOVER FLOTANTE DE ACCIONES -->
        ${this.renderActiveActionPopover()}

        <!-- 4. BARRA INFERIOR: MODO CRISIS O MODO NORMAL -->
        <footer class="pointer-events-auto w-full z-20">
          ${activeEvent ? this.renderCrisisBottomBar(activeEvent) : this.renderNormalBottomBar()}
        </footer>

        <!-- 5. MODAL DE GUÍA O PANTALLAS DE VICTORIA / DERROTA -->
        ${this.isGuideModalOpen ? this.renderGuideModal() : ''}
        ${isMissionSuccess ? this.renderVictoryScreen() : ''}
        ${isGameOver ? this.renderGameOverScreen() : ''}
      </div>
    `;

    this.mountKhipu3D();
    this.bindHudEvents();
  }

  /**
   * Tarjeta del Tutorial Interactivo (Pasos 1 a 4) para que cualquier jugador entienda la simulación
   */
  private renderInteractiveTutorialCard(): string {
    if (this.tutorialStep === null) return '';
    const step = this.tutorialStep;

    return `
      <div class="mt-3 w-full max-w-lg rounded-2xl bg-[#23170e]/95 border-2 border-amber-300 p-4 shadow-[0_0_40px_rgba(245,158,11,0.5)] backdrop-blur-md">
        <div class="flex items-center justify-between mb-1.5">
          <span class="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest">
            ${t('tutorial.badge')} (${step} / 4)
          </span>
          <button
            id="btn-tutorial-skip"
            class="text-xs font-bold text-amber-300/80 hover:text-white underline"
          >
            ${t('tutorial.skip')}
          </button>
        </div>

        <h3 class="text-sm sm:text-base font-black uppercase text-white mb-1">
          ${t(`tutorial.step${step}.title`)}
        </h3>
        <p class="text-xs sm:text-sm font-semibold text-amber-100/95 leading-relaxed mb-3">
          ${t(`tutorial.step${step}.desc`)}
        </p>

        <div class="flex items-center justify-end gap-2">
          <button
            id="btn-tutorial-next"
            class="min-h-[40px] px-5 py-1.5 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 text-slate-950 font-black text-xs uppercase tracking-wider border border-amber-100 shadow flex items-center gap-1.5 active:scale-95"
          >
            <span>${step < 4 ? t('tutorial.next') : t('tutorial.finish')}</span>
            <span>${GAME_ICONS.chevronRight}</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Barra de progreso en vivo mientras el personaje o el Rover caminan y ejecutan físicamente la acción
   */
  private renderLiveTaskProgressCard(): string {
    if (!this.activeTaskProgress) return '';
    const { percent, phase, titleKey } = this.activeTaskProgress;
    const statusText =
      phase === 'MOVING' ? t('taskProgress.moving') : t('taskProgress.working');

    return `
      <div class="mt-2.5 w-full max-w-md rounded-2xl bg-slate-950/95 border-2 border-sky-400 p-3 shadow-[0_0_30px_rgba(56,189,248,0.5)]">
        <div class="flex items-center justify-between text-xs font-black uppercase text-sky-300 mb-1">
          <span class="flex items-center gap-1.5">
            <span>${GAME_ICONS.wrench}</span>
            <span>${t(titleKey)}</span>
          </span>
          <span id="live-task-pct">${percent}%</span>
        </div>
        <p id="live-task-status" class="text-[11px] font-bold text-slate-200 mb-2">
          ${statusText}
        </p>
        <div class="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5">
          <div
            id="live-task-bar"
            class="h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-emerald-400 transition-all duration-150"
            style="width: ${percent}%"
          ></div>
        </div>
      </div>
    `;
  }

  private updateLiveTaskProgressBanner(): void {
    const host = document.getElementById('live-task-progress-host');
    if (host) {
      host.innerHTML = this.renderLiveTaskProgressCard();
    }
  }

  /**
   * Renderiza los pines circulares de las estaciones de la colonia
   */
  private renderStationPins(hasAlert: boolean, waterAlert: boolean): string {
    const stations: {
      id: string;
      label: string;
      icon: string;
      alert: boolean;
      action: 'CULTIVATE' | 'BUILD' | 'EXPLORE' | 'BASE';
    }[] = [
      {
        id: 'pin-greenhouse',
        label: t('pins.greenhouse'),
        icon: GAME_ICONS.leaf,
        alert: false,
        action: 'CULTIVATE',
      },
      {
        id: 'pin-habitat',
        label: t('pins.habitat'),
        icon: GAME_ICONS.habitat,
        alert: hasAlert,
        action: 'BASE',
      },
      {
        id: 'pin-solar',
        label: t('pins.solarPanels'),
        icon: GAME_ICONS.solarPanel,
        alert: hasAlert,
        action: 'BUILD',
      },
      {
        id: 'pin-water',
        label: t('pins.waterRecycler'),
        icon: GAME_ICONS.water,
        alert: waterAlert,
        action: 'BUILD',
      },
      {
        id: 'pin-rover',
        label: t('pins.rover'),
        icon: GAME_ICONS.rover,
        alert: false,
        action: 'EXPLORE',
      },
    ];

    return `
      <div class="flex flex-col gap-2">
        ${stations
          .map(
            (st) => `
            <button
              data-station-pin="${st.id}"
              data-station-action="${st.action}"
              class="group flex items-center gap-2.5 min-h-[44px] px-3 py-1.5 rounded-full border-2 transition-all active:scale-95 shadow-lg ${
                st.alert
                  ? 'bg-red-950/95 border-red-400 text-red-100 animate-pulse'
                  : 'bg-[#1f150e]/90 hover:bg-[#2b1d12] border-amber-500/60 text-amber-100'
              }"
            >
              <span class="w-7 h-7 rounded-full flex items-center justify-center ${
                st.alert ? 'bg-red-600 text-white' : 'bg-amber-500/25 text-amber-300'
              }">
                ${st.alert ? GAME_ICONS.alertTriangle : st.icon}
              </span>
              <span class="text-xs font-extrabold uppercase tracking-wider pr-1">
                ${st.label}
              </span>
            </button>
          `
          )
          .join('')}
      </div>
    `;
  }

  /**
   * Renderiza una cuerda vertical con 5 nudos para el panel KHIPU
   */
  private renderKhipuCordColumn(label: string, percentage: number, activeColorClass: string): string {
    const activeKnots = Math.ceil(Math.max(0, Math.min(100, percentage)) / 20);
    const knotsHtml = [1, 2, 3, 4, 5]
      .map((idx) => {
        const isLit = idx <= activeKnots;
        return `
          <div class="w-3.5 h-3.5 rounded-full border ${
            isLit
              ? `${activeColorClass} border-white shadow-md scale-100`
              : 'bg-slate-800 border-slate-600 scale-75 opacity-45'
          } transition-all"></div>
        `;
      })
      .join('');

    return `
      <div class="flex flex-col items-center">
        <span class="text-[10px] font-extrabold uppercase text-amber-200 mb-1.5 truncate max-w-full">${label}</span>
        <div class="relative flex flex-col items-center gap-2 py-1">
          <div class="absolute top-0 bottom-0 w-0.5 bg-amber-600/60"></div>
          ${knotsHtml}
        </div>
        <span class="mt-1 text-[10px] font-black text-white">${percentage}%</span>
      </div>
    `;
  }

  /**
   * Burbuja social cuando el jugador camina cerca de un especialista NPC
   */
  private renderNpcGreetingCard(): string {
    if (!this.activeNpcGreeting || Date.now() - this.activeNpcGreeting.timestamp > 9000) {
      return '';
    }

    let messageKey = 'npc.greetingScientist';
    let badgeColor = 'border-sky-400 bg-sky-950/90 text-sky-100';
    if (this.activeNpcGreeting.role === 'FLIGHT_ENGINEER') {
      messageKey = 'npc.greetingEngineer';
      badgeColor = 'border-amber-400 bg-amber-950/90 text-amber-100';
    } else if (this.activeNpcGreeting.role === 'MEDIC_OFFICER') {
      messageKey = 'npc.greetingMedic';
      badgeColor = 'border-emerald-400 bg-emerald-950/90 text-emerald-100';
    }

    return `
      <div class="max-w-xs rounded-2xl border-2 ${badgeColor} p-3 shadow-xl backdrop-blur-md">
        <div class="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-1">
          <span>${GAME_ICONS.users}</span>
          <span>${t('npc.socialBubble')}</span>
        </div>
        <p class="text-xs font-bold leading-relaxed">
          "${t(messageKey)}"
        </p>
      </div>
    `;
  }

  private renderNpcDialogueToast(): void {
    const container = document.getElementById('npc-greeting-container');
    if (container) {
      container.innerHTML = this.renderNpcGreetingCard();
    }
  }

  /**
   * Popover interactivo cuando el niño abre CULTIVAR, CONSTRUIR, EXPLORAR o toca un objeto 3D
   */
  private renderActiveActionPopover(): string {
    if (this.activeBottomMenu === 'NONE') return '';

    let title = '';
    let subtitle = '';
    let items: {
      id: string;
      title: string;
      good: string;
      bad: string;
      icon: string;
      recommendedRole: PlayerSpecialtyRole;
    }[] = [];

    if (this.activeBottomMenu === 'CULTIVATE') {
      title = t('cultivateMenu.title');
      subtitle = t('cultivateMenu.subtitle');
      items = [
        {
          id: 'cultivate-water',
          title: t('cultivateMenu.water.title'),
          good: t('cultivateMenu.water.good'),
          bad: t('cultivateMenu.water.bad'),
          icon: GAME_ICONS.water,
          recommendedRole: 'SCIENTIST',
        },
        {
          id: 'cultivate-harvest',
          title: t('cultivateMenu.harvest.title'),
          good: t('cultivateMenu.harvest.good'),
          bad: t('cultivateMenu.harvest.bad'),
          icon: GAME_ICONS.leaf,
          recommendedRole: 'MEDIC',
        },
        {
          id: 'cultivate-inspect',
          title: t('cultivateMenu.inspect.title'),
          good: t('cultivateMenu.inspect.good'),
          bad: t('cultivateMenu.inspect.bad'),
          icon: GAME_ICONS.search,
          recommendedRole: 'COMMANDER',
        },
      ];
    } else if (this.activeBottomMenu === 'BUILD') {
      title = t('buildMenu.title');
      subtitle = t('buildMenu.subtitle');
      items = [
        {
          id: 'build-clean-panels',
          title: t('buildMenu.cleanPanels.title'),
          good: t('buildMenu.cleanPanels.good'),
          bad: t('buildMenu.cleanPanels.bad'),
          icon: GAME_ICONS.solarPanel,
          recommendedRole: 'ENGINEER',
        },
        {
          id: 'build-repair-water',
          title: t('buildMenu.repairWater.title'),
          good: t('buildMenu.repairWater.good'),
          bad: t('buildMenu.repairWater.bad'),
          icon: GAME_ICONS.wrench,
          recommendedRole: 'ENGINEER',
        },
        {
          id: 'build-shield-habitat',
          title: t('buildMenu.shieldHabitat.title'),
          good: t('buildMenu.shieldHabitat.good'),
          bad: t('buildMenu.shieldHabitat.bad'),
          icon: GAME_ICONS.shield,
          recommendedRole: 'MEDIC',
        },
      ];
    } else if (this.activeBottomMenu === 'EXPLORE') {
      title = t('exploreMenu.title');
      subtitle = t('exploreMenu.subtitle');
      items = [
        {
          id: 'explore-rover-ice',
          title: t('exploreMenu.roverIce.title'),
          good: t('exploreMenu.roverIce.good'),
          bad: t('exploreMenu.roverIce.bad'),
          icon: GAME_ICONS.rover,
          recommendedRole: 'SCIENTIST',
        },
        {
          id: 'explore-moxie-air',
          title: t('exploreMenu.moxieAir.title'),
          good: t('exploreMenu.moxieAir.good'),
          bad: t('exploreMenu.moxieAir.bad'),
          icon: GAME_ICONS.oxygen,
          recommendedRole: 'SCIENTIST',
        },
        {
          id: 'explore-walk-panels',
          title: t('exploreMenu.walkSolar.title'),
          good: t('exploreMenu.walkSolar.good'),
          bad: t('exploreMenu.walkSolar.bad'),
          icon: GAME_ICONS.footprints,
          recommendedRole: 'ENGINEER',
        },
      ];
    } else if (this.activeBottomMenu === 'CONTEXTUAL' && this.activeContextualMenu) {
      title = t(this.activeContextualMenu.target.titleKey);
      subtitle = t(this.activeContextualMenu.statusSummaryKey);
      items = this.activeContextualMenu.actions.map((act, idx) => ({
        id: `ctx-action-${idx}`,
        title: t(act.labelKey),
        good: t(act.goodKey),
        bad: t(act.badKey),
        icon: GAME_ICONS.wrench,
        recommendedRole: act.recommendedRole,
      }));
    }

    return `
      <div class="pointer-events-auto mx-auto mb-2 w-full max-w-3xl rounded-2xl bg-[#1f150e]/95 border-2 border-amber-400/80 p-4 shadow-[0_0_40px_rgba(0,0,0,0.9)] backdrop-blur-md z-30">
        <div class="flex items-center justify-between border-b border-amber-500/30 pb-2 mb-3">
          <div>
            <h3 class="text-base sm:text-lg font-black uppercase tracking-wider text-amber-300">
              ${title}
            </h3>
            <p class="text-xs font-bold text-amber-100/80">
              ${subtitle}
            </p>
          </div>
          <button
            id="btn-close-popover"
            class="min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-200 border border-amber-500/40 flex items-center justify-center"
          >
            ${GAME_ICONS.close}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${items
            .map((item) => {
              const hasRoleBonus = item.recommendedRole === this.selectedRole;
              return `
                <button
                  data-popover-action="${item.id}"
                  class="flex flex-col justify-between text-left rounded-xl bg-slate-950/90 hover:bg-slate-900 border-2 ${
                    hasRoleBonus ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.35)]' : 'border-amber-500/40'
                  } p-3 transition-all active:scale-95"
                >
                  <div>
                    <div class="flex items-center gap-2.5 mb-2">
                      <div class="w-10 h-10 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 text-slate-950 flex items-center justify-center shadow">
                        ${item.icon}
                      </div>
                      <span class="text-sm font-black uppercase tracking-wider text-white">
                        ${item.title}
                      </span>
                    </div>

                    <div class="rounded-lg bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-1.5 mb-1.5">
                      <span class="block text-[10px] font-black uppercase text-emerald-400">${t('consequences.goodLabel')}</span>
                      <span class="text-xs font-bold text-emerald-100">${item.good}</span>
                    </div>

                    <div class="rounded-lg bg-rose-950/60 border border-rose-500/40 px-2.5 py-1.5">
                      <span class="block text-[10px] font-black uppercase text-rose-400">${t('consequences.badLabel')}</span>
                      <span class="text-xs font-bold text-rose-100">${item.bad}</span>
                    </div>
                  </div>

                  ${
                    hasRoleBonus
                      ? `
                      <div class="mt-2 rounded-lg bg-amber-500/20 border border-amber-400/50 px-2 py-1 text-center text-[10px] font-black uppercase text-amber-300">
                        ${t('consequences.roleBonusLabel')}: ${this.getRoleTitle(this.selectedRole)}
                      </div>
                    `
                      : ''
                  }
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  /**
   * BARRA INFERIOR EN MODO CRISIS (Página 9 del PDF Astranoesis Interface)
   */
  private renderCrisisBottomBar(activeEvent: ActiveMissionEvent): string {
    return `
      <div class="w-full flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3">
        <div class="lg:w-80 rounded-2xl bg-[#1f150e]/95 border-2 border-amber-500/70 p-3.5 shadow-[0_6px_25px_rgba(0,0,0,0.9)]">
          <div class="flex items-center gap-2 text-amber-300 text-xs font-black uppercase tracking-wider mb-1">
            <span>${GAME_ICONS.info}</span>
            <span>${t('events.scientificFactLabel')}</span>
          </div>
          <p class="text-xs font-bold text-amber-100/95 leading-relaxed">
            ${t(activeEvent.scientificFactKey)}
          </p>
        </div>

        <div class="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
          ${activeEvent.options
            .map((opt) => {
              const isRoleMatch = opt.recommendedPlayerRole === this.selectedRole;
              return `
                <div class="flex flex-col items-center rounded-2xl bg-[#1a120b]/95 border-2 ${
                  isRoleMatch ? 'border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'border-amber-500/50'
                } p-2.5">
                  <button
                    data-event-option="${opt.id}"
                    ${this.activeTaskProgress ? 'disabled' : ''}
                    class="w-full min-h-[52px] px-4 py-2.5 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-sm sm:text-base uppercase tracking-wider border-2 border-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.5)] active:scale-95 transition-all"
                  >
                    ${t(opt.titleKey)}
                  </button>
                  <span class="mt-2 text-xs font-black uppercase tracking-wide text-amber-300 text-center">
                    ${t(opt.badgeTextKey)}
                  </span>
                  <p class="mt-1 text-[11px] font-semibold text-slate-200 text-center leading-snug">
                    ${t(opt.descriptionKey)}
                  </p>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  /**
   * BARRA INFERIOR EN MODO NORMAL:
   * - Oculta el Joystick/D-Pad si NO es dispositivo móvil/táctil (solo visible en móvil/tablet).
   * - En PC muestra accesos directos limpios de caminata e indicación de clic en el suelo / WASD.
   */
  private renderNormalBottomBar(): string {
    const showMobileJoystick = this.isTouchMobileDevice();
    const highlightStep3 =
      this.tutorialStep === 3
        ? 'ring-4 ring-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.85)] rounded-2xl p-1'
        : '';

    return `
      <div class="w-full flex flex-col md:flex-row items-center justify-between gap-3">
        
        ${
          showMobileJoystick
            ? `
            <!-- Izquierda (SOLO MÓVIL / TÁCTIL): Cruceta táctil para mover al astronauta principal -->
            <div class="flex items-center gap-2 bg-[#1a120b]/95 border-2 border-amber-500/50 rounded-2xl p-2 shadow-lg">
              <div class="grid grid-cols-3 gap-1 w-[108px] h-[108px]">
                <div></div>
                <button data-dpad="up" class="rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 text-amber-200 border border-amber-500/40 flex items-center justify-center">${GAME_ICONS.chevronUp}</button>
                <div></div>
                <button data-dpad="left" class="rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 text-amber-200 border border-amber-500/40 flex items-center justify-center">${GAME_ICONS.chevronLeft}</button>
                <button data-camera="commander" title="Centrar Astronauta" class="rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/50 flex items-center justify-center">${GAME_ICONS.targetDot}</button>
                <button data-dpad="right" class="rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 text-amber-200 border border-amber-500/40 flex items-center justify-center">${GAME_ICONS.chevronRight}</button>
                <div></div>
                <button data-dpad="down" class="rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-amber-500 active:text-slate-950 text-amber-200 border border-amber-500/40 flex items-center justify-center">${GAME_ICONS.chevronDown}</button>
                <div></div>
              </div>
            </div>
          `
            : `
            <!-- Izquierda (PC / ESCRITORIO): Sin joystick, botones rápidos de caminata y guía de clic -->
            <div class="hidden md:flex items-center gap-2 bg-[#1a120b]/95 border-2 border-amber-500/50 rounded-2xl px-3.5 py-2 shadow-lg">
              <span class="text-amber-400">${GAME_ICONS.footprints}</span>
              <div class="flex flex-col">
                <span class="text-[11px] font-bold text-amber-100">
                  ${t('taskProgress.pcControlsHint')}
                </span>
                <div class="flex items-center gap-2 mt-1">
                  <button data-walk-to="base" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-200 text-[11px] font-extrabold border border-amber-500/40">
                    ${t('navigation.walkToBase')}
                  </button>
                  <button data-walk-to="panels" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-200 text-[11px] font-extrabold border border-amber-500/40">
                    ${t('navigation.walkToPanels')}
                  </button>
                </div>
              </div>
            </div>
          `
        }

        <!-- Centro: 3 Grandes Botones Naranjas (EXPLORE, BUILD, CULTIVATE) -->
        <div class="flex flex-wrap items-center justify-center gap-3 ${highlightStep3}">
          <button
            data-main-action="EXPLORE"
            class="min-h-[56px] min-w-[145px] px-6 py-3 rounded-xl font-black text-base sm:text-lg uppercase tracking-wider border-2 transition-all active:scale-95 flex items-center justify-center gap-2 ${
              this.activeBottomMenu === 'EXPLORE'
                ? 'bg-amber-300 text-slate-950 border-white shadow-[0_0_25px_rgba(251,191,36,0.8)]'
                : 'bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 border-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
            }"
          >
            <span>${GAME_ICONS.compass}</span>
            <span>${t('actions.explore')}</span>
          </button>

          <button
            data-main-action="BUILD"
            class="min-h-[56px] min-w-[145px] px-6 py-3 rounded-xl font-black text-base sm:text-lg uppercase tracking-wider border-2 transition-all active:scale-95 flex items-center justify-center gap-2 ${
              this.activeBottomMenu === 'BUILD'
                ? 'bg-amber-300 text-slate-950 border-white shadow-[0_0_25px_rgba(251,191,36,0.8)]'
                : 'bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 border-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
            }"
          >
            <span>${GAME_ICONS.wrench}</span>
            <span>${t('actions.build')}</span>
          </button>

          <button
            data-main-action="CULTIVATE"
            class="min-h-[56px] min-w-[145px] px-6 py-3 rounded-xl font-black text-base sm:text-lg uppercase tracking-wider border-2 transition-all active:scale-95 flex items-center justify-center gap-2 ${
              this.activeBottomMenu === 'CULTIVATE'
                ? 'bg-amber-300 text-slate-950 border-white shadow-[0_0_25px_rgba(251,191,36,0.8)]'
                : 'bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 border-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
            }"
          >
            <span>${GAME_ICONS.leaf}</span>
            <span>${t('actions.cultivate')}</span>
          </button>
        </div>

        <!-- Derecha: Botones secundarios (Clima Espacial / Revisar Base) -->
        <div class="flex items-center gap-2 bg-[#1a120b]/95 border-2 border-amber-500/50 rounded-2xl p-2 shadow-lg">
          <button
            id="btn-simulate-weather"
            class="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2b1d12] hover:bg-amber-900/60 border border-amber-400/50 text-amber-200 text-xs font-extrabold uppercase tracking-wider active:scale-95 transition-all"
          >
            ${t('actions.spaceWeather')}
          </button>
          <button
            id="btn-check-base"
            class="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2b1d12] hover:bg-amber-900/60 border border-amber-400/50 text-amber-200 text-xs font-extrabold uppercase tracking-wider active:scale-95 transition-all"
          >
            ${t('actions.checkBase')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Modal de Guía Rápida
   */
  private renderGuideModal(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg rounded-3xl bg-[#1f150e] border-2 border-amber-400 p-6 shadow-2xl">
          <div class="flex items-center justify-between border-b border-amber-500/30 pb-3 mb-4">
            <h3 class="text-xl font-black uppercase tracking-wider text-amber-300">
              ${t('guide.title')}
            </h3>
            <button id="btn-close-guide" class="p-1.5 rounded-xl bg-slate-900 text-amber-200">
              ${GAME_ICONS.close}
            </button>
          </div>

          <div class="space-y-3 text-sm font-bold text-amber-100 mb-4">
            <div class="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30">
              ${t('guide.touchRotate')}
            </div>
            <div class="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30">
              ${t('guide.touchZoom')}
            </div>
            <div class="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30">
              ${t('guide.touchTap')}
            </div>
            <div class="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200">
              ${this.getRolePerk(this.selectedRole)}
            </div>
          </div>

          <div class="flex items-center justify-center gap-2 mb-4">
            ${this.renderLanguageSelectorPills()}
          </div>

          <button
            id="btn-close-guide-bottom"
            class="w-full min-h-[48px] rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 text-slate-950 font-black uppercase tracking-widest"
          >
            ${t('guide.close')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 6A: YOU WIN (Página 10 del PDF Astranoesis Interface)
   */
  private renderVictoryScreen(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center overflow-hidden bg-[#04060c] p-6 select-none">
        <div class="pointer-events-none absolute inset-0 opacity-35" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 64px 64px;"></div>
        <div class="pointer-events-none absolute -bottom-[52vw] left-1/2 -translate-x-1/2 w-[140vw] h-[75vw] rounded-[100%] bg-[radial-gradient(circle_at_50%_15%,_#fde047_0%,_#ea580c_40%,_#431407_85%)] shadow-[0_-35px_120px_rgba(249,115,22,0.85)]"></div>

        <div class="relative z-10 my-auto text-center max-w-2xl px-6 py-10 rounded-3xl bg-slate-950/80 border-2 border-emerald-400/70 backdrop-blur-md shadow-[0_0_60px_rgba(16,185,129,0.4)]">
          <h2
            class="text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-[0.14em] text-emerald-400 mb-4"
            style="text-shadow: 0 6px 0 #065f46, 0 12px 30px rgba(16,185,129,0.7);"
          >
            ${t('endScreens.youWin')}
          </h2>
          <p class="text-lg sm:text-2xl font-black uppercase text-white mb-3">
            ${t('endScreens.winSubtitle')}
          </p>
          <p class="text-sm sm:text-base font-bold text-emerald-100/90 mb-8">
            ${t('endScreens.winSummary')}
          </p>

          <button
            id="btn-restart-mission"
            class="min-h-[58px] min-w-[240px] px-10 py-4 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-lg sm:text-xl uppercase tracking-widest border-2 border-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.65)] active:scale-95 transition-all"
          >
            ${t('endScreens.startOver')}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * PANTALLA 6B: GAME OVER (Página 11 del PDF Astranoesis Interface)
   */
  private renderGameOverScreen(): string {
    return `
      <div class="pointer-events-auto fixed inset-0 z-50 flex flex-col justify-between items-center overflow-hidden bg-[#04060c] p-6 select-none">
        <div class="pointer-events-none absolute inset-0 opacity-35" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 64px 64px;"></div>
        <div class="pointer-events-none absolute -bottom-[52vw] left-1/2 -translate-x-1/2 w-[140vw] h-[75vw] rounded-[100%] bg-[radial-gradient(circle_at_50%_15%,_#fde047_0%,_#ea580c_40%,_#431407_85%)] shadow-[0_-35px_120px_rgba(239,68,68,0.85)]"></div>

        <div class="relative z-10 my-auto text-center max-w-2xl px-6 py-10 rounded-3xl bg-slate-950/80 border-2 border-rose-500/70 backdrop-blur-md shadow-[0_0_60px_rgba(239,68,68,0.45)]">
          <h2
            class="text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-[0.12em] text-rose-500 mb-4"
            style="text-shadow: 0 6px 0 #7f1d1d, 0 12px 30px rgba(239,68,68,0.75);"
          >
            ${t('endScreens.gameOver')}
          </h2>
          <p class="text-lg sm:text-2xl font-black uppercase text-white mb-3">
            ${t('endScreens.loseSubtitle')}
          </p>
          <p class="text-sm sm:text-base font-bold text-rose-100/90 mb-8">
            ${t('endScreens.loseHint')}
          </p>

          <button
            id="btn-restart-mission"
            class="min-h-[58px] min-w-[240px] px-10 py-4 rounded-xl bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 hover:from-amber-200 hover:to-orange-500 text-slate-950 font-black text-lg sm:text-xl uppercase tracking-widest border-2 border-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.65)] active:scale-95 transition-all"
          >
            ${t('endScreens.startOver')}
          </button>
        </div>
      </div>
    `;
  }

  private mountKhipu3D(): void {
    const container = document.getElementById('khipu-3d-canvas-container');
    if (!container) return;

    this.khipuController.mountToContainer(container);
    this.khipuController.syncState(
      this.resourceEngine.getResources(),
      this.resourceEngine.getCurrentAct()
    );
  }

  private goToIntroScene(sceneNum: 1 | 2 | 3 | 4): void {
    if (this.introAutoTimer !== null) {
      window.clearTimeout(this.introAutoTimer);
      this.introAutoTimer = null;
    }
    this.introSceneIndex = sceneNum;
    this.screenState = 'INTRO_STORY';
    this.sceneManager.playIntroSceneCamera(sceneNum);
    this.spaceAudio.startAmbientIntroScore(sceneNum);
    this.renderHUD();
  }

  private finishIntroToRoleSelect(): void {
    if (this.introAutoTimer !== null) {
      window.clearTimeout(this.introAutoTimer);
      this.introAutoTimer = null;
    }
    this.spaceAudio.stopAmbientIntroScore();
    this.sceneManager.setAtmosphericDustLevel(this.resourceEngine.getModifiers().solarDustFactor);
    this.sceneManager.getAnimationController().setRecyclerAlert(false);
    this.screenState = 'ROLE_SELECT';
    this.renderHUD();
  }

  private bindIntroStoryEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.locale as SupportedLocale;
        void changeLanguage(loc);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-intro-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.introGoto) as 1 | 2 | 3 | 4;
        this.goToIntroScene(idx);
      });
    });

    document.getElementById('btn-intro-mute')?.addEventListener('click', () => {
      this.spaceAudio.toggleMute();
      if (!this.spaceAudio.getMuted()) {
        this.spaceAudio.startAmbientIntroScore(this.introSceneIndex);
      }
      this.renderHUD();
    });

    document.getElementById('btn-intro-skip')?.addEventListener('click', () => {
      this.finishIntroToRoleSelect();
    });

    document.getElementById('btn-intro-prev')?.addEventListener('click', () => {
      if (this.introSceneIndex > 1) {
        this.goToIntroScene((this.introSceneIndex - 1) as 1 | 2 | 3 | 4);
      }
    });

    document.getElementById('btn-intro-next')?.addEventListener('click', () => {
      if (this.introSceneIndex < 4) {
        this.goToIntroScene((this.introSceneIndex + 1) as 1 | 2 | 3 | 4);
      }
    });

    document.getElementById('btn-intro-finish')?.addEventListener('click', () => {
      this.finishIntroToRoleSelect();
    });
  }

  /**
   * Eventos de las pantallas de bienvenida y selección de rol
   */
  private bindOnboardingEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.locale as SupportedLocale;
        void changeLanguage(loc);
      });
    });

    document.getElementById('btn-splash-start')?.addEventListener('click', () => {
      // Al pulsar START, arranca la Intro Cinematográfica de 4 escenas en primera persona
      this.goToIntroScene(1);
    });

    document.getElementById('btn-welcome-back')?.addEventListener('click', () => {
      this.screenState = 'SPLASH';
      this.renderHUD();
    });

    document.getElementById('btn-welcome-next')?.addEventListener('click', () => {
      this.screenState = 'ROLE_SELECT';
      this.renderHUD();
    });

    document.getElementById('btn-roles-back')?.addEventListener('click', () => {
      this.goToIntroScene(4);
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-select-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.selectRole as PlayerSpecialtyRole;
        this.selectedRole = role;
        this.isRoleRandomlyAssigned = false;
        this.resourceEngine.updateModifiers({ playerRole: role });
        this.sceneManager.setPlayerRoleBadge(role);
        this.screenState = 'ROLE_CONFIRM';
        this.renderHUD();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-random-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.assignRandomRole();
      });
    });

    document.getElementById('btn-confirm-change-role')?.addEventListener('click', () => {
      this.screenState = 'ROLE_SELECT';
      this.renderHUD();
    });

    document.getElementById('btn-confirm-start-day1')?.addEventListener('click', () => {
      this.screenState = 'PLAYING';
      if (!this.hasCompletedTutorial) {
        this.tutorialStep = 1;
      }
      this.sceneManager.focusQuickPreset('base');
      this.renderHUD();
    });
  }

  /**
   * Eventos del HUD principal de juego
   */
  private bindHudEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.locale as SupportedLocale;
        void changeLanguage(loc);
      });
    });

    // Controles del Tutorial Interactivo
    document.getElementById('btn-tutorial-skip')?.addEventListener('click', () => {
      this.tutorialStep = null;
      this.hasCompletedTutorial = true;
      this.renderHUD();
    });

    document.getElementById('btn-tutorial-next')?.addEventListener('click', () => {
      if (this.tutorialStep !== null && this.tutorialStep < 4) {
        this.tutorialStep = (this.tutorialStep + 1) as 1 | 2 | 3 | 4;
        if (this.tutorialStep === 2) {
          this.sceneManager.focusQuickPreset('base');
        } else if (this.tutorialStep === 3) {
          this.activeBottomMenu = 'CULTIVATE';
        }
      } else {
        this.tutorialStep = null;
        this.hasCompletedTutorial = true;
      }
      this.renderHUD();
    });

    document.getElementById('btn-switch-role')?.addEventListener('click', () => {
      this.screenState = 'ROLE_SELECT';
      this.renderHUD();
    });

    document.getElementById('btn-advance-sol')?.addEventListener('click', () => {
      if (this.tutorialStep === 4) {
        this.tutorialStep = null;
        this.hasCompletedTutorial = true;
      }
      this.advanceSol();
    });

    document.getElementById('btn-toggle-khipu-mobile')?.addEventListener('click', () => {
      this.isMobileKhipuOpen = !this.isMobileKhipuOpen;
      this.renderHUD();
    });
    document.getElementById('btn-close-khipu-mobile')?.addEventListener('click', () => {
      this.isMobileKhipuOpen = false;
      this.renderHUD();
    });

    document.getElementById('btn-open-guide')?.addEventListener('click', () => {
      this.isGuideModalOpen = true;
      this.renderHUD();
    });
    document.getElementById('btn-close-guide')?.addEventListener('click', () => {
      this.isGuideModalOpen = false;
      this.renderHUD();
    });
    document.getElementById('btn-close-guide-bottom')?.addEventListener('click', () => {
      this.isGuideModalOpen = false;
      this.renderHUD();
    });

    document.getElementById('btn-dismiss-feedback')?.addEventListener('click', () => {
      this.eventSystem.clearLastFeedback();
      this.renderHUD();
    });

    document.getElementById('btn-close-popover')?.addEventListener('click', () => {
      this.activeBottomMenu = 'NONE';
      this.renderHUD();
    });

    // Pines de estaciones
    this.root.querySelectorAll<HTMLButtonElement>('[data-station-pin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.activeTaskProgress) return;
        const pinId = btn.dataset.stationPin;
        const action = btn.dataset.stationAction as 'CULTIVATE' | 'BUILD' | 'EXPLORE' | 'BASE';
        if (pinId === 'pin-solar') {
          this.sceneManager.navigateUnitToStation('solar-panels');
          this.activeBottomMenu = 'BUILD';
        } else if (pinId === 'pin-rover') {
          this.sceneManager.navigateUnitToStation('rover-bay');
          this.activeBottomMenu = 'EXPLORE';
        } else if (pinId === 'pin-greenhouse') {
          this.sceneManager.navigateUnitToStation('tambo-alfa');
          this.activeBottomMenu = 'CULTIVATE';
        } else if (action === 'BUILD') {
          this.sceneManager.navigateUnitToStation('water-recycler');
          this.activeBottomMenu = 'BUILD';
        } else {
          this.sceneManager.navigateUnitToStation('tambo-alfa');
          this.activeBottomMenu = 'CULTIVATE';
        }
        this.renderHUD();
      });
    });

    // 3 Botones Principales Inferiores: EXPLORE, BUILD, CULTIVATE
    this.root.querySelectorAll<HTMLButtonElement>('[data-main-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.activeTaskProgress) return;
        const menu = btn.dataset.mainAction as BottomDrawerMenu;
        this.activeBottomMenu = this.activeBottomMenu === menu ? 'NONE' : menu;
        if (this.missionStepIndex === 1 && menu === 'CULTIVATE') {
          this.missionStepIndex = 2;
        }
        this.renderHUD();
      });
    });

    // Ejecutar acciones del Popover con simulación física real
    this.root.querySelectorAll<HTMLButtonElement>('[data-popover-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const actionId = btn.dataset.popoverAction;
        if (!actionId || this.activeTaskProgress) return;
        this.executePopoverAction(actionId);
      });
    });

    // Botones de decisión de Evento de Crisis con simulación física real
    this.root.querySelectorAll<HTMLButtonElement>('[data-event-option]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const optId = btn.dataset.eventOption;
        if (!optId || this.activeTaskProgress) return;
        const activeEvt = this.eventSystem.getActiveEvent();
        const opt = activeEvt?.options.find((o) => o.id === optId);
        const sol = this.resourceEngine.getCurrentSol();
        const telemetry = this.nasaService.getTelemetryForSol(sol);

        let stationId: QuickStationId = 'tambo-alfa';
        let pose: AstronautPoseState = 'WORKING';
        let helperRole: 'ENGINEER' | 'SCIENTIST' | 'MEDIC' = 'ENGINEER';

        if (optId.includes('panel') || optId.includes('wind')) {
          stationId = 'solar-panels';
          pose = 'SWEEPING_PANELS';
          helperRole = 'ENGINEER';
        } else if (optId.includes('recycler') || optId.includes('water')) {
          stationId = 'water-recycler';
          pose = 'REPAIRING_PIPES';
          helperRole = 'ENGINEER';
        } else if (optId.includes('rover')) {
          stationId = 'rover-jezero';
          pose = 'SCANNING_ROCKS';
          helperRole = 'SCIENTIST';
        } else {
          stationId = 'tambo-alfa';
          pose = 'WORKING';
          helperRole = 'MEDIC';
        }

        this.sceneManager.executePhysicalTask({
          id: optId,
          titleKey: opt?.titleKey ?? 'actions.build',
          stationId,
          pose,
          helperRole,
          durationSeconds: 2.3,
          effectColorHex: 0xf59e0b,
          onComplete: () => {
            this.eventSystem.resolveActiveEvent(
              optId,
              this.resourceEngine,
              this.sceneManager,
              telemetry
            );
            this.renderHUD();
          },
        });
      });
    });

    // Botones secundarios: Clima Espacial y Revisar Base
    document.getElementById('btn-simulate-weather')?.addEventListener('click', () => {
      if (this.activeTaskProgress) return;
      const sol = this.resourceEngine.getCurrentSol();
      const telemetry = this.nasaService.getTelemetryForSol(sol);
      this.eventSystem.triggerEventById(
        'EVENT_A_DUST_STORM',
        sol,
        this.resourceEngine,
        this.sceneManager,
        telemetry
      );
      this.spaceAudio.playAlertBeep();
      this.renderHUD();
    });

    document.getElementById('btn-check-base')?.addEventListener('click', () => {
      if (this.activeTaskProgress) return;
      this.sceneManager.focusQuickPreset('base');
      this.activeBottomMenu = 'BUILD';
      this.renderHUD();
    });

    // Caminata rápida a estaciones
    this.root.querySelectorAll<HTMLButtonElement>('[data-walk-to]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dest = btn.dataset.walkTo as 'base' | 'panels';
        this.sceneManager.navigateUnitToStation(dest === 'panels' ? 'solar-panels' : 'tambo-alfa');
      });
    });

    // Centrar cámara en el astronauta
    this.root.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sceneManager.focusQuickPreset('base');
      });
    });

    // Cruceta táctil D-Pad (solo montada en dispositivos móviles/táctiles)
    const dpadMap: Record<string, { x: number; z: number }> = {
      up: { x: 0, z: -1 },
      down: { x: 0, z: 1 },
      left: { x: -1, z: 0 },
      right: { x: 1, z: 0 },
    };

    this.root.querySelectorAll<HTMLButtonElement>('[data-dpad]').forEach((btn) => {
      const dir = btn.dataset.dpad;
      if (!dir || !dpadMap[dir]) return;
      const vec = dpadMap[dir];

      const startMove = (e: Event) => {
        e.preventDefault();
        this.sceneManager.getTouchNavigation().cancelAstronautTarget();
        this.sceneManager.getTouchNavigation().setThumbDirection(vec.x, vec.z);
      };
      const stopMove = (e: Event) => {
        e.preventDefault();
        this.sceneManager.getTouchNavigation().setThumbDirection(0, 0);
      };

      btn.addEventListener('pointerdown', startMove);
      btn.addEventListener('pointerup', stopMove);
      btn.addEventListener('pointerleave', stopMove);
      btn.addEventListener('pointercancel', stopMove);

      this.dpadCleanup.push(() => {
        btn.removeEventListener('pointerdown', startMove);
        btn.removeEventListener('pointerup', stopMove);
        btn.removeEventListener('pointerleave', stopMove);
        btn.removeEventListener('pointercancel', stopMove);
      });
    });

    // Reiniciar misión
    document.getElementById('btn-restart-mission')?.addEventListener('click', () => {
      this.resourceEngine.reset();
      this.eventSystem.reset();
      this.sceneManager.setAtmosphericDustLevel(0.08);
      this.sceneManager.getAnimationController().setRecyclerAlert(false);
      this.screenState = 'ROLE_SELECT';
      this.renderHUD();
    });
  }

  /**
   * Ejecuta la acción seleccionada desplazando físicamente al Astronauta (o al Rover) y al NPC especialista
   * hasta la estación y ejecutando la animación de trabajo antes de otorgar los recursos.
   */
  private executePopoverAction(actionId: string): void {
    const sol = this.resourceEngine.getCurrentSol();
    const telemetry = this.nasaService.getTelemetryForSol(sol);
    const mods = this.resourceEngine.getModifiers();
    const role = this.selectedRole;

    this.activeBottomMenu = 'NONE';
    if (this.tutorialStep === 3) {
      this.tutorialStep = 4;
    }
    this.renderHUD();

    if (actionId.startsWith('ctx-action-') && this.activeContextualMenu) {
      const idx = parseInt(actionId.replace('ctx-action-', ''), 10);
      const act = this.activeContextualMenu.actions[idx];
      if (!act) return;

      const cat = this.activeContextualMenu.target.category;
      const stationId: QuickStationId =
        cat === 'solar-array-east' || cat === 'solar-array-west'
          ? 'solar-panels'
          : cat === 'water-recycler'
          ? 'water-recycler'
          : cat === 'science-node' || cat === 'mars-rover'
          ? 'rover-jezero'
          : 'tambo-alfa';

      const pose: AstronautPoseState =
        stationId === 'solar-panels'
          ? 'SWEEPING_PANELS'
          : stationId === 'water-recycler'
          ? 'REPAIRING_PIPES'
          : stationId === 'rover-jezero'
          ? 'SCANNING_ROCKS'
          : 'WATERING_CROPS';

      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: act.labelKey,
        stationId,
        pose,
        helperRole: act.recommendedRole === 'ENGINEER' ? 'ENGINEER' : act.recommendedRole === 'MEDIC' ? 'MEDIC' : 'SCIENTIST',
        durationSeconds: 2.4,
        effectColorHex: 0x38bdf8,
        onComplete: () => {
          act.execute();
          this.advanceMissionStepAfterTask();
        },
      });
      return;
    }

    if (actionId === 'cultivate-water') {
      const bonus = role === 'SCIENTIST' ? 1.3 : 1.0;
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'cultivateMenu.water.title',
        stationId: 'tambo-alfa',
        pose: 'WATERING_CROPS',
        helperRole: 'SCIENTIST',
        durationSeconds: 2.4,
        effectColorHex: 0x10b981,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            hydroponicGrowthPercent: Math.min(100, Math.round(mods.hydroponicGrowthPercent + 15 * bonus)),
            biomassHealthIndex: 100,
          });
          this.resourceEngine.applyImmediateResourceDelta({ water: -6, oxygen: 3.2 * bonus }, telemetry);
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'cultivate-harvest') {
      const bonus = role === 'MEDIC' ? 1.3 : 1.0;
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'cultivateMenu.harvest.title',
        stationId: 'tambo-alfa',
        pose: 'WATERING_CROPS',
        helperRole: 'SCIENTIST',
        durationSeconds: 2.4,
        effectColorHex: 0x84cc16,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            hydroponicGrowthPercent: Math.min(100, mods.hydroponicGrowthPercent + 10),
            scrap: mods.scrap + 10,
          });
          this.resourceEngine.applyImmediateResourceDelta({ oxygen: 3.5 * bonus, energy: -450 }, telemetry);
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'cultivate-inspect') {
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'cultivateMenu.inspect.title',
        stationId: 'tambo-alfa',
        pose: 'SCANNING_ROCKS',
        helperRole: 'MEDIC',
        durationSeconds: 2.2,
        effectColorHex: 0x38bdf8,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            hydroponicGrowthPercent: Math.min(100, mods.hydroponicGrowthPercent + 8),
          });
          this.resourceEngine.applyImmediateResourceDelta({ energy: -250, radiation: -250 }, telemetry);
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'build-clean-panels') {
      const isEng = role === 'ENGINEER';
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'buildMenu.cleanPanels.title',
        stationId: 'solar-panels',
        pose: 'SWEEPING_PANELS',
        helperRole: 'ENGINEER',
        durationSeconds: 2.6,
        effectColorHex: 0xfbbf24,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            solarDustFactor: 0.02,
            exteriorEquipmentSecured: true,
            scrap: Math.max(0, mods.scrap - (isEng ? 2 : 5)),
          });
          this.sceneManager.setAtmosphericDustLevel(0.02);
          this.resourceEngine.applyImmediateResourceDelta(
            { energy: isEng ? 2400 : 1700, oxygen: -0.4 },
            telemetry
          );
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'build-repair-water') {
      const isEng = role === 'ENGINEER';
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'buildMenu.repairWater.title',
        stationId: 'water-recycler',
        pose: 'REPAIRING_PIPES',
        helperRole: 'ENGINEER',
        durationSeconds: 2.6,
        effectColorHex: 0x38bdf8,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            isWaterRecyclerBroken: false,
            waterRecoveryEfficiency: 0.98,
            metal: Math.max(0, mods.metal - (isEng ? 2 : 4)),
          });
          this.sceneManager.getAnimationController().setRecyclerAlert(false);
          this.resourceEngine.applyImmediateResourceDelta(
            { water: isEng ? 20 : 14, energy: -600 },
            telemetry
          );
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'build-shield-habitat') {
      const isMed = role === 'MEDIC';
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'buildMenu.shieldHabitat.title',
        stationId: 'tambo-alfa',
        pose: 'REPAIRING_PIPES',
        helperRole: 'MEDIC',
        durationSeconds: 2.4,
        effectColorHex: 0xa855f7,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            radiationShieldingFactor: 0.9,
            metal: Math.max(0, mods.metal - 6),
          });
          this.resourceEngine.applyImmediateResourceDelta(
            { radiation: isMed ? -700 : -450, energy: -500 },
            telemetry
          );
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'explore-rover-ice') {
      const isSci = role === 'SCIENTIST';
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'exploreMenu.roverIce.title',
        stationId: 'rover-jezero',
        pose: 'SCANNING_ROCKS',
        helperRole: 'SCIENTIST',
        durationSeconds: 2.6,
        effectColorHex: 0x38bdf8,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            metal: mods.metal + (isSci ? 6 : 4),
          });
          this.resourceEngine.applyImmediateResourceDelta(
            { water: isSci ? 24 : 16, energy: -750 },
            telemetry
          );
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'explore-moxie-air') {
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'exploreMenu.moxieAir.title',
        stationId: 'tambo-alfa',
        pose: 'SCANNING_ROCKS',
        helperRole: 'SCIENTIST',
        durationSeconds: 2.3,
        effectColorHex: 0x38bdf8,
        onComplete: () => {
          this.resourceEngine.updateModifiers({ moxieActive: true });
          this.resourceEngine.applyImmediateResourceDelta({ oxygen: 3.6, energy: -550 }, telemetry);
          this.advanceMissionStepAfterTask();
        },
      });
    } else if (actionId === 'explore-walk-panels') {
      this.sceneManager.executePhysicalTask({
        id: actionId,
        titleKey: 'exploreMenu.walkSolar.title',
        stationId: 'solar-panels',
        pose: 'SWEEPING_PANELS',
        helperRole: 'ENGINEER',
        durationSeconds: 2.4,
        effectColorHex: 0xfbbf24,
        onComplete: () => {
          this.resourceEngine.updateModifiers({
            solarDustFactor: Math.max(0.03, mods.solarDustFactor - 0.3),
          });
          this.resourceEngine.applyImmediateResourceDelta({ energy: 1100, oxygen: -0.3 }, telemetry);
          this.advanceMissionStepAfterTask();
        },
      });
    }
  }

  private advanceMissionStepAfterTask(): void {
    if (this.missionStepIndex < 3) {
      this.missionStepIndex = 3;
    }
    this.renderHUD();
  }
}

export function createMissionHud(
  root: HTMLElement,
  sceneManager: SceneManager,
  nasaService: NasaDataService,
  resourceEngine: ResourceEngine,
  eventSystem: EventSystem
): MissionHudController {
  return new UIManager(root, sceneManager, nasaService, resourceEngine, eventSystem);
}
export { KhipuController };
