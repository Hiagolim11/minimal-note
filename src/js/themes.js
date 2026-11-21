// Temas, fontes e aplicação das preferências visuais
const THEMES = {
  midnight: {
    name: 'Meia-noite', dark: true, accent: '#8b7bff',
    bg: '#0f1117', bg2: '#141720', bg3: '#1b1f2b', surface: '#20253280', border: '#262b3a',
    text: '#e6e8ef', muted: '#9aa0b4', faint: '#5d6479', code: '#171a24',
  },
  obsidianish: {
    name: 'Grafite', dark: true, accent: '#a88bfa',
    bg: '#1e1e1e', bg2: '#252525', bg3: '#2d2d2d', surface: '#33333380', border: '#363636',
    text: '#dcddde', muted: '#a3a3a3', faint: '#6b6b6b', code: '#262626',
  },
  glacier: {
    name: 'Glacial', dark: true, accent: '#88c0d0',
    bg: '#232832', bg2: '#2a303c', bg3: '#313846', surface: '#3b425280', border: '#3b4252',
    text: '#e5e9f0', muted: '#a7b1c2', faint: '#6c7689', code: '#2a303c',
  },
  aurora: {
    name: 'Aurora', dark: true, accent: '#f472b6',
    bg: '#120d1f', bg2: '#181127', bg3: '#211836', surface: '#2a1f4480', border: '#2e2347',
    text: '#efe9ff', muted: '#b3a7d1', faint: '#6f6391', code: '#1b1430',
  },
  forest: {
    name: 'Floresta', dark: true, accent: '#7ee0a1',
    bg: '#0f1512', bg2: '#141c18', bg3: '#1b2520', surface: '#22302880', border: '#24322b',
    text: '#e3efe8', muted: '#9fb8aa', faint: '#5f7a6b', code: '#16201b',
  },
  ember: {
    name: 'Brasa', dark: true, accent: '#ff9f5a',
    bg: '#16110e', bg2: '#1d1612', bg3: '#261d17', surface: '#30251d80', border: '#33271f',
    text: '#f3e9e1', muted: '#c2ad9d', faint: '#7c6858', code: '#1f1813',
  },
  oled: {
    name: 'OLED', dark: true, accent: '#5eead4',
    bg: '#000000', bg2: '#070707', bg3: '#101010', surface: '#18181880', border: '#1c1c1c',
    text: '#ededed', muted: '#9a9a9a', faint: '#555555', code: '#0c0c0c',
  },
  paper: {
    name: 'Papel', dark: false, accent: '#6d5dfc',
    bg: '#ffffff', bg2: '#f6f6f8', bg3: '#eeeef2', surface: '#ffffffcc', border: '#e4e4ea',
    text: '#1f2230', muted: '#5f6477', faint: '#9da1b1', code: '#f4f4f7',
  },
  sepia: {
    name: 'Sépia', dark: false, accent: '#b5651d',
    bg: '#faf4e8', bg2: '#f3ebdb', bg3: '#ebe1cd', surface: '#fffaf0cc', border: '#e2d6bf',
    text: '#3b2f22', muted: '#6e5d49', faint: '#a89780', code: '#f1e8d6',
  },
  sky: {
    name: 'Céu', dark: false, accent: '#0ea5e9',
    bg: '#f7fbff', bg2: '#eef5fc', bg3: '#e3eef9', surface: '#ffffffcc', border: '#d8e5f2',
    text: '#13263a', muted: '#4c6178', faint: '#93a5b9', code: '#ecf3fa',
  },
  rose: {
    name: 'Rosé', dark: false, accent: '#e11d74',
    bg: '#fff8fa', bg2: '#fcf0f4', bg3: '#f7e4eb', surface: '#ffffffcc', border: '#f0d9e2',
    text: '#33141f', muted: '#76495a', faint: '#b38c9b', code: '#fbeef3',
  },
};

