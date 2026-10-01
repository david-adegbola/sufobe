/** Weather and resource icons, drawn the same on every device (no emoji fonts). */
import type { Weather } from '../../core/weather';

export type IconKind = Weather | 'drop' | 'midsummer';

export function drawIcon(c: CanvasRenderingContext2D, kind: IconKind, x: number, y: number, size: number, alpha = 1) {
  const s = size / 24;
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y);
  c.scale(s, s);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const sun = (cx: number, cy: number, r: number) => {
    c.fillStyle = '#ffc83d';
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffc83d'; c.lineWidth = 2.2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (r + 2.5), cy + Math.sin(a) * (r + 2.5));
      c.lineTo(cx + Math.cos(a) * (r + 5.5), cy + Math.sin(a) * (r + 5.5));
      c.stroke();
    }
  };
  const cloud = (fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(-5, 3, 6, 0, Math.PI * 2); c.arc(2, -1, 7.5, 0, Math.PI * 2); c.arc(8, 4, 5, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-5, 3, 13, 6);
  };
  switch (kind) {
    case 'sun': sun(0, 0, 6); break;
    case 'cloudy': sun(-5, -4, 4.5); cloud('#eef3f5'); break;
    case 'rain':
      cloud('#cfd9df');
      c.strokeStyle = '#7cc4ec'; c.lineWidth = 2.2;
      for (const dx of [-6, 0, 6]) { c.beginPath(); c.moveTo(dx, 12); c.lineTo(dx - 2, 17); c.stroke(); }
      break;
    case 'heat':
      c.fillStyle = '#fff3e0';
      c.beginPath(); c.roundRect(-3, -11, 6, 16, 3); c.fill();
      c.fillStyle = '#f2711c';
      c.beginPath(); c.arc(0, 7, 5, 0, Math.PI * 2); c.fill();
      c.fillRect(-1.4, -6, 2.8, 12);
      c.strokeStyle = '#f2711c'; c.lineWidth = 1.8;
      for (const dy of [-8, -4]) { c.beginPath(); c.moveTo(5, dy); c.lineTo(8, dy); c.stroke(); }
      break;
    case 'drop':
      c.fillStyle = '#7cc4ec';
      c.beginPath(); c.moveTo(0, -10); c.bezierCurveTo(7, -1, 7, 8, 0, 8); c.bezierCurveTo(-7, 8, -7, -1, 0, -10); c.fill();
      break;
    case 'midsummer':
      // the sun only dips to the horizon: the nightless night
      c.save(); c.beginPath(); c.rect(-12, -12, 24, 14); c.clip(); sun(0, 2, 6); c.restore();
      c.strokeStyle = '#f3f6f1'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-11, 3); c.lineTo(11, 3); c.stroke();
      break;
  }
  c.restore();
}

/** The same icons as inline SVG for the HTML screens. */
export function iconSvg(kind: Weather, size = 28): string {
  const body: Record<Weather, string> = {
    sun: '<circle cx="12" cy="12" r="5" fill="#ffc83d"/><g stroke="#ffc83d" stroke-width="2" stroke-linecap="round">' +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="12" y1="2.5" x2="12" y2="5" transform="rotate(${a} 12 12)"/>`).join('') + '</g>',
    cloudy: '<circle cx="8" cy="8" r="4" fill="#ffc83d"/><path d="M5 18a5 5 0 0 1 1-9.9A6.5 6.5 0 0 1 18.5 11 4 4 0 0 1 18 18z" fill="#eef3f5"/>',
    rain: '<path d="M5 14a5 5 0 0 1 1-9.9A6.5 6.5 0 0 1 18.5 7 4 4 0 0 1 18 14z" fill="#cfd9df"/><g stroke="#7cc4ec" stroke-width="2" stroke-linecap="round"><line x1="7" y1="17" x2="6" y2="21"/><line x1="12" y1="17" x2="11" y2="21"/><line x1="17" y1="17" x2="16" y2="21"/></g>',
    heat: '<rect x="9" y="2" width="6" height="15" rx="3" fill="#fff3e0"/><circle cx="12" cy="18" r="4.5" fill="#f2711c"/><rect x="10.8" y="7" width="2.4" height="10" fill="#f2711c"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body[kind]}</svg>`;
}
