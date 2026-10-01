/**
 * Metsäni soils. Each soil is a water "bucket" with a drain, a single
 * "soil food" (nutrients) value, and a starting soil carbon store.
 * Values are relative and simplified; see docs/forest-model.md (verify).
 */
export type SoilId = 'sandy' | 'clay' | 'peat' | 'loam' | 'rocky';

export interface Soil {
  id: SoilId;
  /** water the soil can hold for roots, mm */
  waterCap: number;
  /** 0..1, how much summer rain drains away before roots can use it */
  drainage: number;
  /** 0..1 soil food */
  nutrients: number;
  /** 0..1, how waterlogged the soil is (roots short of air) */
  wetness: number;
  /** 0..1, room for roots (thin soil on rock = little room) */
  depth: number;
  /** starting soil carbon, tonnes C per hectare */
  soilC0: number;
  /** yearly decay rate of soil carbon (humus) at the reference climate */
  humusK: number;
}

export const SOILS: Record<SoilId, Soil> = {
  sandy: { id: 'sandy', waterCap: 60,  drainage: 0.8,  nutrients: 0.35, wetness: 0,   depth: 1,    soilC0: 35,  humusK: 0.012 },
  clay:  { id: 'clay',  waterCap: 170, drainage: 0.2,  nutrients: 0.9,  wetness: 0.2, depth: 1,    soilC0: 90,  humusK: 0.008 },
  peat:  { id: 'peat',  waterCap: 250, drainage: 0.1,  nutrients: 0.5,  wetness: 0.9, depth: 1,    soilC0: 600, humusK: 0.0006 },
  loam:  { id: 'loam',  waterCap: 140, drainage: 0.4,  nutrients: 0.8,  wetness: 0,   depth: 1,    soilC0: 70,  humusK: 0.01 },
  rocky: { id: 'rocky', waterCap: 30,  drainage: 0.9,  nutrients: 0.2,  wetness: 0,   depth: 0.6,  soilC0: 15,  humusK: 0.014 },
};
