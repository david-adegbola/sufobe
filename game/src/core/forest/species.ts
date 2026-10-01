/**
 * Metsäni tree species and their allometry (size → wood, leaves, carbon).
 *
 * Every tree is described by its height h (m) and its trunk diameter at
 * breast height d (cm, 0 until the tree is taller than 1.3 m). Everything
 * else is computed from those two. Parameters are rounded and simplified;
 * the ones marked "verify" in docs/forest-model.md will be checked against
 * Finnish growth tables before release.
 */
export type SpeciesId = 'pine' | 'spruce' | 'birch';

export interface Species {
  id: SpeciesId;
  /** height curve h(t) = hMax·(1 − e^(−hK·t))^hC on a good site */
  hMax: number;
  hK: number;
  hC: number;
  /** open-grown diameter growth at d = 0 on a perfect site, cm per year */
  g0: number;
  /** diameter growth slows as the tree gets thicker: × e^(−d/dScale) */
  dScale: number;
  /** stem form factor: volume = form · basal area · height */
  form: number;
  /** basic density of stem wood, kg dry per m³ */
  density: number;
  /** foliage dry mass, kg = folA · d^1.8 */
  folA: number;
  /** leaf (needle) area per kg, m² (one-sided) */
  sla: number;
  /** share of the foliage shed each year (1 = deciduous) */
  folTurnover: number;
  /** fine roots as a share of foliage mass */
  fineRootRatio: number;
  /** how strongly shade from bigger trees slows growth (bigger = needs more light) */
  shadeComp: number;
  /** 0..1 how well the tree copes with dry soil */
  droughtTol: number;
  /** 0..1 how much the tree needs a fertile soil */
  nutNeed: number;
  /** 0..1 how well the tree copes with waterlogged soil */
  wetTol: number;
  /** age after which old-age deaths start to rise */
  oldAge: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  pine: {
    id: 'pine', hMax: 26, hK: 0.03, hC: 1.35, g0: 0.95, dScale: 40, form: 0.47, density: 410,
    folA: 0.02, sla: 6, folTurnover: 0.3, fineRootRatio: 0.5,
    shadeComp: 0.065, droughtTol: 0.6, nutNeed: 0.5, wetTol: 0.4, oldAge: 220,
  },
  spruce: {
    id: 'spruce', hMax: 33, hK: 0.025, hC: 1.45, g0: 0.95, dScale: 45, form: 0.48, density: 390,
    folA: 0.05, sla: 4, folTurnover: 0.15, fineRootRatio: 0.3,
    shadeComp: 0.03, droughtTol: 0.3, nutNeed: 1, wetTol: 0.2, oldAge: 180,
  },
  birch: {
    id: 'birch', hMax: 27, hK: 0.045, hC: 1.25, g0: 1.05, dScale: 32, form: 0.44, density: 490,
    folA: 0.013, sla: 15, folTurnover: 1, fineRootRatio: 0.6,
    shadeComp: 0.08, droughtTol: 0.5, nutNeed: 0.65, wetTol: 0.3, oldAge: 110,
  },
};

/** Carbon is about half of dry wood (the same rule as in the classroom sim). */
export const CARBON_SHARE = 0.5;
/** Branches, stump and coarse roots, as a share of stem dry mass. */
export const BRANCH_SHARE = 0.25;
export const ROOT_SHARE = 0.35;

/** Stem volume, m³. */
export function stemVolume(sp: Species, d: number, h: number): number {
  const r = d / 200;
  return sp.form * Math.PI * r * r * h;
}

/** Woody dry mass (stem + branches + coarse roots), kg. */
export function woodyDry(sp: Species, d: number, h: number): number {
  // Seedlings shorter than breast height have no d, so use a small height rule.
  const sapling = 0.4 * Math.pow(Math.min(h, 1.3), 2.2);
  if (d <= 0) return sapling;
  const stem = stemVolume(sp, d, h) * sp.density;
  return Math.max(sapling, stem * (1 + BRANCH_SHARE + ROOT_SHARE));
}

export function foliageDry(sp: Species, d: number, h: number): number {
  const sapling = 0.3 * woodyDry(sp, 0, h);
  return Math.max(sapling, sp.folA * Math.pow(d, 1.8));
}

/** Height on the site curve at effective age t. */
export function heightAt(sp: Species, hMax: number, t: number): number {
  return hMax * Math.pow(1 - Math.exp(-sp.hK * t), sp.hC);
}

/** Effective age at which the site curve reaches height h. */
export function ageAtHeight(sp: Species, hMax: number, h: number): number {
  const x = Math.min(0.999, Math.max(1e-6, h / hMax));
  return -Math.log(1 - Math.pow(x, 1 / sp.hC)) / sp.hK;
}
