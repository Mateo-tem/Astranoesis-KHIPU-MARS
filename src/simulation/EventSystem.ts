import { CrewRole, MissionEventId, NasaTelemetrySnapshot, PlayerSpecialtyRole } from '@/core/types';
import { InteractiveTarget, SceneManager } from '@/world';
import { ResourceEngine } from './ResourceEngine';
import { NASA_SCIENTIFIC_DATA } from '@/core/constants';

export interface EventDecisionOption {
  id: string;
  titleKey: string;
  descriptionKey: string;
  badgeTextKey: string;
  specialistRole: CrewRole;
  recommendedPlayerRole: PlayerSpecialtyRole;
  execute: (engine: ResourceEngine, sceneManager: SceneManager, telemetry: NasaTelemetrySnapshot) => string;
}

export interface ActiveMissionEvent {
  id: MissionEventId;
  sol: number;
  titleKey: string;
  subtitleKey: string;
  scientificFactKey: string;
  severity: 'WARNING' | 'CRITICAL';
  specialistRole: CrewRole;
  options: EventDecisionOption[];
}

export interface ContextualSpecialistAction {
  id: string;
  labelKey: string;
  goodKey: string;
  badKey: string;
  recommendedRole: PlayerSpecialtyRole;
  execute: () => { feedbackKey: string };
}

export interface ContextualSpecialistMenu {
  target: InteractiveTarget;
  specialistRole: CrewRole;
  specialistNameKey: string;
  specialistBadgeColorHex: string;
  statusSummaryKey: string;
  scientificPrincipleKey: string;
  actions: ContextualSpecialistAction[];
}

export class EventSystem {
  private activeEvent: ActiveMissionEvent | null = null;
  private resolvedEventSols: Set<string> = new Set();
  private lastFeedbackKey: string | null = null;

  public getActiveEvent(): ActiveMissionEvent | null {
    return this.activeEvent;
  }

  public getLastFeedbackKey(): string | null {
    return this.lastFeedbackKey;
  }

  public clearLastFeedback(): void {
    this.lastFeedbackKey = null;
  }

  /**
   * Evalúa si el Día actual dispara un evento programado (A, B, C o D) y sincroniza la escena 3D
   */
  public evaluateSolEvent(
    sol: number,
    scheduledEventId: MissionEventId | undefined,
    engine: ResourceEngine,
    sceneManager: SceneManager,
    telemetry: NasaTelemetrySnapshot
  ): ActiveMissionEvent | null {
    const eventKey = `${sol}:${scheduledEventId ?? 'NONE'}`;
    if (!scheduledEventId || this.resolvedEventSols.has(eventKey)) {
      return this.activeEvent;
    }

    return this.triggerEventById(scheduledEventId, sol, engine, sceneManager, telemetry);
  }

