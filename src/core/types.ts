/**
 * Tipos centrales de ASTRANOESIS basados en el Reporte Oficial NASA Space Apps 2026
 * Ecuación Maestra por Sol: R(t+1) = R(t) + P(t) - C(t) - L(t)
 */

export type ResourceKey = 'water' | 'oxygen' | 'energy' | 'radiation';
export type KhipuResourceNode = 'Water' | 'Oxygen' | 'Energy' | 'Radiation';

/**
 *Las 8 Fases del Ciclo de Juego por Sol (definidas en el tablero de arquitectura)
 */
export type GameLoopPhase =
  | 'PHASE_0_ROLE_SELECTION'
  | 'PHASE_1_MISSION_BRIEFING'
  | 'PHASE_2_CREW_REPORT'
  | 'PHASE_3_KHIPU_ASSESSMENT'
  | 'PHASE_4_ENGINEERING_DECISION'
  | 'PHASE_5_SIMULATION'
  | 'PHASE_6_SCIENTIFIC_FEEDBACK'
  | 'PHASE_7_MISSION_PROGRESSION';

/**
 * Eventos / Desafíos Científicos Reales del Reporte Oficial
 */
export type MissionEventId =
  | 'EVENT_A_DUST_STORM'       // Tormenta/acumulación de polvo (InSight 5000 -> 500 Wh/sol)
  | 'EVENT_B_WATER_RECYCLER'   // Fallo en Water_Recycler_Skid (recuperación cae de 85% a 70%)
  | 'EVENT_C_SOLAR_STORM_SEP'  // Alerta DONKI/RAD (20 mayo 2024: pico de 8,100 µGy/día)
  | 'EVENT_D_DUST_DEVILS';     // Remolinos en Jezero (Sol 148 / Sol 215 SuperCam)

export interface ResourceDelta {
  /** R(t): Recurso disponible al inicio del Sol */
  current: number;
  /** Capacidad máxima del sistema (o umbral crítico de dosis radiológica) */
  capacity: number;
  /** P(t): Recurso producido o recuperado en el Sol */
  production: number;
  /** C(t): Recurso consumido en el Sol */
  consumption: number;
  /** L(t): Pérdidas por fallas o condiciones externas en el Sol */
  loss: number;
  /** Unidad científica: L (H2O), kg (O2), Wh (Energía), µGy/día (Radiación) */
  unit: 'L' | 'kg' | 'Wh' | 'µGy';
}

export type ResourcesState = Record<ResourceKey, ResourceDelta>;

export type Veg05LightSpectrum = 'RED_90_BLUE_10' | 'RED_50_BLUE_50';
export type XrootsCultivationSystem = 'HYDROPONICS' | 'AEROPONICS';

export interface NasaTelemetrySnapshot {
  sol: number; // 1..28 (8 de mayo al 4 de junio de 2024)
  earthDate: string;
  act: 1 | 2 | 3 | 4;
  meda: {
    windSpeedMs: number;          // 0.5 a 12.2 m/s habitual -> 25 m/s ráfagas al mediodía
    atmosphericTau: number;       // ~0.1-0.2 claro, ~0.5 matutina, 1-3 polvoriento, 3-9 tormenta
    airMassM: number;             // Masa de aire para Ley de Beer-Lambert I = I0 * e^(-tau * m)
    beerLambertTransmittance: number; // Factor e^(-tau * m) [0..1]
    tempFluctuationK: number;     // ~10 K cerca del mediodía
    temperatureCelsius: number;   // Temperatura del aire (-83 a -23 °C)
    surfaceTempMinC: number;      // Temperatura superficial mínima (-83 °C)
    surfaceTempMaxC: number;      // Temperatura superficial máxima (+5 °C)
    pressurePa: number;           // 625 a 761 Pa (680-750 Pa normal)
    uvTotalWm2: number;           // 26.9 a 42.3 W/m²
    uvaWm2: number;               // 21.4 a 33.7 W/m²
    uvbWm2: number;               // 4.21 a 6.45 W/m²
    uvcWm2: number;               // 1.39 a 2.21 W/m²
  };
  donkiRad: {
    dailyRadiationUgy: number;    // 163-210 µGy/día ref -> 1,900 prom evento -> 8,100 pico 20 mayo
    absorbedDoseRateUgyH: number; // Tasa de dosis absorbida RadLab (8.75 µGy/h Día 1 -> 337.5 µGy/h pico)
    equivalentDoseRateUsvH: number; // Tasa de dosis equivalente RadLab (26.67 µSv/h Día 1)
    cumulativeDoseMgy: number;    // Dosis acumulada en mGy (0.21 mGy Día 1)
    solarFlareClass: 'A' | 'B' | 'C' | 'M3.5' | 'X1.0' | 'X2.2' | 'X3.9';
    flrId?: string;               // FLR 30551, FLR 30557, FLR 30601, FLR 30605, FLR 30666
    cmeId?: string;               // CME 30640, CME 30619, CME 30670
    sepId?: string;               // SEP 30677, SEP 30684, SEP 30714, SEP 30717, SEP 30811, SEP 30817, SEP 30825
    gstId?: string;               // GST 30693, GST 30798
    kpIndex: number;              // Índice geomagnético Kp (hasta Kp = 9 el 10-12 mayo)
    cmeSpeedKms?: number;         // 870 km/s (8 mayo), 1263 km/s (13 mayo), 805 km/s (15 mayo)
    cmeAlertActive: boolean;
    gcrStatus: 'CONTINUOUS';
    speStatus: 'NONE' | 'ELEVATED' | 'CRITICAL_SEP';
    dosimeterActive: boolean;
  };
  osdr: {
    hydroponicGrowthPercent: number;
    o2PhotosynthesisBonus: number;
    biomassHealthIndex: number;
    veg05Spectrum: Veg05LightSpectrum;
    xrootsSystem: XrootsCultivationSystem;
  };
  comms: {
    earthMarsDistanceMillionKm: number; // 55-60M km min -> 400M km max
    oneWayDelayMinutes: number;         // ~3 min min -> 22-24 min max
  };
}

export type CrewRole =
  | 'COMMANDER_PLAYER'
  | 'SCIENCE_OFFICER'
  | 'FLIGHT_ENGINEER'
  | 'MEDIC_OFFICER';

export type PlayerSpecialtyRole = 'COMMANDER' | 'ENGINEER' | 'MEDIC' | 'SCIENTIST';
