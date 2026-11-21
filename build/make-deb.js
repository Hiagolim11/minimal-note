// Empacota dist/linux-unpacked em um .deb sem depender de fpm/dpkg
// (permite gerar o pacote Linux a partir do Windows).
// Uso: node build/make-deb.js   (depois de: electron-builder --linux dir --x64)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const NAME = pkg.name;                       // minimal-note
const PRODUCT = pkg.productName;             // Minimal Note
const VERSION = pkg.version;
const SRC = path.join(root, 'dist', 'linux-unpacked');
const OUT = path.join(root, 'dist', `${NAME}_${VERSION}_amd64.deb`);
const INSTALL_DIR = `opt/${NAME}`;
const MTIME = Math.floor(Date.now() / 1000);

if (!fs.existsSync(SRC)) { console.error('Não encontrei', SRC, '— rode "npm run build:linux-dir" antes.'); process.exit(1); }

// ---------- tar (ustar) ----------
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }
function header({ name, mode, size = 0, type = '0', linkname = '' }) {
  const b = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const i = name.lastIndexOf('/', 154);
    prefix = name.slice(0, i); name = name.slice(i + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error('Caminho longo demais: ' + prefix + '/' + name);
  }
  b.write(name, 0, 100);
  b.write(octal(mode, 8), 100); b.write(octal(0, 8), 108); b.write(octal(0, 8), 116);
  b.write(octal(size, 12), 124); b.write(octal(MTIME, 12), 136);
  b.write('        ', 148); b.write(type, 156); b.write(linkname, 157, 100);
  b.write('ustar\0', 257); b.write('00', 263); b.write('root', 265); b.write('root', 297);
  b.write(prefix, 345, 155);
  let sum = 0; for (const x of b) sum += x;
  b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return b;
}
function tarGz(entries) {
  const chunks = [];
  for (const e of entries) {
    const data = e.data || Buffer.alloc(0);
    chunks.push(header({ ...e, size: e.type === '5' ? 0 : data.length }));
    if (e.type !== '5' && data.length) {
      chunks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) chunks.push(Buffer.alloc(pad));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks), { level: 9 });
}

// ---------- ar ----------
function ar(members) {
  const parts = [Buffer.from('!<arch>\n')];
  for (const { name, data } of members) {
    const h = (name + '/').padEnd(16) + String(MTIME).padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(data.length).padEnd(10) + '`\n';
    parts.push(Buffer.from(h), data);
    if (data.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

// ---------- conteúdo ----------
const EXEC = new Set([NAME, 'chrome-sandbox', 'chrome_crashpad_handler']);
const data = [];
let totalBytes = 0;
const addDir = (p) => data.push({ name: `./${p}/`, mode: 0o755, type: '5' });
const addFile = (p, buf, mode = 0o644) => { data.push({ name: `./${p}`, mode, data: buf }); totalBytes += buf.length; };

['opt', INSTALL_DIR, 'usr', 'usr/share', 'usr/share/applications', 'usr/share/icons', 'usr/share/icons/hicolor',
  'usr/share/icons/hicolor/512x512', 'usr/share/icons/hicolor/512x512/apps'].forEach(addDir);

(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { addDir(`${INSTALL_DIR}/${r}`); walk(abs, r); }
    else {
      const exec = EXEC.has(r) || /\.so(\.\d+)*$/.test(e.name);
      addFile(`${INSTALL_DIR}/${r}`, fs.readFileSync(abs), exec ? 0o755 : 0o644);
    }
  }
})(SRC, '');

const icon = path.join(__dirname, 'icon.png');
if (fs.existsSync(icon)) addFile(`usr/share/icons/hicolor/512x512/apps/${NAME}.png`, fs.readFileSync(icon));
addFile(`usr/share/applications/${NAME}.desktop`, Buffer.from(`[Desktop Entry]
Name=${PRODUCT}
Comment=${pkg.description}
Exec=/opt/${NAME}/${NAME} %U
Icon=${NAME}
Terminal=false
Type=Application
Categories=Office;Utility;TextEditor;
MimeType=text/markdown;
StartupWMClass=${PRODUCT}
`));

const control = `Package: ${NAME}
Version: ${VERSION}
Section: editors
Priority: optional
Architecture: amd64
Installed-Size: ${Math.ceil(totalBytes / 1024)}
Maintainer: ${pkg.author?.name || PRODUCT} <${pkg.author?.email || 'noreply@example.com'}>
Homepage: ${pkg.homepage || ''}
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0, libasound2 | libasound2t64, libgbm1
Description: ${pkg.description}
 ${PRODUCT} guarda suas notas como arquivos Markdown locais, com links
 [[wiki]], grafo, busca, temas e personalização completa.
`;
const postinst = `#!/bin/sh
set -e
ln -sf '/opt/${NAME}/${NAME}' '/usr/bin/${NAME}'
chmod 4755 '/opt/${NAME}/chrome-sandbox' || true
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -q /usr/share/icons/hicolor >/dev/null 2>&1 || true
`;
const postrm = `#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then rm -f '/usr/bin/${NAME}'; fi
`;

const controlTar = tarGz([
  { name: './', mode: 0o755, type: '5' },
  { name: './control', mode: 0o644, data: Buffer.from(control) },
  { name: './postinst', mode: 0o755, data: Buffer.from(postinst) },
  { name: './postrm', mode: 0o755, data: Buffer.from(postrm) },
]);
console.log('Compactando', data.length, 'itens…');
const dataTar = tarGz([{ name: './', mode: 0o755, type: '5' }, ...data]);

fs.writeFileSync(OUT, ar([
  { name: 'debian-binary', data: Buffer.from('2.0\n') },
  { name: 'control.tar.gz', data: controlTar },
  { name: 'data.tar.gz', data: dataTar },
]));
console.log('Pacote gerado:', OUT, `(${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
