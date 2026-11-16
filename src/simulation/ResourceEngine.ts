import {
  MISSION_CONFIG,
  NASA_SCIENTIFIC_DATA,
  computeBeerLambertSolarIntensity,
} from '@/core/constants';
import {
  KhipuResourceNode,
  NasaTelemetrySnapshot,
  PlayerSpecialtyRole,
  ResourceDelta,
  ResourceKey,
  ResourcesState,
  Veg05LightSpectrum,
  XrootsCultivationSystem,
} from '@/core/types';

export interface HabitatSystemsModifiers {
  /** Factor de polvo acumulado en los paneles solares [0 = limpio 5000 Wh/sol, 1 = cubierto 500 Wh/sol] */
  solarDustFactor: number;
  /** Si el reciclador de agua sufrió la avería del Evento B (85% -> 70% de recuperación) */
  isWaterRecyclerBroken: boolean;
  /** Tasa de recuperación actual del destilador de orina/condensado (0.98 hito EEI, 0.85 nominal, 0.70 degradado) */
  waterRecoveryEfficiency: number;
  /** Factor de protección radiológica activa (0.38 nominal casco Tambo Alfa, 0.88 en refugio subterráneo Evento C) */
  radiationShieldingFactor: number;
  /** Modo de ahorro energético (racionamiento de electricidad) */
  powerRationingActive: boolean;
  /** Respaldo de Fisión Nuclear / Baterías Críticas activo ante tormentas de polvo */
  fissionBackupActive: boolean;
  /** Procesador MOXIE activo (extrae O2 del CO2 atmosférico marciano al 98% de pureza, 12 g/h ref) */
  moxieActive: boolean;
  /** Equipos exteriores asegurados contra ráfagas de 25 m/s */
  exteriorEquipmentSecured: boolean;
  /** Progreso acumulado del cultivo sin suelo OSDR (0 a 100%) */
  hydroponicGrowthPercent: number;
  /** Salud de la biomasa en el domo agrícola (0 a 100%) */
  biomassHealthIndex: number;
  /** Espectro lumínico VEG-05 (OSD-773): 90% Roja / 10% Azul (más frutos) vs 50% Roja / 50% Azul (compacto/resistente) */
  veg05Spectrum: Veg05LightSpectrum;
  /** Sistema radicular XROOTS (OSD-766): Hidroponía (solución líquida) vs Aeroponía (vapor nutritivo, ahorra H2O) */
  xrootsSystem: XrootsCultivationSystem;
  /** Ejercicio físico diario de la tripulación (estándar EEI: 2.0 horas/día aeróbico + resistencia) */
  exerciseHoursPerDay: number;
  /** Horas de sueño programadas por noche (objetivo NASA: 8.5 h vs promedio real medido: 7.33 h) */
  sleepHoursPerNight: number;
  /** Horas de actividad extravehicular (EVA) en el Sol actual (+200 kcal/hora sobre las 3,035 kcal base) */
  evaHoursToday: number;
  /** Ingesta calórica diaria por astronauta (NASA-STD-3001: 3,035 kcal + 200 kcal * evaHoursToday) */
  dailyCaloriesPerAstronautKcal: number;
  /** Índice de condición física y cognitiva de la tripulación (0 a 100%) */
  crewFitnessIndex: number;
  /** Metal disponible para construir y reparar la colonia (inicia en 20) */
  metal: number;
  /** Chatarra / piezas de repuesto disponibles (inicia en 50) */
  scrap: number;
  /** Rol elegido por el jugador al iniciar la misión */
  playerRole: PlayerSpecialtyRole;
}

export interface SolSimulationReport {
  previousSol: number;
  newSol: number;
  act: 1 | 2 | 3 | 4;
  previousResources: ResourcesState;
  updatedResources: ResourcesState;
  missionStatus: 'ACTIVE' | 'VICTORY' | 'DEFEAT';
  defeatReasonKey?: string;
}

export class ResourceEngine {
  private currentSol = 1;
  private resources: ResourcesState;
  private modifiers: HabitatSystemsModifiers;
  private missionStatus: 'ACTIVE' | 'VICTORY' | 'DEFEAT' = 'ACTIVE';
  private defeatReasonKey?: string;