const ACCENTS = ['#8b7bff', '#6d5dfc', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#ec4899', '#d946ef'];

const FONTS = {
  inter: { name: 'Inter', css: "'Inter Variable', 'Segoe UI', system-ui, sans-serif" },
  outfit: { name: 'Outfit', css: "'Outfit Variable', 'Segoe UI', system-ui, sans-serif" },
  system: { name: 'Sistema', css: "system-ui, 'Segoe UI', Roboto, sans-serif" },
  lora: { name: 'Lora (serifa)', css: "'Lora Variable', Georgia, serif" },
  georgia: { name: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  jetbrains: { name: 'JetBrains Mono', css: "'JetBrains Mono Variable', Consolas, monospace" },
  cascadia: { name: 'Cascadia / Consolas', css: "'Cascadia Code', Consolas, 'Courier New', monospace" },
};

const DEFAULT_SETTINGS = {
  vaultPath: null,
  theme: 'midnight',
  accent: null, // null = cor do tema
  overrides: {},
  customThemes: {}, // temas criados no criador de temas
  fontUi: 'inter',
  fontEditor: 'inter',
  fontMono: 'jetbrains',
  customFont: '',
  fontSize: 16,
  lineHeight: 1.7,
  contentWidth: 760,
  radius: 10,
  glass: true,
  background: 'glow', // plain | glow | mesh
  density: 'comfortable',
  ribbon: true,
  animations: true,
  // partículas e cursor
  fxParticles: true,
  fxStyle: 'dust',       // dust | fireflies | stars | snow | bokeh | bubbles
  fxDensity: 30,         // 5–150
  fxSpeed: 40,           // 5–150
  fxSize: 50,            // 20–150
  fxOpacity: 55,         // 10–100
  fxColor: 'accent',     // accent | theme | rainbow | custom
  fxCustomColor: '#facc15',
  fxMouse: 'none',       // none | repel | attract
  fxLayer: 'front',      // back | front (atrás só aparece onde a interface é transparente)
  fxCursor: 'off',       // off | sparkle | trail | glow | confetti
  fxClickBurst: false,
  workspaceOpacity: 88,  // transparência da área de escrita (deixa o fundo aparecer)
  defaultMode: 'edit',
  spellcheck: true,
  autosaveDelay: 600,
  smartLists: true,
  autoPair: true,
  newNoteFolder: '',
  attachmentsFolder: 'Anexos',
  dailyFolder: 'Diário',
  customCss: '',
  expanded: [],
  sort: 'name',
  leftWidth: 270,
  rightWidth: 280,
  leftOpen: true,
  rightOpen: true,
  leftPanel: 'files',
  rightPanel: 'outline',
  openTabs: [],
  activeTab: null,
  graph: { tags: false, orphans: true, labels: true, ghosts: true },
};

function hexToRgb(hex) {
  const h = hex.replace('#', '').slice(0, 6);
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function contrastText(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#111111' : '#ffffff';
}

// ---------- utilidades de cor / temas personalizados ----------
const THEME_TOKENS = [
  ['bg', 'Fundo', 'Área principal de escrita'],
  ['bg2', 'Barras laterais', 'Sidebar, abas e barra de status'],
  ['bg3', 'Elementos', 'Botões, cartões e campos'],
  ['border', 'Bordas', 'Divisórias e contornos'],
  ['text', 'Texto', 'Texto principal'],
  ['muted', 'Texto secundário', 'Legendas e itens inativos'],
  ['faint', 'Texto apagado', 'Dicas e marcadores'],
  ['code', 'Fundo de código', 'Blocos e trechos de código'],
  ['accent', 'Destaque', 'Seleção, botões e foco'],
];
const THEME_EXTRA_TOKENS = [
  ['heading', 'Títulos', 'Vazio = cor do texto'],
  ['link', 'Links', 'Vazio = cor de destaque'],
  ['tag', 'Tags', 'Vazio = cor de destaque'],
  ['highlight', 'Marca-texto', '==texto== · vazio = amarelo'],
];
const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

// Gera uma paleta completa a partir de uma cor base, modo e intensidade do tom no fundo (0–100).
function generatePalette({ base = '#8b7bff', dark = true, tint = 35, contrast = 50 } = {}) {
  const [h, sat] = hexToHsl(base);
  const ts = Math.min(sat, 100) * (tint / 100) * 0.55; // saturação do fundo
  const c = contrast / 50; // 0..2
  if (dark) {
    const L = 6 + (1 - c) * 4;
    return {
      dark: true, accent: base,
      bg: hslToHex(h, ts, L), bg2: hslToHex(h, ts, L + 2.5), bg3: hslToHex(h, ts, L + 6), border: hslToHex(h, ts, L + 9.5),
      code: hslToHex(h, ts, L + 3.5),
      text: hslToHex(h, ts * 0.4, 88 + c * 3.5), muted: hslToHex(h, ts * 0.5, 62 + c * 3), faint: hslToHex(h, ts * 0.5, 38 + c * 2),
    };
  }
  const L = 99 - (1 - c) * 3;
  return {
    dark: false, accent: base,
    bg: hslToHex(h, ts, L), bg2: hslToHex(h, ts * 1.1, L - 3), bg3: hslToHex(h, ts * 1.1, L - 6.5), border: hslToHex(h, ts, L - 10.5),
    code: hslToHex(h, ts, L - 3.5),
    text: hslToHex(h, ts * 0.6, 14 - c * 4), muted: hslToHex(h, ts * 0.5, 38 - c * 3), faint: hslToHex(h, ts * 0.4, 63 - c * 2),
  };
}

// Normaliza um tema (preenche "surface" e valida cores); usado por temas personalizados e importados.
function normalizeTheme(t, fallback = THEMES.midnight) {
  const out = { name: String(t?.name || 'Meu tema').slice(0, 40), dark: t?.dark !== undefined ? !!t.dark : fallback.dark };
  for (const [k] of THEME_TOKENS) out[k] = isHex(t?.[k]) ? t[k].trim() : fallback[k];
  for (const [k] of THEME_EXTRA_TOKENS) if (isHex(t?.[k])) out[k] = t[k].trim();
  out.surface = isHex(t?.surface) ? t.surface : (out.dark ? out.bg3.slice(0, 7) + '80' : out.bg.slice(0, 7) + 'cc');
  return out;
}
function allThemes(s) { return { ...THEMES, ...(s?.customThemes || {}) }; }
function themeOf(s, id = s.theme) { return s?.customThemes?.[id] || THEMES[id] || THEMES.midnight; }

// Aplica as variáveis de cor de um tema a um elemento (raiz ou pré-visualização).
function applyThemeVars(el, t, accent) {
  const set = (k, v) => el.style.setProperty(k, v);
  set('--bg', t.bg); set('--bg-2', t.bg2); set('--bg-3', t.bg3);
  set('--surface', t.surface); set('--border', t.border);
  set('--text', t.text); set('--text-muted', t.muted); set('--text-faint', t.faint);
  set('--code-bg', t.code);
  set('--accent', accent); set('--accent-contrast', contrastText(accent));
  for (const [k] of THEME_EXTRA_TOKENS) { if (t[k]) set('--' + k, t[k]); else el.style.removeProperty('--' + k); }
}

function applyAppearance(s) {
  const t = { ...themeOf(s), ...(s.overrides?.[s.theme] || {}) };
  const accent = s.accent || t.accent;
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  applyThemeVars(root, t, accent);
  const custom = s.customFont?.trim() ? `'${s.customFont.trim().replace(/'/g, '')}', ` : '';
  set('--font-ui', (FONTS[s.fontUi] || FONTS.inter).css);
  set('--font-editor', custom + (FONTS[s.fontEditor] || FONTS.inter).css);
  set('--font-mono', (FONTS[s.fontMono] || FONTS.jetbrains).css);
  set('--font-size', s.fontSize + 'px');
  set('--line-height', s.lineHeight);
  set('--content-width', s.contentWidth >= 1400 ? '100%' : s.contentWidth + 'px');
  set('--radius', s.radius + 'px');
  set('--ws-alpha', Math.max(40, Math.min(100, s.workspaceOpacity ?? 88)) + '%');
  set('--left-width', s.leftWidth + 'px');
  set('--right-width', s.rightWidth + 'px');
  root.dataset.mode = t.dark ? 'dark' : 'light';
  root.dataset.bg = s.background;
  root.dataset.density = s.density;
  root.classList.toggle('glass', !!s.glass);
  root.classList.toggle('no-anim', !s.animations);
  root.classList.toggle('no-ribbon', !s.ribbon);
  let style = document.getElementById('custom-css');
  if (!style) { style = document.createElement('style'); style.id = 'custom-css'; document.head.appendChild(style); }
  style.textContent = s.customCss || '';
  window.lumen?.win.nativeTheme(t.dark ? 'dark' : 'light');
}
