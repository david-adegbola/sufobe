/**
 * Moving progress between devices without accounts or a server (Phase 4).
 *
 *  - Transfer code: the Kasva! progress (rank, badges, growth, streak,
 *    nickname, challenges, settings) compressed into a short text. It is
 *    shown as a link and a QR code: scanning the QR with another device's
 *    camera opens the game there and offers to bring the progress over.
 *  - Backup file: everything the game stores on this device, including a
 *    Metsäni forest (too big for a QR code), as one small JSON file.
 *
 * Nothing goes through a server. The code and file go only where the player
 * takes them, and importing always asks first, because it replaces this
 * device's progress.
 */
import qrcode from 'qrcode-generator';
import { migrate, type Save } from '../core/progress';

const PREFIX = 'K1';
/** localStorage keys a backup file may carry (never the test hook). */
const BACKUP_KEYS = /^kasva-(?!dbg$)/;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function squeeze(text: string): Promise<{ z: boolean; bytes: Uint8Array }> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return { z: false, bytes: raw };
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return { z: true, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function unsqueeze(bytes: Uint8Array, z: boolean): Promise<string> {
  if (!z) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

export interface Transfer { save: Save; lang?: string; sound?: boolean }

/** Keep the code short: only recent daily scores and challenges travel. */
export function trimForTransfer(save: Save): Save {
  const days = Object.keys(save.daily).sort().slice(-60);
  return {
    ...save,
    daily: Object.fromEntries(days.map(d => [d, save.daily[d]])),
    rings: save.rings.slice(-40),
    challenges: { sent: save.challenges.sent.slice(0, 20), received: save.challenges.received.slice(0, 20) },
  };
}

export async function encodeTransfer(t: Transfer): Promise<string> {
  const { z, bytes } = await squeeze(JSON.stringify({ ...t, save: trimForTransfer(t.save) }));
  return `${PREFIX}${z ? 'z' : 'j'}.${b64url(bytes)}`;
}

/** The progress inside a code, cleaned up as if loaded from storage; null if the code is not valid. */
export async function decodeTransfer(code: string): Promise<Transfer | null> {
  const m = /^K1([zj])\.([A-Za-z0-9_-]{8,8000})$/.exec(code.trim());
  if (!m) return null;
  try {
    const raw = JSON.parse(await unsqueeze(unb64url(m[2]), m[1] === 'z')) as Partial<Transfer>;
    if (!raw || typeof raw !== 'object' || !raw.save) return null;
    return {
      save: migrate(raw.save),
      lang: raw.lang === 'en' || raw.lang === 'fi' ? raw.lang : undefined,
      sound: typeof raw.sound === 'boolean' ? raw.sound : undefined,
    };
  } catch {
    return null;
  }
}

/** A QR code for a text, as an inline SVG (dark modules on white, with a quiet zone). */
export function qrSvg(text: string, label: string): string {
  const q = qrcode(0, 'L');
  q.addData(text, 'Byte');
  q.make();
  const svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `<span role="img" aria-label="${label.replace(/"/g, '')}" class="qr">${svg.replace('<svg ', '<svg aria-hidden="true" ')}</span>`;
}

export interface Backup { app: 'kasva'; v: 1; at: string; data: Record<string, string> }

/** Everything this game stores on this device. */
export function makeBackup(): Backup {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && BACKUP_KEYS.test(k)) data[k] = localStorage.getItem(k) ?? '';
    }
  } catch { /* storage blocked: an empty backup */ }
  return { app: 'kasva', v: 1, at: new Date().toISOString().slice(0, 10), data };
}

/** Check a backup file; returns its data if it is a Kasva! backup with valid JSON values. */
export function readBackup(text: string): Record<string, string> | null {
  try {
    const b = JSON.parse(text) as Partial<Backup>;
    if (b.app !== 'kasva' || b.v !== 1 || !b.data || typeof b.data !== 'object') return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.data)) {
      if (!BACKUP_KEYS.test(k) || typeof v !== 'string' || v.length > 5_000_000) return null;
      JSON.parse(v); // every stored value is JSON
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Replace this device's game data with a backup. */
export function restoreBackup(data: Record<string, string>): void {
  const old: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && BACKUP_KEYS.test(k)) old.push(k); }
  old.forEach(k => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
}
