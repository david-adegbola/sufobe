/**
 * Kasva! shell state: settings, progress, the season being played, and
 * saving. Shared by the shell modules (main, screens, results, share, about,
 * kisat), so each of them reads and changes the same `app`.
 */
import { migrate, type Growth, type Save, type SeasonMode, type SeasonOutcome } from '../core/progress';
import type { SeasonResult, SeasonState, TreeMods } from '../core/season';
import { decodeChallenge, type Challenge } from '../core/share';
import { dailySeed, type Weather } from '../core/weather';
import { Sound } from './audio';
import { ABOUT_UI } from './legal';
import { Renderer } from './render';
import type { Screen } from './screens';
import type { Downloads } from './share';
import { getPart, setPart, type Part } from './storage';
import { TEXT, type Lang } from './text';
import type { Transfer } from './transfer';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const LOG_KEY: Part = 'greybox-log';
const SAVE_KEY: Part = 'save';
export const LANG_KEY: Part = 'lang';
export const SOUND_KEY: Part = 'sound';
export const TESTLOG_KEY: Part = 'testlog';

export interface LogRow { at: string; seed: string; stored: number; caught: number; resp: number; combo: number; wilts: number }

export const load = <T>(part: Part, fallback: T): T => getPart(part, fallback);
export const store = (part: Part, v: unknown) => { setPart(part, v); };

export type Mode = 'menu' | 'play' | 'pause' | 'results';
export interface SeasonConfig {
  mode: SeasonMode; seed: string; weather?: Weather[]; from?: Challenge;
  /** a summer for one birch from Metsäni: its tree, and what to do with the score */
  forest?: { mods: TreeMods; done: (storedG: number) => string; home?: boolean };
  /** the home screen's big button: your birch's next summer in your forest (Phase 6) */
  birch?: boolean;
}

interface AppState {
  lang: Lang;
  save: Save;
  /** the playtest log is for teachers and researchers: off unless switched on */
  testLogOn: boolean;
  mode: Mode;
  current: SeasonConfig;
  /** the season on screen (the menu's own season until one is played); set in main.ts before the first frame */
  sim: SeasonState;
  lastResult: SeasonResult | null;
  lastOutcome: SeasonOutcome | null;
  challengeOutcome: { won: boolean; from: Challenge; mine: number } | null;
  picked: Growth | null;
  /** what a Metsäni zoom-in summer did to the birch, shown on the results */
  forestMsg: string | null;
  /** a shared link like #s-d2026-10-02 opens that exact weather */
  linkSeed: string | null;
  visible: Screen | null;
  downloads: Downloads | null;
  posterUrl: string | null;
  posterBlob: Blob | null;
  /** an import waiting for the player's yes */
  pendingImport: { kind: 'code'; t: Transfer } | { kind: 'file'; data: Record<string, string> } | null;
}

/** Everything the shell modules change while the game runs. */
export const app: AppState = {
  lang: load<Lang>(LANG_KEY, 'fi'),
  save: migrate(load<unknown>(SAVE_KEY, null)),
  testLogOn: load<boolean>(TESTLOG_KEY, false),
  mode: 'menu',
  current: { mode: 'free', seed: 'menu' },
  sim: undefined as unknown as SeasonState,
  lastResult: null,
  lastOutcome: null,
  challengeOutcome: null,
  picked: null,
  forestMsg: null,
  linkSeed: /^#s-([A-Za-z0-9._~-]{1,40})$/.exec(location.hash)?.[1] ?? null,
  visible: null,
  downloads: null,
  posterUrl: null,
  posterBlob: null,
  pendingImport: null,
};

/** Shell actions other modules call back into; main.ts fills them in at start-up. */
export const shell = {
  renderText: () => {},
};

export const t = () => TEXT[app.lang];
export const ui = () => ABOUT_UI[app.lang];
export const persist = () => store(SAVE_KEY, app.save);
export const today = () => dailySeed().slice(1);

export const canvas = $<HTMLCanvasElement>('game');
export const renderer = new Renderer(canvas);
export const sound = new Sound();

/** a challenge link like #c-3a-2840-d2026-10-02 opens the challenge card */
export const linkChallenge: Challenge | null = decodeChallenge(location.hash);
/** a teacher's link like #q-thinning opens that question card (Phase 8) */
export const linkQuestion: string | null = /^#q-([A-Za-z0-9]{1,30})$/.exec(location.hash)?.[1] ?? null;
/** a transfer link like #t-K1z.… brings progress from another device */
export const linkTransfer: string | null = /^#t-(K1[zj]\.[A-Za-z0-9_-]+)$/.exec(location.hash)?.[1] ?? null;
