// ============================================================
// storage.js — LocalStorage 读写 & 数据初始化
// ============================================================

const STORAGE_KEY = 'geek-todos';

/**
 * 全局 todos 数组，由 main.js 共享。
 * 所有 CRUD 操作通过 main.js 中的方法修改此数组，
 * 随后调用 saveTodos() 持久化。
 */
let todos = [];

/**
 * 从 LocalStorage 读取原始数据并做结构归一化。
 * 确保每条任务都包含 subtasks / collapsed / createdAt / completedAt / description 字段。
 */
function loadTodos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  todos = parsed.map(t => ({
    ...t,
    subtasks: (t.subtasks || []).map(s => ({
      ...s,
      description: s.description || '',
    })),
    collapsed: t.collapsed || false,
    createdAt: t.createdAt || Date.now(),
    completedAt: t.completedAt || null,
    description: t.description || '',
  }));
}

/**
 * 将当前 todos 数组序列化后写入 LocalStorage。
 */
function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

/**
 * 生成唯一 ID（基于时间戳 + 随机字符串）。
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================================
// 描述展开状态持久化
// ============================================================

const DESC_KEY = 'geek-todos-open-descriptions';

/**
 * 从 localStorage 读取展开的描述 key 集合，
 * 并过滤掉当前数据中 description 为空的 key（避免空框显示）。
 * @param {Array} todos - 已加载的 todos 数组
 * @returns {Set<string>}
 */
function loadOpenDescriptions(todos) {
  const raw = localStorage.getItem(DESC_KEY);
  if (!raw) return new Set();
  try {
    const keys = new Set(JSON.parse(raw));
    // 只保留有实际描述内容的 key
    const valid = new Set();
    for (const key of keys) {
      if (key.includes(':')) {
        const [tid, sid] = key.split(':');
        const t = todos.find(t => t.id === tid);
        const sub = t?.subtasks.find(s => s.id === sid);
        if (sub?.description) valid.add(key);
      } else {
        const t = todos.find(t => t.id === key);
        if (t?.description) valid.add(key);
      }
    }
    return valid;
  } catch {
    return new Set();
  }
}

/**
 * 将当前展开的描述 key 集合写入 localStorage。
 * @param {Set<string>} set
 */
function saveOpenDescriptions(set) {
  localStorage.setItem(DESC_KEY, JSON.stringify([...set]));
}
