import {
  MISSION_CONFIG,
  NASA_SCIENTIFIC_DATA,
  computeBeerLambertSolarIntensity,
} from '@/core/constants';
import {
  MissionEventId,
  NasaTelemetrySnapshot,
  Veg05LightSpectrum,
  XrootsCultivationSystem,
} from '@/core/types';

export interface SolHistoricalSchedule {
  sol: number;
  earthDate: string;
  act: 1 | 2 | 3 | 4;
  windSpeedMs: number;
  atmosphericTau: number;
  tempFluctuationK: number;
  temperatureCelsius: number;
  pressurePa: number;
  dailyRadiationUgy: number;
  solarFlareClass: NasaTelemetrySnapshot['donkiRad']['solarFlareClass'];
  flrId?: string;
  cmeId?: string;
  sepId?: string;
  gstId?: string;
  kpIndex?: number;
  cmeSpeedKms?: number;
  cmeAlertActive: boolean;
  scheduledEventId?: MissionEventId;
  historicalNoteKey: string;
}

/**
 * Dataset pre-calibrado de 28 Soles (8 de mayo al 4 de junio de 2024)
 * Basado en el Reporte Oficial ASTRANOESIS (NASA CCMC, DONKI, Curiosity/RAD, Perseverance/MEDA e InSight)
 */