  constructor() {
    this.resources = this.createInitialResources();
    this.modifiers = this.createInitialModifiers();
  }

  private createInitialResources(): ResourcesState {
    return {
      water: {
        current: 180,
        capacity: 200,
        production: 11.9, // 85% recuperación sobre 14 L de ciclo diario
        consumption: 12.5, // 4 tripulantes (4 * 2.5 L = 10 L) + 2.5 L biodomo/electrólisis
        loss: 0.4,
        unit: 'L',
      },
      oxygen: {
        current: 45,
        capacity: 50,
        production: 3.45, // Electrólisis + fotosíntesis OSDR
        consumption: 3.2, // 4 tripulantes * 0.8 kg/sol (esquema NASA pág. 11)
        loss: 0.15,
        unit: 'kg',
      },
      energy: {
        current: 16500,
        capacity: 20000,
        production: NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.INSIGHT_INITIAL_ENERGY_WH_SOL, // 5,000 Wh/sol
        consumption: 4100, // Soporte vital ECLSS + control térmico + domo OSDR
        loss: 200,
        unit: 'Wh',
      },
      radiation: {
        current: 210, // Día 1 RadLab: 8.75 µGy/h * 24h = 210 µGy (0.21 mGy acumulados)
        capacity: 15000, // Umbral máximo acumulado tolerable en la misión (µGy)
        production: 210, // Dosis entrante RAD Día 1
        consumption: 80, // Atenuación por blindaje del hábitat Tambo Alfa
        loss: 35, // Recuperación biológica / margen dosimétrico diario
        unit: 'µGy',
      },
    };
  }

  private createInitialModifiers(): HabitatSystemsModifiers {
    return {
      solarDustFactor: 0.08,
      isWaterRecyclerBroken: false,
      waterRecoveryEfficiency: NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.WATER_RECYCLER_NOMINAL_RECOVERY, // 0.85
      radiationShieldingFactor: 0.38,
      powerRationingActive: false,
      fissionBackupActive: false,
      moxieActive: true,
      exteriorEquipmentSecured: false,
      hydroponicGrowthPercent: 15,
      biomassHealthIndex: 98,
      veg05Spectrum: 'RED_90_BLUE_10',
      xrootsSystem: 'HYDROPONICS',
      exerciseHoursPerDay: NASA_SCIENTIFIC_DATA.CREW_HEALTH_BENCHMARKS.DAILY_EXERCISE_TARGET_HOURS, // 2.0 h
      sleepHoursPerNight: NASA_SCIENTIFIC_DATA.CREW_HEALTH_BENCHMARKS.RECOMMENDED_SLEEP_HOURS, // 8.5 h
      evaHoursToday: 0,
      dailyCaloriesPerAstronautKcal: NASA_SCIENTIFIC_DATA.CREW_HEALTH_BENCHMARKS.BASE_CALORIES_KCAL_PER_DAY, // 3,035 kcal
      crewFitnessIndex: 98,
      metal: 20,
      scrap: 50,
      playerRole: 'SCIENTIST',
    };
  }

  /**
   * Ecuación Maestra inamovible por Sol:
   * R(t+1) = R(t) + P(t) - C(t) - L(t)
   */
  public static computeMasterEquation(delta: ResourceDelta): number {
    const nextVal = delta.current + delta.production - delta.consumption - delta.loss;
    return Math.max(0, Math.min(delta.capacity, Number(nextVal.toFixed(2))));
  }

  public getCurrentSol(): number {
    return this.currentSol;
  }

  public getCurrentAct(): 1 | 2 | 3 | 4 {
    return Math.min(
      MISSION_CONFIG.TOTAL_ACTS,
      Math.max(1, Math.ceil(this.currentSol / MISSION_CONFIG.SOLS_PER_ACT))
    ) as 1 | 2 | 3 | 4;
  }

  public getResources(): ResourcesState {
    return structuredClone(this.resources);
  }

  public getModifiers(): HabitatSystemsModifiers {
    return { ...this.modifiers };
  }

