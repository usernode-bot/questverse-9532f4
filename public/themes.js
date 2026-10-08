// QuestVerse seasonal themes.
//
// One theme is live for every player at a time; the Creator Studio picks it
// and the server stores it (qv_settings, read back on GET /api/me). A theme
// is only a set of colour-token overrides in styles/tailwind-input.css,
// switched on by html[data-theme="<id>"]. Neon is the everyday look and sets
// no attribute at all. Keep these ids in step with THEME_IDS in server.js.

export const DEFAULT_THEME = 'neon';

// swatches: [accent, signal] as the "R G B" token values in the stylesheet.
export const THEMES = [
  { id: 'neon', name: 'Neon', description: 'The everyday QuestVerse look.', swatches: ['168 85 247', '34 211 238'] },
  { id: 'halloween', name: 'Halloween', description: 'Pumpkin orange and lantern lime.', swatches: ['249 115 22', '163 230 53'] },
  { id: 'winter', name: 'Winter Lights', description: 'Frost blue and aurora mint.', swatches: ['56 189 248', '167 243 208'] },
  { id: 'lunar', name: 'Lunar New Year', description: 'Lantern gold and festival red.', swatches: ['250 204 21', '248 113 113'] },
];

export function isTheme(id) {
  return THEMES.some((t) => t.id === id);
}

export function themeName(id) {
  const t = THEMES.find((x) => x.id === id);
  return t ? t.name : THEMES[0].name;
}

// Recolour this page. Only touches the document, never storage or the server.
export function applyTheme(id) {
  const root = document.documentElement;
  if (isTheme(id) && id !== DEFAULT_THEME) root.dataset.theme = id;
  else delete root.dataset.theme;
}

// The last live theme this browser saw. Global, not per person, because the
// theme is the same for everyone; it only spares a Neon flash on load.
const CACHE_KEY = 'qv1:theme';

export function cachedTheme() {
  try {
    const v = window.localStorage.getItem(CACHE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function cacheTheme(id) {
  try { window.localStorage.setItem(CACHE_KEY, id); } catch { /* ignore */ }
}
