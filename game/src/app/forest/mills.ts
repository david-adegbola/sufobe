/**
 * Forest to factory, drawn: item icons for the product shelf, and a small
 * diorama where a timber truck carries the child's logs to the sawmill, the
 * pulp mill and the biorefinery, and conveyors carry the leftovers between
 * them. Flat poster style, no brand names, nothing grim.
 */
import type { ItemId } from '../../core/forest';

const ICON: Record<ItemId, string> = {
  beam: '<rect x="4" y="14" width="40" height="8" rx="2" fill="#c98f52"/><rect x="4" y="24" width="40" height="8" rx="2" fill="#b57a40"/><circle cx="8" cy="18" r="3" fill="#e8c48e"/><circle cx="8" cy="28" r="3" fill="#e8c48e"/>',
  table: '<rect x="6" y="14" width="36" height="6" rx="2" fill="#c98f52"/><rect x="10" y="20" width="4" height="18" fill="#a87038"/><rect x="34" y="20" width="4" height="18" fill="#a87038"/>',
  notebook: '<rect x="12" y="6" width="26" height="34" rx="2" fill="#f3efe3" stroke="#5b7fa6" stroke-width="2"/><path d="M17 15h16M17 21h16M17 27h12" stroke="#9fb3c8" stroke-width="2"/><path d="M12 10h-3M12 18h-3M12 26h-3M12 34h-3" stroke="#555" stroke-width="2"/>',
  box: '<path d="M6 16 24 8l18 8v20l-18 8-18-8z" fill="#c7a271"/><path d="M6 16l18 8 18-8M24 24v20" stroke="#8a6a42" stroke-width="2" fill="none"/>',
  shirt: '<path d="M16 8 6 14l4 8 5-3v21h18V19l5 3 4-8-10-6c-1 4-4 6-8 6s-7-2-8-6z" fill="#6fa3c8"/>',
  sauna: '<rect x="8" y="22" width="32" height="18" rx="3" fill="#7a5530"/><rect x="14" y="28" width="20" height="8" fill="#f2a93b"/><path d="M16 18c-3-4 3-6 0-10M24 18c-3-4 3-6 0-10M32 18c-3-4 3-6 0-10" stroke="#c4d6cc" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
};