  public getMissionStatus(): { status: 'ACTIVE' | 'VICTORY' | 'DEFEAT'; reasonKey?: string } {
    return { status: this.missionStatus, reasonKey: this.defeatReasonKey };
  }

  /**
   * Actualiza los modificadores operativos del hábitat (polvo solar, estado del reciclador, refugio RAD, etc.)
   */
  public updateModifiers(partial: Partial<HabitatSystemsModifiers>): void {
    this.modifiers = {
      ...this.modifiers,
      ...partial,
    };
  }

  /**
   * Aplica un cambio inmediato sobre los recursos (ej. coste energético de una acción EVA o bono científico)
   */
  public applyImmediateResourceDelta(
    changes: Partial<Record<ResourceKey, number>>,
    recalculateRatesWithTelemetry?: NasaTelemetrySnapshot
  ): void {
    (Object.keys(changes) as ResourceKey[]).forEach((key) => {
      const deltaAmount = changes[key];
      if (typeof deltaAmount === 'number') {
        const res = this.resources[key];
        res.current = Math.max(0, Math.min(res.capacity, Number((res.current + deltaAmount).toFixed(2))));
      }
    });

    if (recalculateRatesWithTelemetry) {
      this.recalculateDailyRates(recalculateRatesWithTelemetry);
    }
  }

