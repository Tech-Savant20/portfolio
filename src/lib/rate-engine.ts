/**
 * LastMile IQ's rate engine, ported for the case study's playground. The
 * formulas are the ones in src/lib/services/rate-engine.ts of the project repo
 * (github.com/Tech-Savant20/last-mile-delivery-tracker), and the rate cards and
 * COD rules are the ones its prisma/seed.ts creates. In the real app they live
 * in the database and admins can change them.
 */

export type OrderType = "B2C" | "B2B";
export type ZoneType = "INTRA_ZONE" | "INTER_ZONE";
export type PaymentType = "PREPAID" | "COD";

interface RateCard {
  baseWeightKg: number;
  baseRate: number;
  perExtraKgRate: number;
  minCharge: number;
}

export const RATE_CARDS: Record<OrderType, Record<ZoneType, RateCard>> = {
  B2C: {
    INTRA_ZONE: { baseWeightKg: 0.5, baseRate: 40, perExtraKgRate: 20, minCharge: 40 },
    INTER_ZONE: { baseWeightKg: 0.5, baseRate: 70, perExtraKgRate: 35, minCharge: 70 },
  },
  B2B: {
    INTRA_ZONE: { baseWeightKg: 2, baseRate: 120, perExtraKgRate: 15, minCharge: 120 },
    INTER_ZONE: { baseWeightKg: 2, baseRate: 220, perExtraKgRate: 25, minCharge: 220 },
  },
};

export const COD_RULES: Record<OrderType, { feeType: "FIXED" | "PERCENTAGE"; feeValue: number; minFee: number }> = {
  B2C: { feeType: "FIXED", feeValue: 30, minFee: 30 },
  B2B: { feeType: "PERCENTAGE", feeValue: 2, minFee: 100 },
};

export interface QuoteInput {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  actualWeightKg: number;
  orderType: OrderType;
  zoneType: ZoneType;
  paymentType: PaymentType;
  declaredValue?: number;
}

/** (L × W × H) / 5000, all in cm, to two decimals. */
export function volumetricWeight(l: number, w: number, h: number): number {
  if (l <= 0 || w <= 0 || h <= 0) return 0;
  return Number(((l * w * h) / 5000).toFixed(2));
}

export function quote(input: QuoteInput) {
  const { lengthCm, widthCm, heightCm, actualWeightKg, orderType, zoneType, paymentType, declaredValue = 0 } = input;
  const volumetricWeightKg = volumetricWeight(lengthCm, widthCm, heightCm);
  const chargeableWeightKg = Number(Math.max(actualWeightKg, volumetricWeightKg).toFixed(2));
  const isVolumetricCharged = volumetricWeightKg > actualWeightKg;

  const card = RATE_CARDS[orderType][zoneType];
  const extraWeightKg = Math.max(0, chargeableWeightKg - card.baseWeightKg);
  const extraKgBilled = Math.ceil(extraWeightKg);
  const extraWeightCharge = Number((extraKgBilled * card.perExtraKgRate).toFixed(2));
  const minApplied = card.minCharge > card.baseRate + extraWeightCharge;
  const shippingCharge = Number(Math.max(card.minCharge, card.baseRate + extraWeightCharge).toFixed(2));

  let codSurcharge = 0;
  let codNote = "Prepaid: no COD fee";
  if (paymentType === "COD") {
    const rule = COD_RULES[orderType];
    if (rule.feeType === "PERCENTAGE") {
      const fee = (declaredValue * rule.feeValue) / 100;
      codSurcharge = Number(Math.max(rule.minFee, fee).toFixed(2));
      codNote = `${rule.feeValue}% of $${declaredValue} = $${fee.toFixed(2)}, minimum $${rule.minFee}`;
    } else {
      codSurcharge = Number(Math.max(rule.minFee, rule.feeValue).toFixed(2));
      codNote = `Fixed COD fee $${rule.feeValue}`;
    }
  }

  return {
    volumetricWeightKg,
    chargeableWeightKg,
    isVolumetricCharged,
    card,
    extraWeightKg: Number(extraWeightKg.toFixed(2)),
    extraKgBilled,
    extraWeightCharge,
    minApplied,
    shippingCharge,
    codSurcharge,
    codNote,
    totalCharge: Number((shippingCharge + codSurcharge).toFixed(2)),
  };
}