const CALIBRATED_28_SOL_DATASET: SolHistoricalSchedule[] = [
  // ================= ACTO I (Soles 1 al 7): Desembarco, Calibración y Primeras Llamaradas =================
  {
    sol: 1,
    earthDate: '2024-05-08',
    act: 1,
    windSpeedMs: 7.0,
    atmosphericTau: 0.45,
    tempFluctuationK: 9.5,
    temperatureCelsius: -62,
    pressurePa: 742,
    dailyRadiationUgy: 210, // Día 1 RadLab: 8.75 µGy/h * 24h = 210 µGy/d (0.21 mGy)
    solarFlareClass: 'X1.0',
    flrId: 'FLR 30551 (M3.5 04:20) · FLR 30557 (X1.0 04:37) · FLR 30601 (X1.0 21:08)',
    cmeId: 'CME 30640',
    sepId: 'SEP 30677',
    kpIndex: 6,
    cmeSpeedKms: 870,
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol1',
  },
  {
    sol: 2,
    earthDate: '2024-05-09',
    act: 1,
    windSpeedMs: 8.2,
    atmosphericTau: 0.48,
    tempFluctuationK: 10.0,
    temperatureCelsius: -63,
    pressurePa: 740,
    dailyRadiationUgy: 240,
    solarFlareClass: 'X2.2',
    flrId: 'FLR 30605 (X2.2 08:45)',
    cmeId: 'CME 30619',
    sepId: 'SEP 30684',
    kpIndex: 7,
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol2',
  },
  {
    sol: 3,
    earthDate: '2024-05-10',
    act: 1,
    windSpeedMs: 9.5,
    atmosphericTau: 0.52,
    tempFluctuationK: 10.2,
    temperatureCelsius: -64,
    pressurePa: 738,
    dailyRadiationUgy: 320,
    solarFlareClass: 'X3.9',
    flrId: 'FLR 30666 (X3.9 06:27)',
    cmeId: 'CME 30670',
    sepId: 'SEP 30714',
    gstId: 'GST 30693',
    kpIndex: 9,
    cmeAlertActive: true,
    historicalNoteKey: 'nasaNotes.sol3',
  },
  {
    sol: 4,
    earthDate: '2024-05-11',
    act: 1,
    windSpeedMs: 14.0,
    atmosphericTau: 0.68,
    tempFluctuationK: 10.5,
    temperatureCelsius: -65,
    pressurePa: 735,
    dailyRadiationUgy: 410,
    solarFlareClass: 'M3.5',
    cmeId: 'CME 30640 (Impacto L1)',
    sepId: 'SEP 30717',
    gstId: 'GST 30693 · GST 30798',
    kpIndex: 9,
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_D_DUST_DEVILS',
    historicalNoteKey: 'nasaNotes.sol4',
  },
  {
    sol: 5,
    earthDate: '2024-05-12',
    act: 1,
    windSpeedMs: 7.4,
    atmosphericTau: 0.50,
    tempFluctuationK: 9.8,
    temperatureCelsius: -63,
    pressurePa: 741,
    dailyRadiationUgy: 280,
    solarFlareClass: 'M3.5',
    cmeId: 'CME 30670 (Llegada)',
    sepId: 'SEP 30811',
    gstId: 'GST 30798',
    kpIndex: 9,
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol5',
  },
  {
    sol: 6,
    earthDate: '2024-05-13',
    act: 1,
    windSpeedMs: 11.2,
    atmosphericTau: 0.62,
    tempFluctuationK: 10.1,
    temperatureCelsius: -64,
    pressurePa: 739,
    dailyRadiationUgy: 520,
    solarFlareClass: 'M3.5',
    sepId: 'SEP 30817',
    kpIndex: 7,
    cmeSpeedKms: 1263,
    cmeAlertActive: true,
    historicalNoteKey: 'nasaNotes.sol6',
  },
  {
    sol: 7,
    earthDate: '2024-05-14',
    act: 1,
    windSpeedMs: 16.5,
    atmosphericTau: 0.95,
    tempFluctuationK: 10.8,
    temperatureCelsius: -66,
    pressurePa: 734,
    dailyRadiationUgy: 690,
    solarFlareClass: 'X1.0',
    sepId: 'SEP 30825',
    kpIndex: 8,
    cmeAlertActive: true,
    historicalNoteKey: 'nasaNotes.sol7',
  },

  // ================= ACTO II (Soles 8 al 14): Tormenta de Polvo, Fallo Reciclador y Pico RAD 8,100 µGy/d =================
  {
    sol: 8,
    earthDate: '2024-05-15',
    act: 2,
    windSpeedMs: 25.0,
    atmosphericTau: 1.85,
    tempFluctuationK: 11.5,
    temperatureCelsius: -68,
    pressurePa: 728,
    dailyRadiationUgy: 840,
    solarFlareClass: 'M3.5',
    cmeSpeedKms: 805,
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_A_DUST_STORM',
    historicalNoteKey: 'nasaNotes.sol8',
  },
  {
    sol: 9,
    earthDate: '2024-05-16',
    act: 2,
    windSpeedMs: 22.4,
    atmosphericTau: 2.10,
    tempFluctuationK: 11.2,
    temperatureCelsius: -67,
    pressurePa: 730,
    dailyRadiationUgy: 920,
    solarFlareClass: 'C',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol9',
  },
  {
    sol: 10,
    earthDate: '2024-05-17',
    act: 2,
    windSpeedMs: 12.8,
    atmosphericTau: 1.35,
    tempFluctuationK: 10.4,
    temperatureCelsius: -65,
    pressurePa: 736,
    dailyRadiationUgy: 1150,
    solarFlareClass: 'M3.5',
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_B_WATER_RECYCLER',
    historicalNoteKey: 'nasaNotes.sol10',
  },
  {
    sol: 11,
    earthDate: '2024-05-18',
    act: 2,
    windSpeedMs: 9.6,
    atmosphericTau: 0.90,
    tempFluctuationK: 10.0,
    temperatureCelsius: -64,
    pressurePa: 738,
    dailyRadiationUgy: 1480,
    solarFlareClass: 'M3.5',
    cmeAlertActive: true,
    historicalNoteKey: 'nasaNotes.sol11',
  },
  {
    sol: 12,
    earthDate: '2024-05-19',
    act: 2,
    windSpeedMs: 25.0,
    atmosphericTau: 0.55,
    tempFluctuationK: 10.0,
    temperatureCelsius: -63,
    pressurePa: 740,
    dailyRadiationUgy: 1900,
    solarFlareClass: 'X2.2',
    cmeAlertActive: true,
    scheduledEventId: 'EVENT_A_DUST_STORM',
    historicalNoteKey: 'nasaNotes.sol12',
  },
  {
    sol: 13,
    earthDate: '2024-05-20',
    act: 2,
    windSpeedMs: 11.5,
    atmosphericTau: 0.60,
    tempFluctuationK: 10.3,
    temperatureCelsius: -64,
    pressurePa: 739,
    dailyRadiationUgy: 8100, // Pico histórico real Curiosity/RAD (20 de mayo de 2024)
    solarFlareClass: 'X3.9',
    flrId: 'FLR 30666 (X3.9)',
    cmeId: 'CME 30670',
    sepId: 'SEP 30825 (Pico 8,100 µGy/d)',
    gstId: 'GST 30798 (Kp=9)',
    kpIndex: 9,
    cmeSpeedKms: 1263,
    cmeAlertActive: true,
    scheduledEventId: 'EVENT_C_SOLAR_STORM_SEP',
    historicalNoteKey: 'nasaNotes.sol13',
  },
  {
    sol: 14,
    earthDate: '2024-05-21',
    act: 2,
    windSpeedMs: 8.5,
    atmosphericTau: 0.52,
    tempFluctuationK: 9.9,
    temperatureCelsius: -63,
    pressurePa: 741,
    dailyRadiationUgy: 2450,
    solarFlareClass: 'M3.5',
    cmeAlertActive: true,
    historicalNoteKey: 'nasaNotes.sol14',
  },

  // ================= ACTO III (Soles 15 al 21): Recuperación Post-Tormenta Solar y Exploración Jezero =================
  {
    sol: 15,
    earthDate: '2024-05-22',
    act: 3,
    windSpeedMs: 7.2,
    atmosphericTau: 0.48,
    tempFluctuationK: 9.6,
    temperatureCelsius: -62,
    pressurePa: 742,
    dailyRadiationUgy: 980,
    solarFlareClass: 'C',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol15',
  },
  {
    sol: 16,
    earthDate: '2024-05-23',
    act: 3,
    windSpeedMs: 18.5,
    atmosphericTau: 0.85,
    tempFluctuationK: 10.4,
    temperatureCelsius: -64,
    pressurePa: 737,
    dailyRadiationUgy: 420,
    solarFlareClass: 'C',
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_D_DUST_DEVILS',
    historicalNoteKey: 'nasaNotes.sol16',
  },
  {
    sol: 17,
    earthDate: '2024-05-24',
    act: 3,
    windSpeedMs: 7.0,
    atmosphericTau: 0.42,
    tempFluctuationK: 9.5,
    temperatureCelsius: -62,
    pressurePa: 743,
    dailyRadiationUgy: 260,
    solarFlareClass: 'B',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol17',
  },
  {
    sol: 18,
    earthDate: '2024-05-25',
    act: 3,
    windSpeedMs: 8.8,
    atmosphericTau: 0.50,
    tempFluctuationK: 10.0,
    temperatureCelsius: -63,
    pressurePa: 740,
    dailyRadiationUgy: 215,
    solarFlareClass: 'B',
    cmeAlertActive: false,
     scheduledEventId: 'EVENT_B_WATER_RECYCLER',
    historicalNoteKey: 'nasaNotes.sol18',
  },
  {
    sol: 19,
    earthDate: '2024-05-26',
    act: 3,
    windSpeedMs: 7.5,
    atmosphericTau: 0.46,
    tempFluctuationK: 9.7,
    temperatureCelsius: -62,
    pressurePa: 741,
    dailyRadiationUgy: 190,
    solarFlareClass: 'B',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol19',
  },
  {
    sol: 20,
    earthDate: '2024-05-27',
    act: 3,
    windSpeedMs: 24.5,
    atmosphericTau: 2.35,
    tempFluctuationK: 11.4,
    temperatureCelsius: -67,
    pressurePa: 729,
    dailyRadiationUgy: 310,
    solarFlareClass: 'M3.5',
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_A_DUST_STORM',
    historicalNoteKey: 'nasaNotes.sol20',
  },
  {
    sol: 21,
    earthDate: '2024-05-28',
    act: 3,
    windSpeedMs: 14.2,
    atmosphericTau: 1.40,
    tempFluctuationK: 10.6,
    temperatureCelsius: -65,
    pressurePa: 735,
    dailyRadiationUgy: 280,
    solarFlareClass: 'C',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol21',
  },

  // ================= ACTO IV (Soles 22 al 28): Cosecha Hidropónica OSDR y Enlace Final Chaski =================
  {
    sol: 22,
    earthDate: '2024-05-29',
    act: 4,
    windSpeedMs: 9.0,
    atmosphericTau: 0.65,
    tempFluctuationK: 10.0,
    temperatureCelsius: -63,
    pressurePa: 739,
    dailyRadiationUgy: 1950,
    solarFlareClass: 'X1.0',
    cmeAlertActive: true,
    scheduledEventId: 'EVENT_C_SOLAR_STORM_SEP',
    historicalNoteKey: 'nasaNotes.sol22',
  },
  {
    sol: 23,
    earthDate: '2024-05-30',
    act: 4,
    windSpeedMs: 7.3,
    atmosphericTau: 0.48,
    tempFluctuationK: 9.8,
    temperatureCelsius: -62,
    pressurePa: 741,
    dailyRadiationUgy: 620,
    solarFlareClass: 'C',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol23',
  },
  {
    sol: 24,
    earthDate: '2024-05-31',
    act: 4,
    windSpeedMs: 19.8,
    atmosphericTau: 0.72,
    tempFluctuationK: 10.2,
    temperatureCelsius: -64,
    pressurePa: 738,
    dailyRadiationUgy: 240,
    solarFlareClass: 'B',
    cmeAlertActive: false,
    scheduledEventId: 'EVENT_D_DUST_DEVILS',
    historicalNoteKey: 'nasaNotes.sol24',
  },
  {
    sol: 25,
    earthDate: '2024-06-01',
    act: 4,
    windSpeedMs: 7.0,
    atmosphericTau: 0.44,
    tempFluctuationK: 9.5,
    temperatureCelsius: -62,
    pressurePa: 742,
    dailyRadiationUgy: 185,
    solarFlareClass: 'B',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol25',
  },
  {
    sol: 26,
    earthDate: '2024-06-02',
    act: 4,
    windSpeedMs: 7.8,
    atmosphericTau: 0.46,
    tempFluctuationK: 9.7,
    temperatureCelsius: -63,
    pressurePa: 741,
    dailyRadiationUgy: 175,
    solarFlareClass: 'B',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol26',
  },
  {
    sol: 27,
    earthDate: '2024-06-03',
    act: 4,
    windSpeedMs: 7.1,
    atmosphericTau: 0.42,
    tempFluctuationK: 9.4,
    temperatureCelsius: -62,
    pressurePa: 743,
    dailyRadiationUgy: 168,
    solarFlareClass: 'A',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol27',
  },
  {
    sol: 28,
    earthDate: '2024-06-04',
    act: 4,
    windSpeedMs: 7.0,
    atmosphericTau: 0.40,
    tempFluctuationK: 9.2,
    temperatureCelsius: -61,
    pressurePa: 744,
    dailyRadiationUgy: 163,
    solarFlareClass: 'A',
    cmeAlertActive: false,
    historicalNoteKey: 'nasaNotes.sol28',
  },
];

