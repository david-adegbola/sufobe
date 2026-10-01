/**
 * The before/after class question (F4 playtest). Off by default; a teacher
 * switches it on in the About screen. When on, Metsäni asks four short
 * multiple-choice questions before the child's first forest, and the same
 * four again when that forest reaches 30 years. No names, no free text:
 * only how many answers each option got, before and after, on this device
 * (localStorage "kasva-quiz"). The teacher can read and clear the tally in
 * About. Nothing is sent anywhere.
 */
import type { Lang } from '../text';

export const QUIZ_KEY = 'kasva-quiz';
export const QUIZ_ON_KEY = 'kasva-quiz-on';
export const AFTER_YEAR = 30;

interface Q { q: string; options: string[] }

/** The right answer to each question (same order in both languages). */
export const CORRECT = [1, 1, 1, 0];

export const QUIZ: Record<Lang, Q[]> = {
  fi: [
    { q: 'Mistä puun kiinteä aine (puun hiili) on suurimmaksi osaksi peräisin?', options: ['Maasta', 'Ilmasta (hiilidioksidista)', 'Sadevedestä', 'Lannoitteista', 'En tiedä'] },
    { q: 'Mitä tapahtuu jäljelle jääville puille, kun metsää harvennetaan?', options: ['Ne kasvavat hitaammin', 'Ne saavat enemmän valoa ja vettä ja kasvavat paksummiksi', 'Ne kuolevat', 'Ei mitään', 'En tiedä'] },
    { q: 'Mistä vihkon paperi tehdään?', options: ['Öljystä', 'Puun kuiduista, usein ohuista rungoista ja sahan hakkeesta', 'Kivestä', 'Puuvillasta', 'En tiedä'] },
    { q: 'Miksi kuollutta puuta (lahopuuta) jätetään metsään?', options: ['Se on koti monille lajeille', 'Se näyttää siistiltä', 'Se estää muiden puiden kasvun', 'Ei mistään syystä', 'En tiedä'] },
  ],
  en: [
    { q: 'Where does most of the solid stuff of a tree (its carbon) come from?', options: ['The soil', 'The air (carbon dioxide)', 'Rainwater', 'Fertiliser', 'I don’t know'] },
    { q: 'What happens to the trees that are left when a forest is thinned?', options: ['They grow slower', 'They get more light and water and grow thicker', 'They die', 'Nothing', 'I don’t know'] },
    { q: 'What is the paper in a notebook made from?', options: ['Oil', 'Wood fibre, often from thin trunks and sawmill chips', 'Stone', 'Cotton', 'I don’t know'] },
    { q: 'Why is dead wood (deadwood) left in the forest?', options: ['It is a home for many species', 'It looks tidy', 'It stops other trees growing', 'For no reason', 'I don’t know'] },
  ],
};

export const QUIZ_UI = {
  fi: {
    title: (phase: 'before' | 'after') => phase === 'before' ? 'Ennen kuin aloitat: neljä kysymystä' : 'Metsäsi on 30-vuotias! Samat neljä kysymystä uudelleen',
    note: 'Vastaa niin kuin itse ajattelet. Tämä ei ole koe, eikä nimeäsi tallenneta.',
    of: (i: number, n: number) => `Kysymys ${i} / ${n}`,
    thanks: 'Kiitos! Jatketaan metsään.',
    toggle: 'Luokan kysely (opettajalle): Metsäni kysyy neljä kysymystä ennen ensimmäistä metsää ja uudelleen, kun metsä on 30-vuotias. Vastaukset tallentuvat nimettöminä vain tälle laitteelle.',
    summaryTitle: 'Kyselyn tulokset tällä laitteella',
    none: 'Ei vielä vastauksia.',
    row: (q: number, b: string, a: string) => `Kysymys ${q}: oikein ennen ${b}, jälkeen ${a}`,
    count: (b: number, a: number) => `Vastanneita ennen ${b}, jälkeen ${a}.`,
    clear: 'Tyhjennä kyselyn tulokset',
  },
  en: {
    title: (phase: 'before' | 'after') => phase === 'before' ? 'Before you start: four questions' : 'Your forest is 30 years old! The same four questions again',
    note: 'Answer the way you think. This is not a test, and your name is not saved.',
    of: (i: number, n: number) => `Question ${i} of ${n}`,
    thanks: 'Thank you! Back to the forest.',
    toggle: 'Class question (for teachers): Metsäni asks four questions before the first forest and again when the forest is 30 years old. Answers are saved without names, on this device only.',
    summaryTitle: 'Class question results on this device',
    none: 'No answers yet.',
    row: (q: number, b: string, a: string) => `Question ${q}: right before ${b}, after ${a}`,
    count: (b: number, a: number) => `Answered before: ${b}, after: ${a}.`,
    clear: 'Clear the class question results',
  },
} as const;

export interface QuizTally {
  before: number[][];
  after: number[][];
  /** this device: 'before' = not asked yet, 'after' = waiting for 30 years, 'done' */
  stage: 'before' | 'after' | 'done';
}

const empty = (): QuizTally => ({ before: CORRECT.map(() => [0, 0, 0, 0, 0]), after: CORRECT.map(() => [0, 0, 0, 0, 0]), stage: 'before' });

export function quizOn(): boolean {
  try { return localStorage.getItem(QUIZ_ON_KEY) === 'true'; } catch { return false; }
}

export function setQuizOn(on: boolean): void {
  try { localStorage.setItem(QUIZ_ON_KEY, String(on)); } catch { /* blocked */ }
}

export function loadTally(): QuizTally {
  try {
    const t = JSON.parse(localStorage.getItem(QUIZ_KEY) ?? 'null') as QuizTally | null;
    return t && Array.isArray(t.before) && Array.isArray(t.after) ? t : empty();
  } catch { return empty(); }
}

export function saveTally(t: QuizTally): void {
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(t)); } catch { /* blocked */ }
}

export function clearTally(): void {
  try { localStorage.removeItem(QUIZ_KEY); } catch { /* blocked */ }
}

/** Add one child's answers. */
export function record(t: QuizTally, phase: 'before' | 'after', answers: number[]): QuizTally {
  const next = structuredClone(t);
  answers.forEach((a, q) => { if (a >= 0) next[phase][q][a]++; });
  next.stage = phase === 'before' ? 'after' : 'done';
  return next;
}

/** The teacher's summary: share answering right, before and after, per question. */
export function summaryHtml(lang: Lang): string {
  const u = QUIZ_UI[lang];
  const t = loadTally();
  const n = (rows: number[][]) => rows[0].reduce((a, b) => a + b, 0);
  const nb = n(t.before), na = n(t.after);
  if (!nb && !na) return `<p>${u.none}</p>`;
  const pct = (rows: number[][], q: number) => {
    const tot = rows[q].reduce((a, b) => a + b, 0);
    return tot ? `${Math.round((rows[q][CORRECT[q]] / tot) * 100)} %` : '–';
  };
  return `<p>${u.count(nb, na)}</p>` + CORRECT.map((_, q) => `<p>${u.row(q + 1, pct(t.before, q), pct(t.after, q))}</p>`).join('');
}
