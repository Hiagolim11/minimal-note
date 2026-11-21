// Gera build/icon.png (1024x1024) desenhando em um canvas do Electron.
// Uso: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DRAW = `(() => {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const r = 230, m = 64;
  const rr = (X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); };
  // fundo
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#9b8cff'); g.addColorStop(.55, '#6d5dfc'); g.addColorStop(1, '#2fb8ff');
  rr(m, m, S - 2 * m, S - 2 * m, r); x.fillStyle = g; x.fill();
  // brilho
  const gl = x.createRadialGradient(S * .3, S * .25, 10, S * .3, S * .25, S * .6);
  gl.addColorStop(0, 'rgba(255,255,255,.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.save(); rr(m, m, S - 2 * m, S - 2 * m, r); x.clip(); x.fillStyle = gl; x.fillRect(0, 0, S, S); x.restore();
  // folha
  x.save(); x.shadowColor = 'rgba(20,10,80,.35)'; x.shadowBlur = 50; x.shadowOffsetY = 20;
  rr(300, 230, 424, 564, 60); x.fillStyle = '#ffffff'; x.fill(); x.restore();
  // linhas
  x.fillStyle = '#6d5dfc'; rr(370, 330, 230, 34, 17); x.fill();
  x.fillStyle = '#c9c3ff';
  [[410, 284], [470, 230], [530, 284], [590, 180]].forEach(([y, w]) => { rr(370, y, w, 26, 13); x.fill(); });
  // ponto de destaque
  x.beginPath(); x.arc(640, 690, 46, 0, Math.PI * 2); x.fillStyle = '#2fb8ff'; x.fill();
  return c.toDataURL('image/png');
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const url = await win.webContents.executeJavaScript(DRAW);
  const out = path.join(__dirname, 'icon.png');
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('Ícone salvo em', out);
  app.exit(0);
});
