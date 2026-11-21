// Gera ícones e telas de abertura do Android a partir de build/icon.png
// e ajusta versão/permissões do projeto android/.
// Uso: npx electron build/make-android-assets.js   (precisa do nativeImage do Electron)
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const pkg = require(path.join(root, 'package.json'));
const BG = [0x0f, 0x11, 0x17]; // fundo da tela de abertura (tema Meia-noite)
const ICON_BG = '#7B6CF7';

function rgbaOf(img, w, h) {
  // nativeImage usa BGRA; convertemos para RGBA para facilitar
  const b = img.resize({ width: w, height: h, quality: 'best' }).toBitmap();
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = b[i * 4 + 2]; out[i * 4 + 1] = b[i * 4 + 1]; out[i * 4 + 2] = b[i * 4]; out[i * 4 + 3] = b[i * 4 + 3]; }
  return out;
}
function toImage(rgba, w, h) {
  const b = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { b[i * 4] = rgba[i * 4 + 2]; b[i * 4 + 1] = rgba[i * 4 + 1]; b[i * 4 + 2] = rgba[i * 4]; b[i * 4 + 3] = rgba[i * 4 + 3]; }
  return nativeImage.createFromBitmap(b, { width: w, height: h });
}
function write(file, img) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, img.toPNG()); }

app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(root, 'build', 'icon.png'));
  const S = src.getSize().width; // 1024
  // área do quadrado arredondado com degradê (sem a margem transparente)
  const inset = Math.round(S * 0.0625), side = S - inset * 2;
  const tile = src.crop({ x: inset, y: inset, width: side, height: side });

  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const legacy = Math.round(48 * k), fg = Math.round(108 * k);
    const dir = path.join(res, 'mipmap-' + d);
    // ícone clássico: o próprio ícone (já tem cantos arredondados)
    write(path.join(dir, 'ic_launcher.png'), src.resize({ width: legacy, height: legacy, quality: 'best' }));
    // ícone redondo: recorte circular do degradê
    const px = rgbaOf(tile, legacy, legacy), r = legacy / 2;
    for (let y = 0; y < legacy; y++) for (let x = 0; x < legacy; x++) {
      const dd = Math.hypot(x + 0.5 - r, y + 0.5 - r), a = Math.max(0, Math.min(1, r - dd + 0.5));
      px[(y * legacy + x) * 4 + 3] = Math.round(px[(y * legacy + x) * 4 + 3] * a);
    }
    write(path.join(dir, 'ic_launcher_round.png'), toImage(px, legacy, legacy));
    // primeiro plano do ícone adaptativo: degradê ocupando a camada inteira (o launcher aplica a máscara)
    write(path.join(dir, 'ic_launcher_foreground.png'), tile.resize({ width: fg, height: fg, quality: 'best' }));
  }
  fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ICON_BG}</color>\n</resources>\n`);

  // telas de abertura: ícone centralizado sobre o fundo escuro, no tamanho de cada splash.png existente
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(res).filter((f) => path.basename(f) === 'splash.png')) {
    const { width: w, height: h } = nativeImage.createFromPath(f).getSize();
    const out = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { out[i * 4] = BG[0]; out[i * 4 + 1] = BG[1]; out[i * 4 + 2] = BG[2]; out[i * 4 + 3] = 255; }
    const s = Math.round(Math.min(w, h) * 0.3), ic = rgbaOf(src, s, s), ox = Math.round((w - s) / 2), oy = Math.round((h - s) / 2);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const si = (y * s + x) * 4, di = ((oy + y) * w + (ox + x)) * 4, a = ic[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[di + c] = Math.round(ic[si + c] * a + out[di + c] * (1 - a));
    }
    write(f, toImage(out, w, h));
  }

  // versão do app = versão do package.json (1.2.0 → código 10200)
  const gradle = path.join(root, 'android', 'app', 'build.gradle');
  const [ma, mi, pa] = pkg.version.split('.').map(Number);
  let g = fs.readFileSync(gradle, 'utf8');
  g = g.replace(/versionCode \d+/, `versionCode ${ma * 10000 + mi * 100 + pa}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
  fs.writeFileSync(gradle, g);

  // permissões para salvar o cofre em Documentos em Androids antigos (≤ 10)
  const mf = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  let m = fs.readFileSync(mf, 'utf8');
  if (!m.includes('WRITE_EXTERNAL_STORAGE')) {
    m = m.replace('<uses-permission android:name="android.permission.INTERNET" />',
      '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />');
  }
  if (!m.includes('requestLegacyExternalStorage')) m = m.replace('android:allowBackup="true"', 'android:allowBackup="true"\n        android:requestLegacyExternalStorage="true"');
  fs.writeFileSync(mf, m);
  console.log('Ícones, splash, versão', pkg.version, 'e permissões atualizados.');
  app.quit();
});