  /**
   * Recalcula P(t), C(t) y L(t) de los 4 recursos en función de la telemetría NASA del Sol actual
   * y del estado de ingeniería de Tambo Alfa (Ley de Beer-Lambert I = I0*e^(-tau*m), InSight 5000->500 Wh/sol,
   * Reciclador ECLSS 98%/85%->70%, MOXIE 12 g/h, VEG-05/XROOTS, Salud NASA-STD-3001 y RAD 8100 µGy/d)
   */
  public recalculateDailyRates(telemetry: NasaTelemetrySnapshot): void {
    // 0. Actualizar ingesta calórica diaria (NASA-STD-3001: 3,035 kcal + 200 kcal * horas EVA)
    this.modifiers.dailyCaloriesPerAstronautKcal =
      NASA_SCIENTIFIC_DATA.CREW_HEALTH_BENCHMARKS.BASE_CALORIES_KCAL_PER_DAY +
      Math.round(
        this.modifiers.evaHoursToday *
        NASA_SCIENTIFIC_DATA.CREW_HEALTH_BENCHMARKS.EXTRA_CALORIES_PER_EVA_HOUR
      );

    // 1. ENERGÍA (Wh): Ley de Beer-Lambert I = I0 * e^(-tau * m) + Polvo en celdas (InSight 5,000 -> 500 Wh/sol) + Respaldo Fisión
    const maxSolarWh = NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.INSIGHT_INITIAL_ENERGY_WH_SOL;
    const minSolarWh = NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.INSIGHT_DUST_DEGRADED_WH_SOL;
    const beerLambertTransmittance = computeBeerLambertSolarIntensity(
      1.0,
      telemetry.meda.atmosphericTau,
      telemetry.meda.airMassM
    );
    const tauAttenuation = Math.min(1, Math.max(0, 1 - beerLambertTransmittance));
    const effectiveDust = Math.min(1, Math.max(this.modifiers.solarDustFactor, tauAttenuation * 0.78));

    const solarEnergyProd = Math.round(maxSolarWh - effectiveDust * (maxSolarWh - minSolarWh));
    const fissionBackupWh = this.modifiers.fissionBackupActive
      ? NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.FISSION_BACKUP_POWER_WH_SOL
      : 0;

    const thermalDemandExtra = Math.round((telemetry.meda.tempFluctuationK - 9.5) * 180);
    const moxieEnergyLoad = this.modifiers.moxieActive ? 320 : 0;
    const aeroponicsPumpLoad = this.modifiers.xrootsSystem === 'AEROPONICS' ? 210 : 0;
    const baseEnergyConsumption = this.modifiers.powerRationingActive ? 3450 : 4100;
    const windEnergyLoss =
      telemetry.meda.windSpeedMs >= 20 && !this.modifiers.exteriorEquipmentSecured ? 620 : 180;

    this.resources.energy.production = solarEnergyProd + fissionBackupWh;
    this.resources.energy.consumption = Math.max(
      2800,
      baseEnergyConsumption + thermalDemandExtra + moxieEnergyLoad + aeroponicsPumpLoad
    );
    this.resources.energy.loss = windEnergyLoss;

    // 2. AGUA (L): Destilación ECLSS (98% hito EEI / 85% nominal -> 70% en Evento B) + Ahorro por Aeroponía XROOTS
    const dailyWaterCycleLiters = 14.0;
    const recoveryEff = this.modifiers.isWaterRecyclerBroken
      ? NASA_SCIENTIFIC_DATA.ENGINEERING_BENCHMARKS.WATER_RECYCLER_DEGRADED_RECOVERY
      : this.modifiers.waterRecoveryEfficiency;

    const xrootsWaterSaving = this.modifiers.xrootsSystem === 'AEROPONICS' ? 1.1 : 0;

    this.resources.water.production = Number((dailyWaterCycleLiters * recoveryEff).toFixed(2));
    this.resources.water.consumption = Number((12.2 - xrootsWaterSaving).toFixed(2));
    this.resources.water.loss = this.modifiers.isWaterRecyclerBroken ? 2.6 : 0.35;

    // 3. OXÍGENO (kg): Electrólisis H2O + MOXIE (CO2 atmosférico -> O2 al 98% pureza, 12 g/h ref) + Fotosíntesis VEG-05/XROOTS
    const hasEnoughEnergyAndWater =
      this.resources.energy.current > 2500 && this.resources.water.current > 25;
    const electrolysisO2 = hasEnoughEnergyAndWater ? 2.85 : 1.75;
    const moxieO2Prod = this.modifiers.moxieActive && this.resources.energy.current > 1800 ? 0.55 : 0;
    const osdrBonusO2 = telemetry.osdr.o2PhotosynthesisBonus;

    this.resources.oxygen.production = Number((electrolysisO2 + moxieO2Prod + osdrBonusO2).toFixed(2));
    this.resources.oxygen.consumption = 3.2; // 4 tripulantes * 0.8 kg/d
    this.resources.oxygen.loss = telemetry.meda.windSpeedMs >= 22 ? 0.32 : 0.14;

    // 4. RADIACIÓN (µGy): Dosis diaria DONKI/RAD vs blindaje de Tambo Alfa y condición biológica de la tripulación
    const incomingRad = telemetry.donkiRad.dailyRadiationUgy;
    const shieldedAmount = Math.round(incomingRad * this.modifiers.radiationShieldingFactor);
    const biologicalRecoveryBonus =
      this.modifiers.exerciseHoursPerDay >= 2.0 && this.modifiers.sleepHoursPerNight >= 8.0 ? 55 : 35;

    this.resources.radiation.production = incomingRad;
    this.resources.radiation.consumption = shieldedAmount;
    this.resources.radiation.loss = biologicalRecoveryBonus;
  }