  /**
   * Dispara manualmente o por calendario uno de los eventos documentados (A, B, C o D)
   */
  public triggerEventById(
    eventId: MissionEventId,
    sol: number,
    engine: ResourceEngine,
    sceneManager: SceneManager,
    telemetry: NasaTelemetrySnapshot
  ): ActiveMissionEvent {
    const animCtrl = sceneManager.getAnimationController();

    if (eventId === 'EVENT_A_DUST_STORM') {
      const stormDust = Math.max(0.76, engine.getModifiers().solarDustFactor);
      engine.updateModifiers({
        solarDustFactor: stormDust,
        exteriorEquipmentSecured: false,
      });
      sceneManager.setAtmosphericDustLevel(stormDust);
      engine.recalculateDailyRates(telemetry);

      this.activeEvent = {
        id: 'EVENT_A_DUST_STORM',
        sol,
        titleKey: 'events.eventA.title',
        subtitleKey: 'events.eventA.subtitle',
        scientificFactKey: 'events.eventA.fact',
        severity: 'WARNING',
        specialistRole: 'FLIGHT_ENGINEER',
        options: [
          {
            id: 'divert-energy',
            titleKey: 'events.eventA.opt1.title',
            descriptionKey: 'events.eventA.opt1.desc',
            badgeTextKey: 'events.eventA.opt1.badge',
            specialistRole: 'COMMANDER_PLAYER',
            recommendedPlayerRole: 'COMMANDER',
            execute: (eng, _scene, tel) => {
              const roleBonus = eng.getModifiers().playerRole === 'COMMANDER' ? 1.25 : 1.0;
              eng.updateModifiers({
                exteriorEquipmentSecured: true,
                powerRationingActive: true,
                hydroponicGrowthPercent: Math.max(25, eng.getModifiers().hydroponicGrowthPercent - 8),
              });
              eng.applyImmediateResourceDelta({ oxygen: 2.5 * roleBonus, energy: 900 * roleBonus }, tel);
              return 'events.eventA.opt1.feedback';
            },
          },
          {
            id: 'clean-solar-panels',
            titleKey: 'events.eventA.opt2.title',
            descriptionKey: 'events.eventA.opt2.desc',
            badgeTextKey: 'events.eventA.opt2.badge',
            specialistRole: 'FLIGHT_ENGINEER',
            recommendedPlayerRole: 'ENGINEER',
            execute: (eng, scene, tel) => {
              const isEngineer = eng.getModifiers().playerRole === 'ENGINEER';
              eng.updateModifiers({ solarDustFactor: 0.04, exteriorEquipmentSecured: true });
              scene.setAtmosphericDustLevel(0.04);
              eng.applyImmediateResourceDelta(
                {
                  energy: isEngineer ? 2600 : 1800,
                  oxygen: isEngineer ? -0.4 : -0.9,
                },
                tel
              );
              return 'events.eventA.opt2.feedback';
            },
          },
          {
            id: 'wait-inside-base',
            titleKey: 'events.eventA.opt3.title',
            descriptionKey: 'events.eventA.opt3.desc',
            badgeTextKey: 'events.eventA.opt3.badge',
            specialistRole: 'MEDIC_OFFICER',
            recommendedPlayerRole: 'MEDIC',
            execute: (eng, _scene, tel) => {
              const isMedic = eng.getModifiers().playerRole === 'MEDIC';
              eng.updateModifiers({ powerRationingActive: true });
              eng.applyImmediateResourceDelta(
                {
                  energy: isMedic ? -800 : -1400,
                  radiation: -350,
                },
                tel
              );
              return 'events.eventA.opt3.feedback';
            },
          },
        ],
      };
    } else if (eventId === 'EVENT_B_WATER_RECYCLER') {
      engine.updateModifiers({
        isWaterRecyclerBroken: true,
        waterRecoveryEfficiency: NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.WATER_RECYCLER_DEGRADED_RECOVERY,
      });
      animCtrl.setRecyclerAlert(true);
      engine.recalculateDailyRates(telemetry);

      this.activeEvent = {
        id: 'EVENT_B_WATER_RECYCLER',
        sol,
        titleKey: 'events.eventB.title',
        subtitleKey: 'events.eventB.subtitle',
        scientificFactKey: 'events.eventB.fact',
        severity: 'CRITICAL',
        specialistRole: 'FLIGHT_ENGINEER',
        options: [
          {
            id: 'repair-recycler-now',
            titleKey: 'events.eventB.opt1.title',
            descriptionKey: 'events.eventB.opt1.desc',
            badgeTextKey: 'events.eventB.opt1.badge',
            specialistRole: 'FLIGHT_ENGINEER',
            recommendedPlayerRole: 'ENGINEER',
            execute: (eng, scene, tel) => {
              const isEngineer = eng.getModifiers().playerRole === 'ENGINEER';
              eng.updateModifiers({
                isWaterRecyclerBroken: false,
                waterRecoveryEfficiency:
                  NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.WATER_RECYCLER_NOMINAL_RECOVERY,
                metal: Math.max(0, eng.getModifiers().metal - (isEngineer ? 2 : 5)),
              });
              scene.getAnimationController().setRecyclerAlert(false);
              eng.applyImmediateResourceDelta(
                {
                  energy: isEngineer ? -600 : -1100,
                  water: isEngineer ? 18 : 12,
                },
                tel
              );
              return 'events.eventB.opt1.feedback';
            },
          },
          {
            id: 'save-water-mode',
            titleKey: 'events.eventB.opt2.title',
            descriptionKey: 'events.eventB.opt2.desc',
            badgeTextKey: 'events.eventB.opt2.badge',
            specialistRole: 'COMMANDER_PLAYER',
            recommendedPlayerRole: 'COMMANDER',
            execute: (eng, scene, tel) => {
              eng.updateModifiers({
                isWaterRecyclerBroken: false,
                waterRecoveryEfficiency:
                  NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.WATER_RECYCLER_DEGRADED_RECOVERY,
                hydroponicGrowthPercent: Math.max(30, eng.getModifiers().hydroponicGrowthPercent - 8),
              });
              scene.getAnimationController().setRecyclerAlert(false);
              eng.recalculateDailyRates(tel);
              return 'events.eventB.opt2.feedback';
            },
          },
          {
            id: 'rover-ice-search',
            titleKey: 'events.eventB.opt3.title',
            descriptionKey: 'events.eventB.opt3.desc',
            badgeTextKey: 'events.eventB.opt3.badge',
            specialistRole: 'SCIENCE_OFFICER',
            recommendedPlayerRole: 'SCIENTIST',
            execute: (eng, _scene, tel) => {
              const isSci = eng.getModifiers().playerRole === 'SCIENTIST';
              eng.applyImmediateResourceDelta(
                {
                  water: isSci ? 28 : 20,
                  energy: -1100,
                },
                tel
              );
              return 'events.eventB.opt3.feedback';
            },
          },
        ],
      };
    } else if (eventId === 'EVENT_C_SOLAR_STORM_SEP') {
      engine.recalculateDailyRates(telemetry);

      this.activeEvent = {
        id: 'EVENT_C_SOLAR_STORM_SEP',
        sol,
        titleKey: 'events.eventC.title',
        subtitleKey: 'events.eventC.subtitle',
        scientificFactKey: 'events.eventC.fact',
        severity: 'CRITICAL',
        specialistRole: 'MEDIC_OFFICER',
        options: [
          {
            id: 'shelter-tambo-alfa',
            titleKey: 'events.eventC.opt1.title',
            descriptionKey: 'events.eventC.opt1.desc',
            badgeTextKey: 'events.eventC.opt1.badge',
            specialistRole: 'MEDIC_OFFICER',
            recommendedPlayerRole: 'MEDIC',
            execute: (eng, _scene, tel) => {
              const isMedic = eng.getModifiers().playerRole === 'MEDIC';
              eng.updateModifiers({ radiationShieldingFactor: 0.9, powerRationingActive: true });
              eng.applyImmediateResourceDelta({ radiation: isMedic ? -850 : -550 }, tel);
              return 'events.eventC.opt1.feedback';
            },
          },
          {
            id: 'cancel-walks',
            titleKey: 'events.eventC.opt2.title',
            descriptionKey: 'events.eventC.opt2.desc',
            badgeTextKey: 'events.eventC.opt2.badge',
            specialistRole: 'COMMANDER_PLAYER',
            recommendedPlayerRole: 'COMMANDER',
            execute: (eng, _scene, tel) => {
              eng.updateModifiers({ radiationShieldingFactor: 0.72 });
              eng.applyImmediateResourceDelta({ oxygen: 2.2, energy: 700, radiation: -300 }, tel);
              return 'events.eventC.opt2.feedback';
            },
          },
          {
            id: 'keep-working-outside',
            titleKey: 'events.eventC.opt3.title',
            descriptionKey: 'events.eventC.opt3.desc',
            badgeTextKey: 'events.eventC.opt3.badge',
            specialistRole: 'FLIGHT_ENGINEER',
            recommendedPlayerRole: 'ENGINEER',
            execute: (eng, _scene, tel) => {
              eng.updateModifiers({ radiationShieldingFactor: 0.25 });
              eng.applyImmediateResourceDelta({ energy: 1600, radiation: 1500 }, tel);
              return 'events.eventC.opt3.feedback';
            },
          },
        ],
      };
    } else {
      this.activeEvent = {
        id: 'EVENT_D_DUST_DEVILS',
        sol,
        titleKey: 'events.eventD.title',
        subtitleKey: 'events.eventD.subtitle',
        scientificFactKey: 'events.eventD.fact',
        severity: 'WARNING',
        specialistRole: 'SCIENCE_OFFICER',
        options: [
          {
            id: 'wind-self-clean',
            titleKey: 'events.eventD.opt1.title',
            descriptionKey: 'events.eventD.opt1.desc',
            badgeTextKey: 'events.eventD.opt1.badge',
            specialistRole: 'FLIGHT_ENGINEER',
            recommendedPlayerRole: 'ENGINEER',
            execute: (eng, scene, tel) => {
              const cleanedDust = Math.max(0.03, eng.getModifiers().solarDustFactor - 0.4);
              eng.updateModifiers({ solarDustFactor: cleanedDust });
              scene.setAtmosphericDustLevel(cleanedDust);
              eng.applyImmediateResourceDelta({ energy: 1400 }, tel);
              return 'events.eventD.opt1.feedback';
            },
          },
          {
            id: 'study-with-rover',
            titleKey: 'events.eventD.opt2.title',
            descriptionKey: 'events.eventD.opt2.desc',
            badgeTextKey: 'events.eventD.opt2.badge',
            specialistRole: 'SCIENCE_OFFICER',
            recommendedPlayerRole: 'SCIENTIST',
            execute: (eng, _scene, tel) => {
              const isSci = eng.getModifiers().playerRole === 'SCIENTIST';
              const nextGrowth = Math.min(100, eng.getModifiers().hydroponicGrowthPercent + (isSci ? 15 : 10));
              eng.updateModifiers({ hydroponicGrowthPercent: nextGrowth });
              eng.applyImmediateResourceDelta({ oxygen: 2.8, energy: -450 }, tel);
              return 'events.eventD.opt2.feedback';
            },
          },
          {
            id: 'close-greenhouse-vents',
            titleKey: 'events.eventD.opt3.title',
            descriptionKey: 'events.eventD.opt3.desc',
            badgeTextKey: 'events.eventD.opt3.badge',
            specialistRole: 'MEDIC_OFFICER',
            recommendedPlayerRole: 'MEDIC',
            execute: (eng, _scene, tel) => {
              eng.applyImmediateResourceDelta({ water: 10, energy: -250 }, tel);
              return 'events.eventD.opt3.feedback';
            },
          },
        ],
      };
    }

    return this.activeEvent;
  }