export function itemIcon(item: ItemId, size = 40): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${ICON[item]}</svg>`;
}

/**
 * One frame of the mills diorama. `p` runs 0..1 (the truck's trip, then the
 * conveyors); `amounts` (0..1) set how busy each mill looks.
 */
export function drawMills(cv: HTMLCanvasElement, p: number, amounts: { saw: number; pulp: number; bio: number }, logs: number) {
  const c = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9cc9e6'); sky.addColorStop(1, '#e3f1ef');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  const gy = H * 0.78;
  // hills and forest edge
  c.fillStyle = '#7f9f93';
  c.beginPath(); c.moveTo(0, gy); c.quadraticCurveTo(W * 0.25, gy - H * 0.35, W * 0.5, gy - H * 0.1); c.quadraticCurveTo(W * 0.8, gy - H * 0.3, W, gy - H * 0.05); c.lineTo(W, gy); c.fill();
  c.fillStyle = '#2c5a3c';
  for (let i = 0; i < 7; i++) {
    const x = 6 + i * W * 0.028, h = H * (0.22 + 0.06 * ((i * 7) % 3));
    c.beginPath(); c.moveTo(x, gy - h); c.lineTo(x - h * 0.22, gy); c.lineTo(x + h * 0.22, gy); c.fill();
  }
  c.fillStyle = '#6f9a4a'; c.fillRect(0, gy, W, H - gy);
  c.fillStyle = '#9a9488'; c.fillRect(0, gy + H * 0.06, W, H * 0.05); // road

  // the three mills
  const sx = W * 0.5, px = W * 0.7, bx = W * 0.9;
  const bw = W * 0.14;
  // sawmill: long wooden shed with a log deck
  c.fillStyle = '#b5522f'; c.fillRect(sx - bw / 2, gy - H * 0.2, bw, H * 0.2);
  c.fillStyle = '#6e3b26'; c.beginPath(); c.moveTo(sx - bw / 2 - 4, gy - H * 0.2); c.lineTo(sx, gy - H * 0.3); c.lineTo(sx + bw / 2 + 4, gy - H * 0.2); c.fill();
  c.fillStyle = '#d9c3a0'; for (let i = 0; i < 3; i++) c.fillRect(sx - bw / 2 - bw * 0.35, gy - 6 - i * 6, bw * 0.3, 5);
  // pulp mill: tall building with a chimney and steam
  c.fillStyle = '#e8e2d4'; c.fillRect(px - bw / 2, gy - H * 0.3, bw, H * 0.3);
  c.fillStyle = '#8f8a80'; c.fillRect(px + bw * 0.2, gy - H * 0.5, bw * 0.12, H * 0.22);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 4; i++) { const t = (p * 3 + i / 4) % 1; c.beginPath(); c.arc(px + bw * 0.26 + t * 20, gy - H * 0.52 - t * H * 0.25, 5 + t * 10 * (0.5 + amounts.pulp), 0, Math.PI * 2); c.fill(); }
  // biorefinery: round tanks
  c.fillStyle = '#7fa6a0';
  c.fillRect(bx - bw * 0.45, gy - H * 0.22, bw * 0.35, H * 0.22);
  c.fillRect(bx, gy - H * 0.28, bw * 0.35, H * 0.28);
  c.fillStyle = '#5f8680'; c.beginPath(); c.ellipse(bx - bw * 0.275, gy - H * 0.22, bw * 0.175, 5, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(bx + bw * 0.175, gy - H * 0.28, bw * 0.175, 5, 0, 0, Math.PI * 2); c.fill();

  // conveyors: sawmill chips → pulp mill, sawdust → biorefinery
  c.strokeStyle = '#555'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(sx + bw / 2, gy - H * 0.08); c.lineTo(px - bw / 2, gy - H * 0.12); c.stroke();
  c.beginPath(); c.moveTo(px + bw / 2, gy - H * 0.06); c.lineTo(bx - bw * 0.45, gy - H * 0.06); c.stroke();
  const flow = Math.max(0, (p - 0.55) / 0.45);
  if (flow > 0) {
    c.fillStyle = '#e2c48e';
    for (let i = 0; i < 6 * amounts.saw + 1; i++) {
      const t = (flow * 2 + i / 6) % 1;
      c.fillRect(sx + bw / 2 + t * (px - bw / 2 - sx - bw / 2) - 3, gy - H * 0.08 - t * H * 0.04 - 6, 6, 4);
    }
    c.fillStyle = '#8a6a42';
    for (let i = 0; i < 6 * amounts.bio + 1; i++) {
      const t = (flow * 2 + i / 6) % 1;
      c.fillRect(px + bw / 2 + t * (bx - bw * 0.45 - px - bw / 2) - 3, gy - H * 0.06 - 6, 6, 4);
    }
  }

  // the timber truck drives from the forest to the mills
  const tp = Math.min(1, p / 0.55);
  const tx = W * 0.05 + tp * (sx - bw - W * 0.05);
  const ty = gy + H * 0.06;
  c.fillStyle = '#2a2a2a';
  for (const wx of [tx - 30, tx - 12, tx + 22]) { c.beginPath(); c.arc(wx, ty + 2, 6, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#d7262b'; c.fillRect(tx + 12, ty - 22, 22, 20); // cab
  c.fillStyle = '#cfe3ef'; c.fillRect(tx + 24, ty - 18, 8, 7);
  c.fillStyle = '#444'; c.fillRect(tx - 40, ty - 6, 52, 4);
  const n = Math.max(1, Math.min(9, logs));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 3), col = i % 3;
    c.fillStyle = '#9c6b3e'; c.fillRect(tx - 38, ty - 13 - row * 7 - 0, 48, 6);
    c.fillStyle = '#e2c48e'; c.beginPath(); c.arc(tx - 38 + col * 0.5, ty - 10 - row * 7, 3, 0, Math.PI * 2); c.fill();
  }
}