  /**
   * Ejecuta el paso de simulación al siguiente Sol aplicando R(t+1) = R(t) + P(t) - C(t) - L(t)
   */
  public advanceSol(currentTelemetry: NasaTelemetrySnapshot): SolSimulationReport {
    const previousSol = this.currentSol;
    const previousResources = this.getResources();

    // Actualizar tasas con la telemetría del Sol actual antes de integrar
    this.recalculateDailyRates(currentTelemetry);

    // Aplicar ecuación maestra R(t+1) = R(t) + P(t) - C(t) - L(t) a los 4 recursos
    this.resources.water.current = ResourceEngine.computeMasterEquation(this.resources.water);
    this.resources.oxygen.current = ResourceEngine.computeMasterEquation(this.resources.oxygen);
    this.resources.energy.current = ResourceEngine.computeMasterEquation(this.resources.energy);
    this.resources.radiation.current = ResourceEngine.computeMasterEquation(this.resources.radiation);

    // Acumulación natural de polvo marciano en los paneles según opacidad atmosférica tau
    const dustDelta = currentTelemetry.meda.atmosphericTau > 1.2 ? 0.16 : 0.035;
    this.modifiers.solarDustFactor = Math.min(1, Number((this.modifiers.solarDustFactor + dustDelta).toFixed(3)));

    // Crecimiento progresivo del cultivo VEG-05 / XROOTS (OSDR OSD-773 & OSD-766)
    if (this.resources.water.current > 30 && this.resources.energy.current > 2000) {
      const spectrumGrowthRate = this.modifiers.veg05Spectrum === 'RED_90_BLUE_10' ? 3.8 : 2.9;
      this.modifiers.hydroponicGrowthPercent = Math.min(
        100,
        Number((this.modifiers.hydroponicGrowthPercent + spectrumGrowthRate).toFixed(1))
      );
      if (this.modifiers.veg05Spectrum === 'RED_50_BLUE_50') {
        this.modifiers.biomassHealthIndex = Math.min(100, this.modifiers.biomassHealthIndex + 2);
      }
    }

    // Actualizar condición física de la tripulación según ejercicio (2h EEI) y sueño (8.5h objetivo vs 7.33h real)
    const exerciseHealthy = this.modifiers.exerciseHoursPerDay >= 2.0;
    const sleepHealthy = this.modifiers.sleepHoursPerNight >= 8.0;
    const fitnessDelta = exerciseHealthy && sleepHealthy ? 1.5 : -2.5;
    this.modifiers.crewFitnessIndex = Math.max(
      40,
      Math.min(100, Math.round(this.modifiers.crewFitnessIndex + fitnessDelta))
    );

    // Restablecer modos temporales de un solo turno
    this.modifiers.powerRationingActive = false;
    this.modifiers.radiationShieldingFactor = 0.38;
    this.modifiers.evaHoursToday = 0;

    // Verificar condiciones de derrota o victoria
    if (this.resources.water.current <= 0) {
      this.missionStatus = 'DEFEAT';
      this.defeatReasonKey = 'simulation.defeat.water';
    } else if (this.resources.oxygen.current <= 0) {
      this.missionStatus = 'DEFEAT';
      this.defeatReasonKey = 'simulation.defeat.oxygen';
    } else if (this.resources.energy.current <= 0) {
      this.missionStatus = 'DEFEAT';
      this.defeatReasonKey = 'simulation.defeat.energy';
    } else if (this.resources.radiation.current >= this.resources.radiation.capacity) {
      this.missionStatus = 'DEFEAT';
      this.defeatReasonKey = 'simulation.defeat.radiation';
    } else if (this.currentSol >= MISSION_CONFIG.TOTAL_SOLS) {
      this.missionStatus = 'VICTORY';
    } else {
      this.currentSol += 1;
    }

    return {
      previousSol,
      newSol: this.currentSol,
      act: this.getCurrentAct(),
      previousResources,
      updatedResources: this.getResources(),
      missionStatus: this.missionStatus,
      defeatReasonKey: this.defeatReasonKey,
    };
  }

  /**
   * Calcula cuántos nudos (1 a 5) deben estar activos en cada cuerda del Khipu 3D (khipu-tracker.glb)
   */
  public getKhipuKnotLevels(): Record<KhipuResourceNode, 1 | 2 | 3 | 4 | 5> {
    const toLevel = (ratio: number): 1 | 2 | 3 | 4 | 5 => {
      const clamped = Math.max(1, Math.min(5, Math.ceil(ratio * 5)));
      return clamped as 1 | 2 | 3 | 4 | 5;
    };

    return {
      Water: toLevel(this.resources.water.current / this.resources.water.capacity),
      Oxygen: toLevel(this.resources.oxygen.current / this.resources.oxygen.capacity),
      Energy: toLevel(this.resources.energy.current / this.resources.energy.capacity),
      // Para radiación, más nudos indican mayor nivel de alerta/exposición acumulada
      Radiation: toLevel(this.resources.radiation.current / (this.resources.radiation.capacity * 0.65)),
    };
  }

  public reset(): void {
    this.currentSol = 1;
    this.resources = this.createInitialResources();
    this.modifiers = this.createInitialModifiers();
    this.missionStatus = 'ACTIVE';
    this.defeatReasonKey = undefined;
  }
}
