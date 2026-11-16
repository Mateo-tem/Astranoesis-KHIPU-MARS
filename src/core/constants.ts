/**
 * Reglas técnicas inamovibles de ASTRANOESIS (Blender 5.3.0 & Documentación Oficial NASA Space Apps 2026)
 */

export const MISSION_CONFIG = {
  HABITAT_NAME: 'TAMBO ALFA',
  HABITAT_CODE: 'EF3GF3EW',
  TOTAL_SOLS: 28,
  TOTAL_ACTS: 4,
  SOLS_PER_ACT: 7,
  TERRAIN_SIZE_METERS: 360,
  SOL_DURATION_TEXT: '24 h 39 min 35 s',
  HISTORICAL_START_DATE: '2024-05-08',
  HISTORICAL_END_DATE: '2024-06-04',
  EMERGENCY_TIMER_SECONDS: 180, // 3 a 5 min solo en eventos críticos
} as const;

/**
 * Inventario de rutas de Assets 3D en /public/models/
 */
export const ASSET_PATHS = {
  TERRAIN: '/models/jezero-terrain.glb',
  TAMBO_ALFA: '/models/tambo-alfa.glb',
  SOLAR_PANELS: '/models/solar-panels-array.glb',
  MARS_ROVER: '/models/mars-rover.glb',
  EXTERNAL_EQUIPMENT: '/models/external-equipment.glb',
  KHIPU_TRACKER: '/models/khipu-tracker.glb',
  ASTRONAUT: '/models/astronaut-character.glb',
} as const;

/**
 * Coordenadas espaciales en el terreno Jezero (360x360m)
 */
export const JEZERO_COORDINATES = {
  CRATER_CENTER: { x: 68, z: -62 },
  PADS: {
    Pad_01_Tambo_Alfa_Core: { x: 0, z: 0 },
    Pad_02_Solar_Array_East: { x: 14, z: 2 },
    Pad_03_Solar_Array_West: { x: -14, z: 2 },
    Pad_04_Rover_Bay_South: { x: 0, z: -12 },
  },
  NASA_MEDA_WEATHER_STATION: { x: 18, z: -14 },
} as const;

/**
 * Nombres exactos de nodos y materiales en los modelos GLB (Blender 5.3.0)
 */
export const BLENDER_NODES = {
  TERRAIN: {
    PADS: [
      'Pad_01_Tambo_Alfa_Core',
      'Pad_02_Solar_Array_East',
      'Pad_03_Solar_Array_West',
      'Pad_04_Rover_Bay_South',
    ],
    WEATHER_STATION: 'NASA_MEDA_Weather_Station',
    SCIENCE_NODES: [
      'Science_Node_01_Jezero_Crater_Core',
      'Science_Node_02_Jezero_Delta_Deposit',
      'Science_Node_03_Neretva_Riverbed',
      'Science_Node_04_North_Butte',
    ],
  },
  TAMBO_ALFA: {
    ROOT: 'Tambo_Alfa_Root',
    ANTENNA_DISH: 'Chaski_Antenna_Dish',
  },
  SOLAR_ARRAY: {
    SURFACES: [
      'Solar_Cells_Surface_01',
      'Solar_Cells_Surface_02',
      'Solar_Cells_Surface_03',
    ],
    MATERIAL: 'Mat_Celda_Solar',
  },
  MARS_ROVER: {
    MAST_PIVOT: 'Rover_Mast_Pivot',
    ARM_PIVOT: 'Rover_Arm_Pivot',
    WHEELS: [
      'Rover_Wheel_FL',
      'Rover_Wheel_ML',
      'Rover_Wheel_RL',
      'Rover_Wheel_FR',
      'Rover_Wheel_MR',
      'Rover_Wheel_RR',
    ],
  },
  EXTERNAL_EQUIPMENT: {
    WATER_RECYCLER: 'Water_Recycler_Skid',
    RECYCLER_BEACON: 'Recycler_Status_Beacon',
    EVA_STATION: 'EVA_Maintenance_Station',
    DIAGNOSTIC_TRIPOD: 'Field_Diagnostic_Tripod',
  },
  KHIPU: {
    CORDS: ['Water', 'Oxygen', 'Energy', 'Radiation'] as const,
    ACT_KNOTS: ['Act_Knot_01', 'Act_Knot_02', 'Act_Knot_03', 'Act_Knot_04'] as const,
    getKnotName: (resource: 'Water' | 'Oxygen' | 'Energy' | 'Radiation', level: 1 | 2 | 3 | 4 | 5) =>
      `Knot_${resource}_L${level}`,
  },
  ASTRONAUT: {
    PIVOTS: {
      HIP_L: 'Hip_Pivot_L',
      HIP_R: 'Hip_Pivot_R',
      SHOULDER_L: 'Shoulder_Pivot_L',
      SHOULDER_R: 'Shoulder_Pivot_R',
      HEAD_NECK: 'Head_Neck_Pivot',
    },
    ROLE_MATERIAL: 'Mat_Insignia_Rol',
    ROLE_COLORS: {
      COMMANDER_PLAYER: 0xf97316, // Naranja (Comandante - Jugador)
      SCIENCE_OFFICER: 0x3b82f6,  // Azul (Oficial Científico NPC)
      FLIGHT_ENGINEER: 0xeab308,  // Amarillo (Ingeniero de Vuelo NPC)
    },
  },
} as const;

