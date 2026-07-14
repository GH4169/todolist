// ============================================================
// theme.js — 主题管理（6 套主题切换）
// ============================================================

const THEME_KEY = 'geek-todos-theme';

/**
 * 主题名称 → body 上对应的 CSS class 映射表。
 * 'cyber'（默认赛博朋克）不添加任何 class，依赖 :root 默认变量。
 */
const THEME_MAP = {
  cyber: '',
  midnight: 'theme-midnight',
  light: 'theme-light',
  warm: 'theme-warm',
  forest: 'theme-forest',
  ocean: 'theme-ocean',
};

const KNOWN_THEME_CLASSES = Object.values(THEME_MAP).filter(Boolean);

/**
 * 应用指定主题：先清除所有 theme-* class，再写入目标 class；
 * 同时将选择持久化到 LocalStorage 并更新按钮激活状态。
 * @param {string} themeName - THEME_MAP 的键名
 */
function applyTheme(themeName) {
  // 精确清除已知主题 class，避免正则误伤
  KNOWN_THEME_CLASSES.forEach(cls => document.body.classList.remove(cls));
  const cls = THEME_MAP[themeName];
  if (cls) document.body.classList.add(cls);
  localStorage.setItem(THEME_KEY, themeName);

  // 同步更新侧边栏主题按钮的 active 状态
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });
}

/**
 * 初始化主题：从 LocalStorage 读取上次选择，回退到 'cyber'。
 */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'cyber';
  applyTheme(saved);
}
