/**
 * Decision moments: Tikka asks a question when the forest calls for one, the
 * forest waits, and the child chooses. Every question except "what grows here
 * now?" has a do-nothing answer, and none is marked as the right one: the
 * five results show the consequences over the following years.
 *
 * Questions are not repeated too often (the `asked` record), so a child who
 * prefers to leave the forest alone is not nagged.
 */
import {
  relativeDensity, standStats, type ChoiceId, type Decision, type DecisionKind, type Forest, type YearRecord,
} from './stand';

/** Years before the same kind of question may come again. */
const COOLDOWN: Record<DecisionKind, number> = { regen: 0, young: 99, crowded: 8, mature: 15, storm: 0, beetle: 0 };

const CHOICES: Record<DecisionKind, ChoiceId[]> = {
  regen: ['plant', 'seed'],
  young: ['tend', 'nothing'],
  crowded: ['thin', 'thinLight', 'nothing'],
  mature: ['clearcut', 'clearcutKeep', 'cc', 'leaveOld'],
  storm: ['removeFallen', 'removeHalf', 'leaveFallen'],
  beetle: ['removeBeetle', 'leaveBeetle'],
};

function cooled(f: Forest, k: DecisionKind): boolean {
  const last = f.asked[k];
  return last === undefined || f.year - last >= COOLDOWN[k];
}

function lastCut(f: Forest): number {
  return f.harvests.filter(h => h.kind === 'thin' || h.kind === 'cc' || h.kind === 'clearcut').reduce((m, h) => Math.max(m, h.year), -99);
}

/** The question for the coming year, if the forest calls for one. */
export function nextDecision(f: Forest, rec: YearRecord): Decision | null {
  const kind = whichQuestion(f, rec);
  if (!kind) return null;
  f.asked[kind] = f.year;
  return { kind, year: f.year, choices: CHOICES[kind] };
}

function whichQuestion(f: Forest, rec: YearRecord): DecisionKind | null {
  const growing = f.trees.filter(t => !t.keep);
  if (growing.length === 0 && f.regenUntil === null && !f.continuous) return 'regen';
  const ev = (k: string) => rec.events?.find(e => e.kind === k)?.count ?? 0;
  if (ev('storm') >= 2) return 'storm';
  if (ev('beetle') >= 1) return 'beetle';
  const s = standStats(f.trees);
  const sinceCut = f.year - lastCut(f);
  const sapl = f.trees.filter(t => t.h >= 0.5).length * (s.nHa / Math.max(1, f.trees.length));
  if (s.domH >= 2.5 && s.domH <= 8 && sapl >= 2100 && cooled(f, 'young')) return 'young';
  const oldest = growing.reduce((m, t) => Math.max(m, t.age), 0);
  if ((s.dq >= 28 || oldest >= 85) && s.domH >= 18 && cooled(f, 'mature')) return 'mature';
  if (relativeDensity(f.trees) >= 0.65 && s.domH >= 11 && s.dq >= 12 && sinceCut >= 15 && cooled(f, 'crowded')) return 'crowded';
  return null;
}