  /**
   * Resuelve el evento activo aplicando la opción elegida por el jugador
   */
  public resolveActiveEvent(
    optionId: string,
    engine: ResourceEngine,
    sceneManager: SceneManager,
    telemetry: NasaTelemetrySnapshot
  ): string | null {
    if (!this.activeEvent) return null;

    const option = this.activeEvent.options.find((o) => o.id === optionId);
    if (!option) return null;

    const feedbackKey = option.execute(engine, sceneManager, telemetry);
    this.resolvedEventSols.add(`${this.activeEvent.sol}:${this.activeEvent.id}`);
    this.activeEvent = null;
    this.lastFeedbackKey = feedbackKey;
    return feedbackKey;
  }

  /**
   * Construye el menú contextual inmediato de especialista cuando el niño toca/clica directamente
   * sobre los paneles solares, el reciclador de agua, el Rover, Tambo Alfa o un Science_Node en 3D
   */
  public getContextualSpecialistMenu(
    target: InteractiveTarget,
    engine: ResourceEngine,
    sceneManager: SceneManager,
    telemetry: NasaTelemetrySnapshot
  ): ContextualSpecialistMenu {
    const mods = engine.getModifiers();

    // 1. PANELES SOLARES -> Especialista: Ingeniero
    if (target.category === 'solar-array-east' || target.category === 'solar-array-west') {
      return {
        target,
        specialistRole: 'FLIGHT_ENGINEER',
        specialistNameKey: 'crew.flightEngineer',
        specialistBadgeColorHex: '#eab308',
        statusSummaryKey: 'buildMenu.subtitle',
        scientificPrincipleKey: 'events.eventA.fact',
        actions: [
          {
            id: 'direct-clean-solar',
            labelKey: 'buildMenu.cleanPanels.title',
            goodKey: 'buildMenu.cleanPanels.good',
            badKey: 'buildMenu.cleanPanels.bad',
            recommendedRole: 'ENGINEER',
            execute: () => {
              const isEng = mods.playerRole === 'ENGINEER';
              engine.updateModifiers({
                solarDustFactor: 0.02,
                exteriorEquipmentSecured: true,
                evaHoursToday: mods.evaHoursToday + 1.0,
                scrap: Math.max(0, mods.scrap - (isEng ? 2 : 5)),
              });
              sceneManager.setAtmosphericDustLevel(0.02);
              engine.applyImmediateResourceDelta({ energy: isEng ? 2200 : 1600, oxygen: -0.4 }, telemetry);
              this.lastFeedbackKey = 'events.eventA.opt2.feedback';
              return { feedbackKey: 'events.eventA.opt2.feedback' };
            },
          },
          {
            id: 'direct-shield-base',
            labelKey: 'buildMenu.shieldHabitat.title',
            goodKey: 'buildMenu.shieldHabitat.good',
            badKey: 'buildMenu.shieldHabitat.bad',
            recommendedRole: 'MEDIC',
            execute: () => {
              engine.updateModifiers({
                radiationShieldingFactor: 0.88,
                metal: Math.max(0, mods.metal - 6),
              });
              engine.applyImmediateResourceDelta({ energy: -500, radiation: -450 }, telemetry);
              this.lastFeedbackKey = 'events.eventC.opt1.feedback';
              return { feedbackKey: 'events.eventC.opt1.feedback' };
            },
          },
        ],
      };
    }

    // 2. SISTEMA DE AGUA -> Especialista: Ingeniero
    if (target.category === 'water-recycler') {
      return {
        target,
        specialistRole: 'FLIGHT_ENGINEER',
        specialistNameKey: 'crew.flightEngineer',
        specialistBadgeColorHex: '#eab308',
        statusSummaryKey: 'buildMenu.subtitle',
        scientificPrincipleKey: 'events.eventB.fact',
        actions: [
          {
            id: 'direct-repair-recycler',
            labelKey: 'buildMenu.repairWater.title',
            goodKey: 'buildMenu.repairWater.good',
            badKey: 'buildMenu.repairWater.bad',
            recommendedRole: 'ENGINEER',
            execute: () => {
              const isEng = mods.playerRole === 'ENGINEER';
              engine.updateModifiers({
                isWaterRecyclerBroken: false,
                waterRecoveryEfficiency:
                  NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.ISS_ECLSS_2023_MAX_WATER_RECOVERY,
                metal: Math.max(0, mods.metal - (isEng ? 2 : 4)),
              });
              sceneManager.getAnimationController().setRecyclerAlert(false);
              engine.applyImmediateResourceDelta({ energy: -600, water: isEng ? 18 : 12 }, telemetry);
              this.lastFeedbackKey = 'events.eventB.opt1.feedback';
              return { feedbackKey: 'events.eventB.opt1.feedback' };
            },
          },
        ],
      };
    }

    // 3. ROVER, CRÁTER JEZERO O ESTACIÓN METEOROLÓGICA -> Especialista: Científico
    if (
      target.category === 'science-node' ||
      target.category === 'mars-rover' ||
      target.category === 'meda-station'
    ) {
      return {
        target,
        specialistRole: 'SCIENCE_OFFICER',
        specialistNameKey: 'crew.scienceOfficer',
        specialistBadgeColorHex: '#3b82f6',
        statusSummaryKey: 'exploreMenu.subtitle',
        scientificPrincipleKey: 'events.eventD.fact',
        actions: [
          {
            id: 'direct-rover-ice',
            labelKey: 'exploreMenu.roverIce.title',
            goodKey: 'exploreMenu.roverIce.good',
            badKey: 'exploreMenu.roverIce.bad',
            recommendedRole: 'SCIENTIST',
            execute: () => {
              const isSci = mods.playerRole === 'SCIENTIST';
              engine.updateModifiers({
                metal: mods.metal + (isSci ? 6 : 4),
              });
              engine.applyImmediateResourceDelta({ water: isSci ? 22 : 16, energy: -700 }, telemetry);
              this.lastFeedbackKey = 'events.eventB.opt3.feedback';
              return { feedbackKey: 'events.eventB.opt3.feedback' };
            },
          },
          {
            id: 'direct-moxie-air',
            labelKey: 'exploreMenu.moxieAir.title',
            goodKey: 'exploreMenu.moxieAir.good',
            badKey: 'exploreMenu.moxieAir.bad',
            recommendedRole: 'SCIENTIST',
            execute: () => {
              engine.updateModifiers({ moxieActive: true });
              engine.applyImmediateResourceDelta({ oxygen: 3.4, energy: -550 }, telemetry);
              this.lastFeedbackKey = 'events.eventD.opt2.feedback';
              return { feedbackKey: 'events.eventD.opt2.feedback' };
            },
          },
        ],
      };
    }

    // 4. HÁBITAT CENTRAL / INVERNADERO -> Cultivo y Refugio
    return {
      target,
      specialistRole: 'COMMANDER_PLAYER',
      specialistNameKey: 'crew.commander',
      specialistBadgeColorHex: '#f97316',
      statusSummaryKey: 'cultivateMenu.subtitle',
      scientificPrincipleKey: 'events.eventC.fact',
      actions: [
        {
          id: 'direct-water-crops',
          labelKey: 'cultivateMenu.water.title',
          goodKey: 'cultivateMenu.water.good',
          badKey: 'cultivateMenu.water.bad',
          recommendedRole: 'SCIENTIST',
          execute: () => {
            const isSci = mods.playerRole === 'SCIENTIST';
            const nextGrowth = Math.min(100, mods.hydroponicGrowthPercent + (isSci ? 20 : 15));
            engine.updateModifiers({ hydroponicGrowthPercent: nextGrowth, biomassHealthIndex: 100 });
            engine.applyImmediateResourceDelta({ water: -6, oxygen: 3.0 }, telemetry);
            this.lastFeedbackKey = 'events.eventD.opt2.feedback';
            return { feedbackKey: 'events.eventD.opt2.feedback' };
          },
        },
        {
          id: 'direct-harvest-crops',
          labelKey: 'cultivateMenu.harvest.title',
          goodKey: 'cultivateMenu.harvest.good',
          badKey: 'cultivateMenu.harvest.bad',
          recommendedRole: 'MEDIC',
          execute: () => {
            const nextGrowth = Math.min(100, mods.hydroponicGrowthPercent + 10);
            engine.updateModifiers({
              hydroponicGrowthPercent: nextGrowth,
              scrap: mods.scrap + 8,
            });
            engine.applyImmediateResourceDelta({ oxygen: 3.5, energy: -400 }, telemetry);
            this.lastFeedbackKey = 'events.eventD.opt2.feedback';
            return { feedbackKey: 'events.eventD.opt2.feedback' };
          },
        },
        {
          id: 'direct-inspect-crops',
          labelKey: 'cultivateMenu.inspect.title',
          goodKey: 'cultivateMenu.inspect.good',
          badKey: 'cultivateMenu.inspect.bad',
          recommendedRole: 'COMMANDER',
          execute: () => {
            const nextGrowth = Math.min(100, mods.hydroponicGrowthPercent + 8);
            engine.updateModifiers({ hydroponicGrowthPercent: nextGrowth });
            engine.applyImmediateResourceDelta({ energy: -250, radiation: -200 }, telemetry);
            this.lastFeedbackKey = 'events.eventC.opt1.feedback';
            return { feedbackKey: 'events.eventC.opt1.feedback' };
          },
        },
      ],
    };
  }

  public reset(): void {
    this.activeEvent = null;
    this.resolvedEventSols.clear();
    this.lastFeedbackKey = null;
  }
}
