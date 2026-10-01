// Bundle the grey box into one self-contained HTML body (no <html>/<head>),
// for publishing as a claude.ai Artifact. Output: dist/kasva-greybox.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({ entryPoints: ['src/greybox/main.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/, '');
const out = `<title>Kasva! grey box</title>\n<meta name="theme-color" content="#0f3b35">\n${style}\n${body.trim()}\n<script>${js}</script>\n`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/kasva-greybox.html', out);
console.log('dist/kasva-greybox.html', (out.length / 1024).toFixed(1), 'KB');
