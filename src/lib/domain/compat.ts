export interface VehicleSpec {
  connectors: string[];
  batteryKwh: number | null;
  maxAcKw: number | null;
}

export interface ChargerSpec {
  connectorType: string;
  current: "AC" | "DC";
  ratedPowerKw: number;
}

export interface Compatibility {
  compatible: boolean;
  /** Power the car is likely to draw, if we can tell. */
  effectiveKw: number | null;
  reasons: string[];
}

export function checkCompatibility(v: VehicleSpec, c: ChargerSpec): Compatibility {
  if (!v.connectors.includes(c.connectorType)) {
    return {
      compatible: false,
      effectiveKw: null,
      reasons: ["Your vehicle profile does not list this connector type."],
    };
  }
  const reasons: string[] = [];
  let effectiveKw: number | null = null;
  if (c.current === "AC") {
    if (v.maxAcKw) {
      effectiveKw = Math.min(v.maxAcKw, c.ratedPowerKw);
      if (v.maxAcKw < c.ratedPowerKw) {
        reasons.push(
          `Your vehicle's onboard charger accepts up to ${v.maxAcKw} kW AC, so it will charge at about ${effectiveKw} kW here, not the charger's full ${c.ratedPowerKw} kW.`,
        );
      }
    } else {
      reasons.push("Add your vehicle's maximum AC charging power to get a time estimate.");
    }
  } else {
    reasons.push("DC charging speed depends heavily on your vehicle and battery state; no estimate is shown.");
  }
  return { compatible: true, effectiveKw, reasons };
}

export interface ChargeEstimate {
  energyKwh: number;
  /** Approximate % of battery added, if battery size is known. */
  percentAdded: number | null;
  minutesToFull: number | null;
}

/**
 * Rough energy estimate. Assumes ~90% charging efficiency and constant power.
 * Real charging speed varies with the vehicle, battery state, temperature and
 * the charger; the UI must say so wherever this is shown.
 */
export function estimateCharge(
  effectiveKw: number | null,
  durationMinutes: number,
  batteryKwh: number | null,
  fromPercent = 20,
): ChargeEstimate | null {
  if (!effectiveKw || durationMinutes <= 0) return null;
  const efficiency = 0.9;
  let energy = effectiveKw * (durationMinutes / 60) * efficiency;
  let percentAdded: number | null = null;
  let minutesToFull: number | null = null;
  if (batteryKwh) {
    const room = batteryKwh * ((100 - fromPercent) / 100);
    energy = Math.min(energy, room);
    percentAdded = Math.round((energy / batteryKwh) * 100);
    minutesToFull = Math.ceil((room / (effectiveKw * efficiency)) * 60);
  }
  return { energyKwh: Math.round(energy * 10) / 10, percentAdded, minutesToFull };
}
