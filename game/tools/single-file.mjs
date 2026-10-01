// Bundle the game into one self-contained HTML body (no <html>/<head>),
// for publishing as a claude.ai Artifact. Output: dist/kasva.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/app/main.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  outdir: 'dist/tmp', define: { __PWA__: 'false' }, loader: { '.woff2': 'dataurl' }, // fonts travel inside the file: no font service
});
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
const html = readFileSync('index.html', 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
// the manifest and icons belong to the offline web build, not to the one-file page
const links = (html.match(/<link [^>]*>/g) || []).filter((l) => !/rel="(manifest|icon|apple-touch-icon)"/.test(l)).join('\n');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/, '');
// SHARE_URL: the public address of the published page, so challenge links point there
const share = process.env.SHARE_URL ? `<meta name="kasva-share-url" content="${process.env.SHARE_URL.replace(/"/g, '')}">\n` : '';
const out = `<title>Kasva!</title>\n<meta name="theme-color" content="#0f3b35">\n${share}${links}\n<style>${css}</style>\n${style}\n${body.trim()}\n<script>${js}</script>\n`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/kasva.html', out);
console.log('dist/kasva.html', (out.length / 1024).toFixed(1), 'KB');