export interface DonkiFlareRecord {
  flrID: string;
  beginTime: string;
  peakTime: string;
  classType: string;
  sourceLocation?: string;
}

export class NasaDataService {
  private readonly apiKey: string;
  private isOnlineApiVerified = false;
  private cachedDonkiFlares: DonkiFlareRecord[] = [];

  constructor() {
    const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_NASA_API_KEY;
    this.apiKey = envKey && envKey.trim().length > 0 ? envKey.trim() : 'DEMO_KEY';
  }

  /**
   * Conecta de forma asíncrona con la API de la NASA (DONKI FLR & InSight/MEDA) con timeout corto (3.5s)
   * Si el dispositivo está offline o DEMO_KEY alcanza rate-limit, utiliza automáticamente el dataset pre-calibrado.
   */
  public async syncLiveNasaData(): Promise<{ online: boolean; flaresCount: number }> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);

    try {
      const url = `https://api.nasa.gov/DONKI/FLR?startDate=${MISSION_CONFIG.HISTORICAL_START_DATE}&endDate=${MISSION_CONFIG.HISTORICAL_END_DATE}&api_key=${this.apiKey}`;
      const response = await fetch(url, { signal: controller.signal });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as DonkiFlareRecord[];
      if (Array.isArray(data) && data.length > 0) {
        this.cachedDonkiFlares = data;
        this.isOnlineApiVerified = true;
        return { online: true, flaresCount: data.length };
      }
    } catch {
      window.clearTimeout(timeoutId);
      // Fallback transparente al dataset local pre-calibrado de ASTRANOESIS
      this.isOnlineApiVerified = false;
    }

    return {
      online: false,
      flaresCount:
        NASA_SCIENTIFIC_DATA.MAY_2024_SOLAR_STORM.X_CLASS_FLARES_COUNT +
        NASA_SCIENTIFIC_DATA.MAY_2024_SOLAR_STORM.M_CLASS_FLARES_COUNT,
    };
  }

  /**
   * Devuelve si los datos provienen de la conexión activa a api.nasa.gov o del respaldo offline calibrado
   */
  public isUsingLiveApi(): boolean {
    return this.isOnlineApiVerified;
  }

  /**
   * Obtiene el registro horario/diario completo de un Sol (1..28)
   */
  public getSolSchedule(sol: number): SolHistoricalSchedule {
    const clampedSol = Math.max(1, Math.min(MISSION_CONFIG.TOTAL_SOLS, Math.round(sol)));
    return CALIBRATED_28_SOL_DATASET[clampedSol - 1];
  }

  /**
   * Construye el snapshot de telemetría NASA (MEDA + DONKI/RAD/RadLab + OSDR VEG-05/XROOTS + Retraso Chaski)
   */
  public getTelemetryForSol(
    sol: number,
    hydroponicGrowthPercent = 15,
    biomassHealth = 98,
    cumulativeRadiationUgy = 210,
    veg05Spectrum: Veg05LightSpectrum = 'RED_90_BLUE_10',
    xrootsSystem: XrootsCultivationSystem = 'HYDROPONICS'
  ): NasaTelemetrySnapshot {
    const entry = this.getSolSchedule(sol);

    // Si descargamos datos en vivo de DONKI para la fecha terrestre del Sol, enriquecemos la clase de llamarada
    let flareClass = entry.solarFlareClass;
    if (this.cachedDonkiFlares.length > 0) {
      const matchingFlare = this.cachedDonkiFlares.find((f) => f.peakTime?.startsWith(entry.earthDate));
      if (matchingFlare?.classType) {
        const raw = matchingFlare.classType.toUpperCase();
        if (raw.startsWith('X3')) flareClass = 'X3.9';
        else if (raw.startsWith('X2')) flareClass = 'X2.2';
        else if (raw.startsWith('X')) flareClass = 'X1.0';
        else if (raw.startsWith('M')) flareClass = 'M3.5';
      }
    }

    // Ley de Beer-Lambert: I = I0 * e^(-tau * m)
    const airMassM = NASA_SCIENTIFIC_DATA.MEDA_JEZERO.DEFAULT_AIR_MASS_M;
    const beerLambertTransmittance = computeBeerLambertSolarIntensity(
      1.0,
      entry.atmosphericTau,
      airMassM
    );

    // Irradiancia UV en Jezero (26.9 a 42.3 W/m² modulada por la transmitancia atmosférica)
    const uvFactor = Math.max(0.55, Math.min(1.0, 0.55 + beerLambertTransmittance * 0.65));
    const uvaWm2 = Number((33.7 * uvFactor).toFixed(2));
    const uvbWm2 = Number((6.45 * uvFactor).toFixed(2));
    const uvcWm2 = Number((2.21 * uvFactor).toFixed(2));
    const uvTotalWm2 = Number((uvaWm2 + uvbWm2 + uvcWm2).toFixed(2));

    // Dosimetría RadLab (Día 1 ref: 8.75 µGy/h, 26.67 µSv/h, 0.21 mGy)
    const absorbedDoseRateUgyH = Number((entry.dailyRadiationUgy / 24).toFixed(2));
    const qualityFactor = entry.dailyRadiationUgy >= 1000 ? 3.2 : 3.048; // 8.75 * 3.048 = 26.67 µSv/h en Día 1
    const equivalentDoseRateUsvH = Number((absorbedDoseRateUgyH * qualityFactor).toFixed(2));
    const cumulativeDoseMgy = Number((cumulativeRadiationUgy / 1000).toFixed(2));

    // Distancia Tierra-Marte (58M km -> 400M km) y retraso de comunicación Chaski (3.2 min -> 24.0 min)
    const orbitalProgress = (entry.sol - 1) / Math.max(1, MISSION_CONFIG.TOTAL_SOLS - 1);
    const earthMarsDistanceMillionKm = Math.round(
      NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MIN_DISTANCE_MILLION_KM +
        orbitalProgress *
          (NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MAX_DISTANCE_MILLION_KM -
            NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MIN_DISTANCE_MILLION_KM)
    );
    const baseDelayMin =
      NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MIN_ONE_WAY_DELAY_MINUTES +
      orbitalProgress *
        (NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MAX_ONE_WAY_DELAY_MINUTES -
          NASA_SCIENTIFIC_DATA.EARTH_MARS_COMMUNICATION.MIN_ONE_WAY_DELAY_MINUTES -
          2.2);
    const flareIonosphericJitter = entry.cmeAlertActive ? 1.8 : 0;
    const oneWayDelayMinutes = Number(
      Math.min(24.0, baseDelayMin + flareIonosphericJitter).toFixed(1)
    );

    const spectrumMultiplier = veg05Spectrum === 'RED_90_BLUE_10' ? 1.18 : 1.0;

    return {
      sol: entry.sol,
      earthDate: entry.earthDate,
      act: entry.act,
      meda: {
        windSpeedMs: entry.windSpeedMs,
        atmosphericTau: entry.atmosphericTau,
        airMassM,
        beerLambertTransmittance,
        tempFluctuationK: entry.tempFluctuationK,
        temperatureCelsius: entry.temperatureCelsius,
        surfaceTempMinC: -83,
        surfaceTempMaxC: entry.atmosphericTau > 1.2 ? -4 : 5,
        pressurePa: entry.pressurePa,
        uvTotalWm2,
        uvaWm2,
        uvbWm2,
        uvcWm2,
      },
      donkiRad: {
        dailyRadiationUgy: entry.dailyRadiationUgy,
        absorbedDoseRateUgyH,
        equivalentDoseRateUsvH,
        cumulativeDoseMgy,
        solarFlareClass: flareClass,
        flrId: entry.flrId ?? 'FLR 30557',
        cmeId: entry.cmeId ?? 'CME 30640',
        sepId: entry.sepId ?? 'SEP 30677',
        gstId: entry.gstId ?? 'GST 30693',
        kpIndex: entry.kpIndex ?? (entry.cmeAlertActive ? 8 : 5),
        cmeSpeedKms: entry.cmeSpeedKms,
        cmeAlertActive: entry.cmeAlertActive,
        gcrStatus: 'CONTINUOUS',
        speStatus:
          entry.dailyRadiationUgy >= 1900
            ? 'CRITICAL_SEP'
            : entry.cmeAlertActive
            ? 'ELEVATED'
            : 'NONE',
        dosimeterActive: true,
      },
      osdr: {
        hydroponicGrowthPercent: Math.min(100, Math.round(hydroponicGrowthPercent)),
        o2PhotosynthesisBonus: Number(
          ((0.15 + (hydroponicGrowthPercent / 100) * 0.65) * spectrumMultiplier).toFixed(2)
        ),
        biomassHealthIndex: Math.round(biomassHealth),
        veg05Spectrum,
        xrootsSystem,
      },
      comms: {
        earthMarsDistanceMillionKm,
        oneWayDelayMinutes,
      },
    };
  }
}
