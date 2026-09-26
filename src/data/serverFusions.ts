import type { LocalServerCode } from "./serverRegistry";

export type LocalServerFusionCompensationPolicy = "none" | "levelGoldV1" | "unknown";

export type LocalServerFusionEvent<TCode extends string = string> = {
  id: string;
  origins: readonly TCode[];
  target: TCode;
  effectiveDate?: string;
  compensationPolicy: LocalServerFusionCompensationPolicy;
};

export type LocalServerFusionRelation<TCode extends string = string> = {
  from: TCode;
  to: TCode;
  fusionEvent?: LocalServerFusionEvent<TCode>;
};

export const LOCAL_SERVER_FUSION_EVENTS = [
  {
    id: "fusion-blackforest",
    origins: ["F7", "F10", "F13"],
    target: "BLACKFOREST",
    effectiveDate: "2026-05-08",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-f1",
    origins: ["BR1", "BR2", "CA1", "CL1", "CL2", "MX1", "US1", "US2", "US3", "US4", "US5", "US6", "US7", "US8", "US9", "US10"],
    target: "F1",
    effectiveDate: "2023-07-26",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f2",
    origins: ["AE1", "AE2", "DK1", "DK2", "IN1", "JP1", "NL1", "NL2", "NL3", "RO1", "RU1", "SE1", "SE2", "TV2", "UK1", "UK2"],
    target: "F2",
    effectiveDate: "2023-09-08",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f3",
    origins: ["IT1", "IT2", "IT3", "IT4", "IT5", "IT6", "IT7", "IT8"],
    target: "F3",
    effectiveDate: "2023-10-13",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f4",
    origins: ["123PLAYGAMES", "GR1", "GR2", "GR3", "GR4", "GR5", "GR6", "PT1", "PT2", "PT3", "PT4", "PT5", "PT6", "PT7", "PT8", "TR1", "TR2", "TR3", "TR4", "TR5", "TR6"],
    target: "F4",
    effectiveDate: "2023-10-20",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f5",
    origins: ["ES1", "ES2", "ES3", "ES4", "ES5", "ES6", "ES7", "ES8", "ES9", "ES10", "ES11", "ES12", "MINIJUEGOS"],
    target: "F5",
    effectiveDate: "2023-10-27",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f6",
    origins: ["FR1", "FR2", "FR3", "FR4", "FR5", "FR6", "FR7", "FR8", "FR9", "FR10", "FR11", "FR12", "FR13"],
    target: "F6",
    effectiveDate: "2023-11-10",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f7",
    origins: ["PL7", "PL8", "PL9", "PL10", "PL11", "PL12", "PL13", "PL14", "PL15", "PL16", "PL17"],
    target: "F7",
    effectiveDate: "2023-12-08",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f8",
    origins: ["DE5", "DE6", "DE7", "DE8", "DE9", "DE10", "DE11", "DE12"],
    target: "F8",
    effectiveDate: "2024-01-12",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f9",
    origins: ["DE25", "DE26", "DE27", "DE28", "DE29", "DE30", "DE31", "DE32", "DE33", "DE34", "DE35", "DE36", "DE37"],
    target: "F9",
    effectiveDate: "2024-01-19",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f10",
    origins: ["PL18", "PL19", "PL20", "PL21", "PL22", "PL23", "PL24", "PL25", "PL26", "PL27", "PL28", "PL29", "PL30", "PL31", "PL32", "PL33"],
    target: "F10",
    effectiveDate: "2024-01-26",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f11",
    origins: ["DE13", "DE14", "DE15", "DE16", "DE17", "DE18", "DE19", "DE20", "DE21", "DE22", "DE23", "DE24", "RTL", "SEVENGAMES"],
    target: "F11",
    effectiveDate: "2024-01-26",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f12",
    origins: ["W1", "W2", "W3", "W4", "W5"],
    target: "F12",
    effectiveDate: "2024-01-26",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f13",
    origins: ["PL1", "PL2", "PL3", "PL4", "PL5", "PL6", "WP"],
    target: "F13",
    effectiveDate: "2024-02-02",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f14",
    origins: ["W15", "W16", "W17", "W18", "W19", "W20", "W21"],
    target: "F14",
    effectiveDate: "2024-02-02",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f15",
    origins: ["CZ17", "CZ18", "CZ19", "CZ20", "CZ21", "CZ22", "CZ23", "CZ24", "CZ25", "CZ26", "CZ27", "CZ28", "SK2", "SK3"],
    target: "F15",
    effectiveDate: "2024-02-02",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f16",
    origins: ["CZ6", "CZ7", "CZ8", "CZ9", "CZ10", "CZ11", "CZ12", "CZ13", "CZ14", "CZ15", "CZ16", "SK1"],
    target: "F16",
    effectiveDate: "2024-02-09",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f17",
    origins: ["BUFFED", "DE1", "DE2", "DE3", "DE4", "GAMONA", "INGAME", "RTL2", "XCHAR"],
    target: "F17",
    effectiveDate: "2024-02-09",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f18",
    origins: ["CZ1", "CZ2", "CZ3", "CZ4", "CZ5"],
    target: "F18",
    effectiveDate: "2024-02-09",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f19",
    origins: ["HU1", "HU2", "HU3", "HU4", "HU5", "HU6", "HU7", "HU8", "HU9", "HU10", "HU11", "HU12", "HU13", "HU14", "HU15"],
    target: "F19",
    effectiveDate: "2024-02-16",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f20",
    origins: ["CZ29", "HU16", "PL34", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13", "W14"],
    target: "F20",
    effectiveDate: "2024-02-16",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f21",
    origins: ["CZ30", "DE38", "PL35", "W22", "W23", "W24", "W25", "W26", "W27", "W28", "W30"],
    target: "F21",
    effectiveDate: "2024-02-16",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f22",
    origins: ["CZ31", "CZ32", "DE39", "DE40", "HU17", "PL36", "PL37", "W31", "W32", "W33", "W34", "W35", "W36", "W37"],
    target: "F22",
    effectiveDate: "2024-03-15",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f23",
    origins: ["CZ33", "CZ34", "DE41", "DE42", "FR14", "FR15", "HU18", "HU19", "PL38", "PL39", "W38", "W39", "W40", "W41", "W42", "W43", "W44", "W45"],
    target: "F23",
    effectiveDate: "2024-10-11",
    compensationPolicy: "none",
  },
  {
    id: "fusion-f24",
    origins: ["W46", "W47", "W48", "W49", "W50"],
    target: "F24",
    effectiveDate: "2025-02-07",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-f25",
    origins: ["CZ35", "DE43", "HU20", "PL40", "W51", "W52"],
    target: "F25",
    effectiveDate: "2025-02-07",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-f26",
    origins: ["W53", "W54", "W55", "W56"],
    target: "F26",
    effectiveDate: "2025-03-07",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-f27",
    origins: ["W57", "W58", "W59", "W60"],
    target: "F27",
    effectiveDate: "2025-08-01",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-f28",
    origins: ["EU1", "EU2", "EU3", "EU4"],
    target: "F28",
    effectiveDate: "2026-02-06",
    compensationPolicy: "levelGoldV1",
  },
  {
    id: "fusion-f29",
    origins: ["EU5", "EU6", "EU7", "EU8"],
    target: "F29",
    effectiveDate: "2026-10-16",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-gnarogrim",
    origins: ["F15", "F16", "F18"],
    target: "GNAROGRIM",
    effectiveDate: "2026-06-05",
    compensationPolicy: "unknown",
  },
  {
    id: "fusion-maerwynn",
    origins: ["F1", "F2", "F3", "F4", "F5"],
    target: "MAERWYNN",
    effectiveDate: "2025-04-25",
    compensationPolicy: "none",
  },
  {
    id: "fusion-stumblesteppe",
    origins: ["F6", "F12", "F20"],
    target: "STUMBLESTEPPE",
    effectiveDate: "2026-07-10",
    compensationPolicy: "unknown",
  },
] as const satisfies readonly LocalServerFusionEvent<LocalServerCode>[];

const F28_COMPATIBILITY_EVENT = LOCAL_SERVER_FUSION_EVENTS.find((event) => event.target === "F28")!;

// Transitional adapter for the current Fusion Identity stack. The full
// multi-server foundation is LOCAL_SERVER_FUSION_EVENTS; dashboard/matching
// integration will switch to it in the next block.
export const LOCAL_SERVER_FUSIONS = [
  { from: "EU1", to: "F28", fusionEvent: F28_COMPATIBILITY_EVENT },
  { from: "EU2", to: "F28", fusionEvent: F28_COMPATIBILITY_EVENT },
  { from: "EU3", to: "F28", fusionEvent: F28_COMPATIBILITY_EVENT },
  { from: "EU4", to: "F28", fusionEvent: F28_COMPATIBILITY_EVENT },
] as const satisfies readonly LocalServerFusionRelation<LocalServerCode>[];
