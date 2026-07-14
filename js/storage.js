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
