// Bundle the game into one self-contained HTML body (no <html>/<head>),
// for publishing as a claude.ai Artifact. Output: dist/kasva.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({ entryPoints: ['src/app/main.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const links = (html.match(/<link [^>]*>/g) || []).join('\n');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/, '');
// SHARE_URL: the public address of the published page, so challenge links point there
const share = process.env.SHARE_URL ? `<meta name="kasva-share-url" content="${process.env.SHARE_URL.replace(/"/g, '')}">\n` : '';
const out = `<title>Kasva!</title>\n<meta name="theme-color" content="#0f3b35">\n${share}${links}\n${style}\n${body.trim()}\n<script>${js}</script>\n`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/kasva.html', out);
console.log('dist/kasva.html', (out.length / 1024).toFixed(1), 'KB');
