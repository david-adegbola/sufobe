/**
 * Tikka, the black woodpecker (palokärki, Dryocopus martius): Finland's
 * largest woodpecker. All black, red crown, pale ivory bill, pale yellow eye,
 * stiff tail braced against the trunk. Clings to the birch, facing the trunk,
 * and drums before speaking. See docs/art-bible.md for the character sheet.
 */
export function drawTikka(c: CanvasRenderingContext2D, x: number, y: number, size: number, peck: number, bob: number) {
  const s = size / 46; // designed at 46 px tall
  c.save();
  c.translate(x, y + bob * s);
  c.scale(s, s);
  // stiff tail braced against the trunk
  c.fillStyle = '#141414';
  c.beginPath(); c.moveTo(-4, 14); c.lineTo(-9, 30); c.lineTo(-1, 28); c.lineTo(3, 14); c.closePath(); c.fill();
  // body, leaning towards the trunk on the left
  c.beginPath(); c.ellipse(0, 2, 8.5, 15, -0.15, 0, Math.PI * 2); c.fill();
  // feet gripping the bark
  c.strokeStyle = '#4a4a44'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-6, 12); c.lineTo(-10, 13); c.moveTo(-6, 6); c.lineTo(-10, 6); c.stroke();
  // wing sheen
  c.fillStyle = '#26282e';
  c.beginPath(); c.ellipse(2.5, 2, 5, 11, -0.1, 0, Math.PI * 2); c.fill();
  // head, moving forward when it pecks
  const hx = -2 - peck * 3;
  c.fillStyle = '#141414';
  c.beginPath(); c.ellipse(hx, -16, 7, 6.5, 0, 0, Math.PI * 2); c.fill();
  // red crown
  c.fillStyle = '#d42b2b';
  c.beginPath(); c.ellipse(hx + 1, -21, 5.6, 3.6, -0.2, Math.PI, Math.PI * 2.05); c.fill();
  c.beginPath(); c.moveTo(hx + 4, -21); c.lineTo(hx + 8, -23); c.lineTo(hx + 5, -18.5); c.closePath(); c.fill();
  // pale ivory bill pointing at the trunk
  c.fillStyle = '#e8dcc0';
  c.beginPath(); c.moveTo(hx - 5, -17.5); c.lineTo(hx - 15, -15.5); c.lineTo(hx - 5, -14); c.closePath(); c.fill();
  // pale eye
  c.fillStyle = '#f3ecc0';
  c.beginPath(); c.arc(hx - 1.5, -17, 1.7, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#111';
  c.beginPath(); c.arc(hx - 1.8, -17, 0.8, 0, Math.PI * 2); c.fill();
  c.restore();
}
