"""Bundle the app into one self-contained HTML file (no doctype/html/head/body),
for publishing as a claude.ai Artifact. Usage: python3 tools/build-artifact.py OUT.html"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
def inline(m):
    return '<script>\n' + (root / m.group(1)).read_text() + '\n</script>'
body = re.sub(r'<script src="([^"]+)"></script>', inline, body)
out = ('<title>Mistä puu tulee?</title>\n'
       '<meta name="description" content="Guided-discovery simulation: watch carbon travel from the air into a birch tree and back.">\n'
       '<style>\n' + css + '\n</style>\n' + body.strip() + '\n')
pathlib.Path(sys.argv[1]).write_text(out)
print('wrote', sys.argv[1], len(out), 'bytes')
