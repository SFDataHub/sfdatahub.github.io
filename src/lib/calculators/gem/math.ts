import { COEF, I22 } from "./constants";

export type GemInput = {
  charLevel: number;  // B6
  mineLevel: number;  // C6
  guildHoK: number;   // D6
};

const round0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/**
 * Excel-Formeln, 1:1 nachgebaut.
 * - Mine < 25 -> I19 = B6 * I22 * (1 + (C6 - 1) * 0.25) + D6/3
 * - Mine >=25 -> H16 (Polynom) + D6/3
 */
export function calcNormalGem(input: GemInput): number {
  const B6 = Number(input.charLevel);
  const C6 = Number(input.mineLevel);
  const D6 = Number(input.guildHoK);

  if (C6 < 25) {
    const I19 = B6 * I22 * (1 + (C6 - 1) * 0.25) + D6 / 3;
    return round0(I19);
  }

  // Mine >= 25: H16 + D6/3
  const { A, B, C, D, E, F, G, H, I, J } = COEF;

  const H16 =
    A +
    B * B6 +
    C / C6 +
    D * (B6 ** 2) +
    E / (C6 ** 2) +
    (F * B6) / C6 +
    G * (B6 ** 3) +
    H / (C6 ** 3) +
    (I * B6) / (C6 ** 2) +
    (J * (B6 ** 2)) / C6;

  const I16 = H16 + D6 / 3;
  return round0(I16);
}

export function calcBlackGem(normalGem: number): number {
  return round0(normalGem * (2 / 3));
}

export function calcLegendaryGem(normalGem: number): number {
  return round0(normalGem);
}