/**
 * Parámetros científicos documentados en el reporte NASA de ASTRANOESIS:
 * - MEDA (Nature Geoscience, 9 enero 2023 - primeros 250 soles en Jezero)
 * - DONKI / CCMC & Curiosity RAD (Tormenta solar histórica 8–20 mayo 2024)
 * - InSight & ECLSS (Reciclaje de agua 98% hito EEI / 85% -> 70%, Energía 5000 -> 500 Wh/sol)
 * - OSDR (VEG-05 OSD-773 & XROOTS OSD-766), NASA-STD-3001, MOXIE y RadLab
 */
export const NASA_SCIENTIFIC_DATA = {
  DONKI_OFFICIAL_IDS: {
    FLR: ['FLR 30551', 'FLR 30557', 'FLR 30601', 'FLR 30605', 'FLR 30666'] as const,
    CME: ['CME 30640', 'CME 30619', 'CME 30670'] as const,
    SEP: [
      'SEP 30677',
      'SEP 30684',
      'SEP 30714',
      'SEP 30717',
      'SEP 30811',
      'SEP 30817',
      'SEP 30825',
    ] as const,
    GST: ['GST 30693', 'GST 30798'] as const,
  },
  MEDA_JEZERO: {
    SURFACE_TEMP_MIN_C: -83.0,
    SURFACE_TEMP_MAX_C: 5.0,
    AIR_TEMP_MIN_C: -83.0,
    AIR_TEMP_MAX_C: -23.0,
    PRESSURE_MIN_PA: 625,
    PRESSURE_MAX_PA: 761,
    PRESSURE_NOMINAL_RANGE_PA: [680, 750] as const,
    WIND_TYPICAL_MIN_MS: 0.5,
    WIND_TYPICAL_MAX_MS: 12.2,
    AFTERNOON_MAX_WIND_MS: 7.0,
    NOON_MAX_GUST_MS: 25.0,
    UV_TOTAL_MIN_WM2: 26.9,
    UV_TOTAL_MAX_WM2: 42.3,
    UVA_RANGE_WM2: [21.4, 33.7] as const,
    UVB_RANGE_WM2: [4.21, 6.45] as const,
    UVC_RANGE_WM2: [1.39, 2.21] as const,
    MORNING_OPTICAL_DEPTH_TAU: 0.5,
    EVENING_OPTICAL_DEPTH_TAU: 0.4,
    CLEAR_SKY_TAU_RANGE: [0.1, 0.2] as const,
    DUSTY_SKY_TAU_RANGE: [1.0, 3.0] as const,
    HEAVY_STORM_TAU_RANGE: [3.0, 9.0] as const,
    STORM_MAX_TAU: 2.8,
    NOON_TEMP_FLUCTUATION_K: 10.0,
    DEFAULT_AIR_MASS_M: 1.25,
  },
  MAY_2024_SOLAR_STORM: {
    X_CLASS_FLARES_COUNT: 12,
    M_CLASS_FLARES_COUNT: 80,
    CME_TYPE_R_COUNT: 1,
    CME_TYPE_O_COUNT: 8,
    CME_TYPE_C_COUNT: 14,
    KP_INDEX_RANGE: '7–9',
    KP_PEAK: 9,
    REFERENCE_RADIATION_UGY_DAY: 163,
    DAY1_RADLAB_ABSORBED_RATE_UGY_H: 8.75, // ~0.21 mGy acumulados Día 1 (210 µGy/d)
    DAY1_RADLAB_EQUIVALENT_RATE_USV_H: 26.67,
    DAY1_RADLAB_CUMULATIVE_MGY: 0.21,
    EVENT_AVERAGE_RADIATION_UGY_DAY: 1900,
    PEAK_RADIATION_MAY_20_UGY_DAY: 8100, // Sol 13 (20 de mayo de 2024) ~ 2 mSv/día (= 30 radiografías)
    PEAK_SOL_INDEX: 13,
  },
  CREW_HEALTH_BENCHMARKS: {
    DAILY_EXERCISE_TARGET_HOURS: 2.0, // 2 horas diarias en EEI (aeróbico + resistencia)
    BASE_CALORIES_KCAL_PER_DAY: 3035, // NASA-STD-3001 Vol 2 Rev F
    EXTRA_CALORIES_PER_EVA_HOUR: 200, // +200 kcal por hora adicional de EVA
    RECOMMENDED_SLEEP_HOURS: 8.5,     // Objetivo NASA de sueño por noche
    OBSERVED_ISS_AVG_SLEEP_HOURS: 7.33, // Promedio real medido (19 astronautas, 2,137 noches)
  },
  OSDR_CROP_EXPERIMENTS: {
    VEG05_DURATION_DAYS: 101, // 14 dic 2022 - 24 mar 2023 (OSD-773)
    VEG05_RED_SPECTRUM_LABEL: '90% Roja / 10% Azul',
    VEG05_BLUE_SPECTRUM_LABEL: '50% Roja / 50% Azul',
    XROOTS_SYSTEMS: ['HYDROPONICS', 'AEROPONICS'] as const, // OSD-766
  },
  ENGINEERING_BENCHMARKS: {
    INSIGHT_INITIAL_ENERGY_WH_SOL: 5000,
    INSIGHT_DUST_DEGRADED_WH_SOL: 500,
    FISSION_BACKUP_POWER_WH_SOL: 1800, // Respaldo nuclear / baterías críticas en tormenta
    ISS_ECLSS_2023_MAX_WATER_RECOVERY: 0.98, // Hito 98% recuperación de agua en la EEI (junio 2023)
    WATER_RECYCLER_NOMINAL_RECOVERY: 0.85, // 85% destilación de orina nominal
    WATER_RECYCLER_DEGRADED_RECOVERY: 0.70, // 70% tras fallo del Evento B
    MOXIE_TOTAL_PRODUCED_G: 122, // 122 g de O2 generados en Perseverance (2021-2023)
    MOXIE_PEAK_RATE_G_PER_HOUR: 12, // 12 g/h a >= 98% de pureza
    MOXIE_PURITY_PERCENT: 98,
    ECLSS_PER_PERSON_DAILY: {
      OXYGEN_KG: 0.8,
      WATER_KG: 2.5,
      FOOD_KG: 1.8,
      CO2_PRODUCED_KG: 1.14,
    },
  },
  EARTH_MARS_COMMUNICATION: {
    MIN_DISTANCE_MILLION_KM: 58, // 55-60 millones km -> ~3 min
    MAX_DISTANCE_MILLION_KM: 400, // 400 millones km -> 22-24 min
    MIN_ONE_WAY_DELAY_MINUTES: 3.2,
    MAX_ONE_WAY_DELAY_MINUTES: 24.0,
  },
} as const;

/**
 * Ley de Beer-Lambert para la atenuación solar por polvo atmosférico marciano (τ):
 * I = I0 * e^(-tau * m)
 */
export function computeBeerLambertSolarIntensity(
  initialIntensityI0: number,
  opticalDepthTau: number,
  airMassM: number = NASA_SCIENTIFIC_DATA.MEDA_JEZERO.DEFAULT_AIR_MASS_M
): number {
  const attenuation = Math.exp(-Math.max(0, opticalDepthTau) * Math.max(0.5, airMassM));
  return Number((initialIntensityI0 * attenuation).toFixed(2));
}
