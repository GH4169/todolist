// ============================================================
// main.js — DOM 操作、事件交互、渲染引擎
// ============================================================

// (storage.js、theme.js 已在前面的 <script> 中加载，所有函数均为全局可用)

// ---- DOM 引用 ----
const input = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const list = document.getElementById('todoList');
const countText = document.getElementById('countText');
const clearBtn = document.getElementById('clearDone');
const progressCircle = document.getElementById('progressCircle');
const percentText = document.getElementById('percentText');
const filterBtns = document.querySelectorAll('.filter-btn');

const circumference = 2 * Math.PI * 60;
let currentFilter = 'all';

// 记录展开的描述区域 key: "todoId" 或 "todoId:subId"
let openDescriptions = new Set();
let todoChannel = null;
let realtimeRefreshTimer = null;
const pendingRealtimeEchoes = new Map();
const recentLocalCreates = new Map();
const recentLocalDeletes = new Map();
let activeUserId = null;
let appSessionVersion = 0;

// ---- 激励语池 ----
const quotes = [
  'Stay hungry, stay foolish.',
  '行动是治愈恐惧的良药。',
  '千里之行，始于足下。',
  '不积跬步，无以至千里。',
  '今天的努力，是幸运的伏笔。',
  '把简单的事做好就是不简单。',
  '每天进步一点点。',
  '专注当下，做好每一件事。',
  '时间会证明你的努力。',
  '与其抱怨，不如改变。',
];

// ---- 主题按钮事件委托 ----
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

// ============================================================
// 核心数据操作
// ============================================================

function showCloudError(error) {
  console.error('Supabase 操作失败:', error);
  window.alert(`云端同步失败：${error.message || '请检查网络和 Supabase 配置'}`);
}

async function restoreCloudState(error) {
  showCloudError(error);
  try {
    await loadTodos();
    openDescriptions = loadOpenDescriptions(todos);
    render();
  } catch (reloadError) {
    console.error('重新读取云端数据失败:', reloadError);
  }
}

function rememberRealtimeEcho(id, changes) {
  const token = { changes, expiresAt: Date.now() + 5000 };
  const queue = pendingRealtimeEchoes.get(id) || [];
  queue.push(token);
  pendingRealtimeEchoes.set(id, queue);
  setTimeout(() => forgetRealtimeEcho(id, token), 5100);
  return token;
}

function forgetRealtimeEcho(id, token) {
  const queue = pendingRealtimeEchoes.get(id);
  if (!queue) return;
  const nextQueue = queue.filter(item => item !== token);
  if (nextQueue.length > 0) pendingRealtimeEchoes.set(id, nextQueue);
  else pendingRealtimeEchoes.delete(id);
}

function consumeRealtimeEcho(item) {
  const queue = pendingRealtimeEchoes.get(item.id);
  if (!queue) return false;

  const now = Date.now();
  const activeQueue = queue.filter(token => token.expiresAt > now);
  const index = activeQueue.findIndex(token => (
    Object.entries(token.changes).every(([key, value]) => item[key] === value)
  ));

  if (index === -1) {
    if (activeQueue.length > 0) pendingRealtimeEchoes.set(item.id, activeQueue);
    else pendingRealtimeEchoes.delete(item.id);
    return false;
  }

  activeQueue.splice(index, 1);
  if (activeQueue.length > 0) pendingRealtimeEchoes.set(item.id, activeQueue);
  else pendingRealtimeEchoes.delete(item.id);
  return true;
}

async function updateTodoWithRealtimeEcho(id, changes) {
  const token = rememberRealtimeEcho(id, changes);
  try {
    return await updateTodoRecord(id, changes);
  } catch (error) {
    forgetRealtimeEcho(id, token);
    throw error;
  }
}

function rememberLocalCreate(id) {
  const expiresAt = Date.now() + 5000;
  recentLocalCreates.set(id, expiresAt);
  setTimeout(() => {
    if (recentLocalCreates.get(id) === expiresAt) recentLocalCreates.delete(id);
  }, 5100);
}

function consumeLocalCreate(id) {
  const expiresAt = recentLocalCreates.get(id);
  recentLocalCreates.delete(id);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function rememberLocalDelete(id) {
  const expiresAt = Date.now() + 5000;
  recentLocalDeletes.set(id, expiresAt);
  setTimeout(() => {
    if (recentLocalDeletes.get(id) === expiresAt) recentLocalDeletes.delete(id);
  }, 5100);
}

function forgetLocalDelete(id) {
  recentLocalDeletes.delete(id);
}

function consumeLocalDelete(id) {
  const expiresAt = recentLocalDeletes.get(id);
  recentLocalDeletes.delete(id);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function compareTodoOrder(a, b) {
  return (a.position - b.position) || (a.createdAt - b.createdAt);
}

function syncOpenDescription(item) {
  const key = item.parentId ? `${item.parentId}:${item.id}` : item.id;
  if (item.descriptionOpen) openDescriptions.add(key);
  else openDescriptions.delete(key);
}

function findTodoItem(id) {
  const todo = todos.find(item => item.id === id);
  if (todo) return { todo, item: todo };

  for (const parent of todos) {
    const subtask = parent.subtasks.find(item => item.id === id);
    if (subtask) return { todo: parent, item: subtask };
  }
  return null;
}

function upsertTodoItem(incoming) {
  if (incoming.userId && incoming.userId !== activeUserId) return new Set();
  const affectedTodoIds = new Set();

  if (!incoming.parentId) {
    const existing = todos.find(todo => todo.id === incoming.id);
    if (existing) {
      const subtasks = existing.subtasks;
      Object.assign(existing, incoming, { subtasks });
    } else {
      todos.push({ ...incoming, subtasks: incoming.subtasks || [] });
    }
    todos.sort(compareTodoOrder);
    syncOpenDescription(incoming);
    affectedTodoIds.add(incoming.id);
    return affectedTodoIds;
  }

  let oldParent = null;
  for (const todo of todos) {
    if (todo.subtasks.some(subtask => subtask.id === incoming.id)) {
      oldParent = todo;
      break;
    }
  }

  if (oldParent && oldParent.id !== incoming.parentId) {
    oldParent.subtasks = oldParent.subtasks.filter(subtask => subtask.id !== incoming.id);
    openDescriptions.delete(`${oldParent.id}:${incoming.id}`);
    affectedTodoIds.add(oldParent.id);
  }

  const parent = todos.find(todo => todo.id === incoming.parentId);
  if (!parent) return null;

  const existing = parent.subtasks.find(subtask => subtask.id === incoming.id);
  if (existing) Object.assign(existing, incoming, { subtasks: [] });
  else parent.subtasks.push({ ...incoming, subtasks: [] });
  parent.subtasks.sort(compareTodoOrder);
  syncOpenDescription(incoming);
  affectedTodoIds.add(parent.id);
  return affectedTodoIds;
}

function removeTodoItem(id, parentId) {
  const affectedTodoIds = new Set();
  const parentIndex = todos.findIndex(todo => todo.id === id);
  if (parentIndex !== -1) {
    todos.splice(parentIndex, 1);
    for (const key of [...openDescriptions]) {
      if (key === id || key.startsWith(`${id}:`)) openDescriptions.delete(key);
    }
    affectedTodoIds.add(id);
    return affectedTodoIds;
  }

  const parent = todos.find(todo => todo.id === parentId)
    || todos.find(todo => todo.subtasks.some(subtask => subtask.id === id));
  if (!parent) return affectedTodoIds;
  parent.subtasks = parent.subtasks.filter(subtask => subtask.id !== id);
  openDescriptions.delete(`${parent.id}:${id}`);
  affectedTodoIds.add(parent.id);
  return affectedTodoIds;
}

function syncTodoCompletionDom(todo) {
  let todoElement = getTodoElement(todo.id);
  if (!isTodoVisible(todo)) {
    todoElement?.remove();
    if (!list.querySelector(':scope > .todo-item')) list.innerHTML = getEmptyStateHtml();
    return null;
  }

  if (!todoElement) {
    renderChangedTodos(new Set([todo.id]));
    todoElement = getTodoElement(todo.id);
  }
  if (!todoElement) return null;

  todoElement.classList.toggle('done', todo.done);
  const checkbox = todoElement.querySelector('.checkbox');
  if (checkbox) {
    checkbox.setAttribute('aria-pressed', String(todo.done));
    checkbox.setAttribute('aria-label', todo.done ? '标记为未完成' : '标记为已完成');
  }
  const timeElement = todoElement.querySelector('.task-time');
  if (timeElement) {
    timeElement.textContent = `创建于 ${formatTime(todo.createdAt)}${todo.done && todo.completedAt ? ' · 完成于 ' + formatTime(todo.completedAt) : ''}`;
  }
  return todoElement;
}

function syncSubtaskCompletionDom(todo, subtask) {
  const todoElement = syncTodoCompletionDom(todo);
  if (todoElement) {
    const subtaskElement = [...todoElement.querySelectorAll('.subtask-item')]
      .find(element => element.dataset.id === subtask.id);
    if (subtaskElement) {
      subtaskElement.classList.toggle('done', subtask.done);
      const checkbox = subtaskElement.querySelector('.subtask-checkbox');
      if (checkbox) {
        checkbox.setAttribute('aria-pressed', String(subtask.done));
        checkbox.setAttribute('aria-label', subtask.done ? '标记为未完成' : '标记为已完成');
      }
      const timeElement = subtaskElement.querySelector('.subtask-time');
      if (timeElement) {
        timeElement.textContent = `${formatTime(subtask.createdAt)}${subtask.done && subtask.completedAt ? ' · ' + formatTime(subtask.completedAt) : ''}`;
      }
    }

    const doneCount = todo.subtasks.filter(item => item.done).length;
    const progressFill = todoElement.querySelector('.subtask-bar-fill');
    const doneCountElement = todoElement.querySelector('.subtask-count .done-count');
    const progressBadge = todoElement.querySelector('.progress-badge');
    if (progressFill) progressFill.style.width = `${Math.round((doneCount / todo.subtasks.length) * 100)}%`;
    if (doneCountElement) doneCountElement.textContent = doneCount;
    if (progressBadge) progressBadge.textContent = `${doneCount}/${todo.subtasks.length}`;
  }
  updateListSummary();
}

function getDescriptionTarget(todoId, subId) {
  const todo = todos.find(item => item.id === todoId);
  if (!todo) return null;
  const target = subId
    ? todo.subtasks.find(item => item.id === subId)
    : todo;
  return target ? { todo, target } : null;
}

function getDescriptionSection(todoId, subId) {
  const selector = subId
    ? `.subtask-desc-section[data-sub-id="${subId}"]`
    : `.desc-section[data-id="${todoId}"]`;
  return document.querySelector(selector);
}

function getDescriptionButton(todoId, subId) {
  if (subId) {
    const subtaskElement = document.querySelector(`.subtask-item[data-id="${subId}"]`);
    return subtaskElement?.querySelector('.subtask-desc-btn') || null;
  }
  return getTodoElement(todoId)?.querySelector('.desc-btn') || null;
}

function createDescriptionSection(todoId, subId) {
  const section = document.createElement('div');
  if (subId) {
    section.className = 'subtask-desc-section';
    section.dataset.todoId = todoId;
    section.dataset.subId = subId;
    document.querySelector(`.subtask-item[data-id="${subId}"]`)?.appendChild(section);
  } else {
    section.className = 'desc-section';
    section.dataset.id = todoId;
    const todoBody = getTodoElement(todoId)?.querySelector('.todo-body');
    const subtaskSection = todoBody?.querySelector('.subtask-section');
    todoBody?.insertBefore(section, subtaskSection || null);
  }
  return section.isConnected ? section : null;
}

function syncDescriptionDom(todoId, subId) {
  const state = getDescriptionTarget(todoId, subId);
  if (!state) return;
  const { target } = state;
  const key = subId ? `${todoId}:${subId}` : todoId;
  const isOpen = openDescriptions.has(key);
  const shouldExist = Boolean(target.description || isOpen);
  let section = getDescriptionSection(todoId, subId);
  const button = getDescriptionButton(todoId, subId);

  button?.classList.toggle('has-desc', Boolean(target.description));
  if (!subId) button?.classList.toggle('desc-open', isOpen);

  if (!shouldExist) {
    section?.remove();
    return;
  }

  if (!section) section = createDescriptionSection(todoId, subId);
  if (!section) return;
  section.style.display = isOpen ? 'block' : 'none';

  let displayElement = section.querySelector('.desc-display');
  if (!displayElement) {
    displayElement = document.createElement('div');
    displayElement.className = 'desc-display';
    section.querySelector('.desc-edit')?.replaceWith(displayElement);
    if (!displayElement.isConnected) section.appendChild(displayElement);
  }
  displayElement.textContent = target.description || '';
}

async function addTodo() {
  const text = input.value.trim();
  if (!text) return;
  try {
    const todo = await createTodoRecord({ text, position: todos.length });
    const alreadyPresent = Boolean(findTodoItem(todo.id));
    rememberLocalCreate(todo.id);
    const affectedTodoIds = upsertTodoItem(todo);
    input.value = '';
    input.focus();
    if (!alreadyPresent) renderChangedTodos(affectedTodoIds);
  } catch (error) {
    showCloudError(error);
  }
}

async function toggleTodo(id) {
  const t = todos.find(t => t.id === id);
  if (t) {
    const previousDone = t.done;
    const previousCompletedAt = t.completedAt;
    const done = !t.done;
    const completedAt = done ? Date.now() : null;
    t.done = done;
    t.completedAt = completedAt;
    syncTodoCompletionDom(t);
    updateListSummary();

    try {
      await updateTodoWithRealtimeEcho(id, { done, completedAt });
    } catch (error) {
      if (t.done === done && t.completedAt === completedAt) {
        t.done = previousDone;
        t.completedAt = previousCompletedAt;
        syncTodoCompletionDom(t);
        updateListSummary();
      }
      showCloudError(error);
    }
  }
}

async function toggleSubtask(todoId, subId) {
  const t = todos.find(t => t.id === todoId);
  if (!t) return;
  const sub = t.subtasks.find(s => s.id === subId);
  if (sub) {
    const previousSubDone = sub.done;
    const previousSubCompletedAt = sub.completedAt;
    const previousParentDone = t.done;
    const previousParentCompletedAt = t.completedAt;
    const done = !sub.done;
    const completedAt = done ? Date.now() : null;
    const siblingStates = t.subtasks.map(item => item.id === subId ? done : item.done);
    const parentDone = siblingStates.every(Boolean);
    const parentCompletedAt = parentDone ? (t.completedAt || Date.now()) : null;

    sub.done = done;
    sub.completedAt = completedAt;
    t.done = parentDone;
    t.completedAt = parentCompletedAt;
    syncSubtaskCompletionDom(t, sub);

    // 双向同步：所有子任务完成 → 父任务完成；有子任务取消 → 父任务取消
    try {
      await Promise.all([
        updateTodoWithRealtimeEcho(subId, { done, completedAt }),
        updateTodoWithRealtimeEcho(todoId, { done: parentDone, completedAt: parentCompletedAt }),
      ]);
    } catch (error) {
      if (
        sub.done === done
        && sub.completedAt === completedAt
        && t.done === parentDone
        && t.completedAt === parentCompletedAt
      ) {
        sub.done = previousSubDone;
        sub.completedAt = previousSubCompletedAt;
        t.done = previousParentDone;
        t.completedAt = previousParentCompletedAt;
        syncSubtaskCompletionDom(t, sub);
      }
      showCloudError(error);
    }
  }
}

async function addSubtask(todoId, text) {
  const t = todos.find(t => t.id === todoId);
  if (t && text.trim()) {
    const parentWasDone = t.done;
    try {
      const operations = [createTodoRecord({
        text: text.trim(),
        parentId: todoId,
        position: t.subtasks.length,
      })];
      if (t.done) {
        operations.push(updateTodoWithRealtimeEcho(todoId, { done: false, completedAt: null }));
      }
      const [subtask] = await Promise.all(operations);
      const alreadyPresent = Boolean(findTodoItem(subtask.id));
      rememberLocalCreate(subtask.id);
      const affectedTodoIds = upsertTodoItem(subtask);
      if (t.done) {
        t.done = false;
        t.completedAt = null;
      }
      if (!alreadyPresent || parentWasDone) renderChangedTodos(affectedTodoIds);
    } catch (error) {
      await restoreCloudState(error);
    }
  }
}

async function deleteSubtask(todoId, subId) {
  const item = document.querySelector(`.subtask-item[data-id="${subId}"]`);
  if (!item) return;
  item.classList.add('removing');
  await new Promise(resolve => setTimeout(resolve, 250));

  try {
    rememberLocalDelete(subId);
    await deleteTodoRecord(subId);
    renderChangedTodos(removeTodoItem(subId, todoId));
  } catch (error) {
    forgetLocalDelete(subId);
    await restoreCloudState(error);
  }
}

async function deleteTodo(id) {
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (!item) return;
  item.classList.add('removing');
  await new Promise(resolve => setTimeout(resolve, 300));

  const todo = todos.find(item => item.id === id);
  const deletedIds = [id, ...(todo?.subtasks.map(subtask => subtask.id) || [])];
  try {
    deletedIds.forEach(rememberLocalDelete);
    await deleteTodoRecord(id);
    renderChangedTodos(removeTodoItem(id));
  } catch (error) {
    deletedIds.forEach(forgetLocalDelete);
    await restoreCloudState(error);
  }
}

async function clearCompleted() {
  const doneIds = new Set(todos.filter(t => t.done).map(t => t.id));
  const deletedIds = todos
    .filter(todo => doneIds.has(todo.id))
    .flatMap(todo => [todo.id, ...todo.subtasks.map(subtask => subtask.id)]);
  try {
    deletedIds.forEach(rememberLocalDelete);
    await deleteTodoRecords([...doneIds]);
    const affectedTodoIds = new Set();
    for (const id of doneIds) {
      for (const affectedId of removeTodoItem(id)) affectedTodoIds.add(affectedId);
    }
    renderChangedTodos(affectedTodoIds);
  } catch (error) {
    deletedIds.forEach(forgetLocalDelete);
    await restoreCloudState(error);
  }
}

// ============================================================
// 任务详情描述
// ============================================================

async function toggleDescription(todoId, subId) {
  const key = subId ? `${todoId}:${subId}` : todoId;
  const state = getDescriptionTarget(todoId, subId);
  if (!state) return;
  const { target } = state;

  const previousDescriptionOpen = target.descriptionOpen;
  const descriptionOpen = !openDescriptions.has(key);
  target.descriptionOpen = descriptionOpen;
  if (descriptionOpen) openDescriptions.add(key);
  else openDescriptions.delete(key);
  syncDescriptionDom(todoId, subId);

  try {
    await updateTodoWithRealtimeEcho(target.id, { descriptionOpen });
  } catch (error) {
    if (target.descriptionOpen === descriptionOpen) {
      target.descriptionOpen = previousDescriptionOpen;
      if (previousDescriptionOpen) openDescriptions.add(key);
      else openDescriptions.delete(key);
      syncDescriptionDom(todoId, subId);
    }
    showCloudError(error);
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function startEditDescription(todoId, subId) {
  const t = todos.find(t => t.id === todoId);
  if (!t) return;

  const containerSelector = subId
    ? `.subtask-desc-section[data-sub-id="${subId}"]`
    : `.desc-section[data-id="${todoId}"]`;
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const displayEl = container.querySelector('.desc-display');
  if (!displayEl) return;

  const currentDesc = subId
    ? (t.subtasks.find(s => s.id === subId)?.description || '')
    : (t.description || '');

  const textarea = document.createElement('textarea');
  textarea.className = 'desc-edit';
  textarea.value = currentDesc;
  textarea.rows = 2;

  let saved = false;
  const key = subId ? `${todoId}:${subId}` : todoId;
  const originalWasOpen = openDescriptions.has(key);
  const originalDescriptionOpen = subId
    ? t.subtasks.find(s => s.id === subId)?.descriptionOpen
    : t.descriptionOpen;

  const save = async () => {
    if (saved) return;
    saved = true;
    const newDesc = textarea.value.trim();
    const target = subId ? t.subtasks.find(s => s.id === subId) : t;
    if (!target) return;

    const changes = { description: newDesc };
    if (!newDesc) changes.descriptionOpen = false;

    target.description = newDesc;
    if (!newDesc) {
      target.descriptionOpen = false;
      openDescriptions.delete(key);
    }
    const optimisticDescriptionOpen = target.descriptionOpen;
    syncDescriptionDom(todoId, subId);

    const needsUpdate = newDesc !== currentDesc || (!newDesc && originalWasOpen);
    if (!needsUpdate) return;

    try {
      await updateTodoWithRealtimeEcho(target.id, changes);
    } catch (error) {
      if (
        target.description === newDesc
        && target.descriptionOpen === optimisticDescriptionOpen
      ) {
        target.description = currentDesc;
        target.descriptionOpen = originalDescriptionOpen;
        if (originalWasOpen) openDescriptions.add(key);
        else openDescriptions.delete(key);
        syncDescriptionDom(todoId, subId);
      }
      showCloudError(error);
    }
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      saved = true; // 阻止 blur 保存
      syncDescriptionDom(todoId, subId);
      return;
    }

    if (subId && e.key === 'Enter' && !e.isComposing) {
      if (e.ctrlKey) {
        e.preventDefault();
        textarea.setRangeText('\n', textarea.selectionStart, textarea.selectionEnd, 'end');
        autoResizeTextarea(textarea);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      save();
    }
  });
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));

  displayEl.replaceWith(textarea);
  textarea.focus();
  requestAnimationFrame(() => autoResizeTextarea(textarea));

  // 避免描述编辑 blur 保存时，同一次点击又触发描述按钮切换。
  const blockMousedown = (e) => {
    if (e.target.closest('.desc-btn, .subtask-desc-btn')) {
      e.preventDefault();
    }
  };
  document.addEventListener('mousedown', blockMousedown);
  textarea.addEventListener('blur', () => {
    document.removeEventListener('mousedown', blockMousedown);
  }, { once: true });
}

// ============================================================
// 进度 & 统计
// ============================================================

function updateProgress() {
  if (todos.length === 0) {
    progressCircle.style.strokeDashoffset = circumference;
    percentText.textContent = '0%';
    return;
  }
  const allSubtasks = todos.flatMap(t => t.subtasks);
  const totalItems = todos.length + allSubtasks.length;
  if (totalItems === 0) {
    progressCircle.style.strokeDashoffset = circumference;
    percentText.textContent = '0%';
    return;
  }
  const doneTodos = todos.filter(t => t.done).length;
  const doneSubtasks = allSubtasks.filter(s => s.done).length;
  const totalDone = doneTodos + doneSubtasks;
  const percent = Math.round((totalDone / totalItems) * 100);
  const offset = circumference - (totalDone / totalItems) * circumference;
  progressCircle.style.strokeDashoffset = offset;
  percentText.textContent = percent + '%';
}

function updateSideStats() {
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const active = total - done;
  const subs = todos.reduce((sum, t) => sum + t.subtasks.length, 0);

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statSubs').textContent = subs;

  // 进度条
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById('statBarFill');
  const text = document.getElementById('statBarText');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = pct + '%';
}

// ============================================================
// 工具函数
// ============================================================

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// 渲染引擎
// ============================================================

function isTodoVisible(todo) {
  if (currentFilter === 'active') return !todo.done;
  if (currentFilter === 'completed') return todo.done;
  return true;
}

function getVisibleTodos() {
  return todos.filter(isTodoVisible);
}

function getEmptyStateHtml() {
  const icon = todos.length === 0
    ? '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="8" width="30" height="32" rx="5"/><path d="M16 18h16M16 25h10M16 32h7"/><path class="empty-accent" d="m29 31 3 3 7-8"/></svg>'
    : '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path class="empty-accent" d="m16 24 5 5 11-12"/></svg>';
  const title = todos.length === 0 ? '今天从哪里开始？' : '这一栏已经清空';
  const desc = todos.length === 0 ? '先写下一件值得完成的事' : '切换到其他分类，或添加新的任务';
  return `
    <li class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </li>`;
}

function renderTodoHtml(t) {
  const subtaskCount = t.subtasks.length;
  const doneCount = t.subtasks.filter(s => s.done).length;
  const subProgress = subtaskCount > 0
    ? Math.round((doneCount / subtaskCount) * 100)
    : 0;

  const subAddRowHtml = `
      <div class="subtask-add-row" id="sub-add-${t.id}" style="display:none;">
        <input type="text" placeholder="输入子任务内容，回车确认" data-action="sub-input" data-todo-id="${t.id}" />
        <button class="sub-confirm" type="button" data-action="confirm-sub" data-todo-id="${t.id}">添加</button>
      </div>`;

  const subtasksHtml = subtaskCount > 0 ? `
    <div class="subtask-section ${t.collapsed ? 'collapsed' : ''}">
      <ul class="subtask-list">
        ${t.subtasks.map(s => `
          <li class="subtask-item ${s.done ? 'done' : ''}" data-todo-id="${t.id}" data-id="${s.id}" draggable="true">
            <div class="subtask-main">
              <span class="subtask-drag-handle" title="拖拽排序" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg></span>
              <button class="subtask-checkbox" type="button" data-action="toggle-sub" data-todo-id="${t.id}" data-sub-id="${s.id}" aria-label="${s.done ? '标记为未完成' : '标记为已完成'}" aria-pressed="${s.done}">
                <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
              </button>
              <span class="subtask-text">${escapeHtml(s.text)}</span>
              <button class="subtask-desc-btn ${s.description ? 'has-desc' : ''}" data-action="toggle-desc" data-todo-id="${t.id}" data-sub-id="${s.id}" title="详情描述">
                <svg class="desc-icon" viewBox="0 0 16 16" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
                  <path d="M5.5 6.5h5M5.5 9h3.5"/>
                </svg>
              </button>
              <span class="subtask-time">${formatTime(s.createdAt)}${s.done && s.completedAt ? ' · ' + formatTime(s.completedAt) : ''}</span>
              <button class="subtask-delete" type="button" data-action="delete-sub" data-todo-id="${t.id}" data-sub-id="${s.id}" title="删除子任务" aria-label="删除子任务">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${s.description || openDescriptions.has(t.id + ':' + s.id) ? `<div class="subtask-desc-section" data-todo-id="${t.id}" data-sub-id="${s.id}" style="display: ${openDescriptions.has(t.id + ':' + s.id) ? 'block' : 'none'};">
              <div class="desc-display">${s.description ? escapeHtml(s.description) : ''}</div>
            </div>` : ''}
          </li>
        `).join('')}
      </ul>
      <div class="subtask-progress">
        <div class="subtask-bar-bg">
          <div class="subtask-bar-fill" style="width: ${subProgress}%"></div>
        </div>
        <span class="subtask-count"><span class="done-count">${doneCount}</span>/${subtaskCount}</span>
      </div>
      ${subAddRowHtml}
    </div>
  ` : `
    <div class="subtask-section">
      ${subAddRowHtml}
    </div>
  `;

  return `
    <li class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}" draggable="true">
      <div class="todo-main">
        <span class="drag-handle" title="拖拽排序" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg></span>
        <button class="checkbox" type="button" data-action="toggle" aria-label="${t.done ? '标记为未完成' : '标记为已完成'}" aria-pressed="${t.done}">
          <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
        </button>
        ${subtaskCount > 0 ? `<button class="collapse-toggle" type="button" data-action="toggle-collapse" data-id="${t.id}" title="${t.collapsed ? '展开子任务' : '折叠子任务'}" aria-label="${t.collapsed ? '展开子任务' : '折叠子任务'}" aria-expanded="${!t.collapsed}">
          <svg class="collapse-chevron ${t.collapsed ? 'collapsed' : ''}" viewBox="0 0 12 12"><polyline points="2,3 6,8 10,3" /></svg>
        </button>` : ''}
        <div class="todo-body">
          <div class="todo-text">${t.collapsed && subtaskCount > 0 ? `<span class="progress-badge">${doneCount}/${subtaskCount}</span>` : ''}${escapeHtml(t.text)}</div>
          <div class="task-time">创建于 ${formatTime(t.createdAt)}${t.done && t.completedAt ? ' · 完成于 ' + formatTime(t.completedAt) : ''}</div>
          ${t.description || openDescriptions.has(t.id) ? `<div class="desc-section" data-id="${t.id}" style="display: ${openDescriptions.has(t.id) ? 'block' : 'none'};">
            <div class="desc-display">${t.description ? escapeHtml(t.description) : ''}</div>
          </div>` : ''}
          ${subtasksHtml}
        </div>
        <div class="todo-actions">
          <button class="action-btn sub-add-action" type="button" data-action="show-sub-add" data-todo-id="${t.id}" title="添加子任务" aria-label="添加子任务">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="action-btn edit-btn" type="button" data-action="start-edit" data-id="${t.id}" title="编辑标题" aria-label="编辑标题">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button class="action-btn desc-btn ${t.description ? 'has-desc' : ''} ${openDescriptions.has(t.id) ? 'desc-open' : ''}" type="button" data-action="toggle-desc" data-id="${t.id}" title="详情描述" aria-label="详情描述">
            <svg class="desc-chevron" viewBox="0 0 12 12" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="2,3 6,8 10,3"/>
            </svg>
          </button>
          <button class="action-btn" type="button" data-action="delete" data-id="${t.id}" title="删除任务" aria-label="删除任务">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>
          </button>
        </div>
      </div>
    </li>
  `;
}

function createTodoElement(todo) {
  const template = document.createElement('template');
  template.innerHTML = renderTodoHtml(todo).trim();
  return template.content.firstElementChild;
}

function getTodoElement(id) {
  return [...list.children].find(element => (
    element.classList.contains('todo-item') && element.dataset.id === id
  ));
}

function updateListSummary() {
  const activeCount = todos.filter(t => !t.done).length;
  const total = todos.length;
  countText.textContent = total === 0 ? '暂无任务' : `待办 ${activeCount} · 共 ${total} 个`;
  clearBtn.style.display = todos.some(t => t.done) ? 'inline-flex' : 'none';
  updateProgress();
  updateSideStats();
}

function render() {
  const visibleTodos = getVisibleTodos();
  list.innerHTML = visibleTodos.length > 0
    ? visibleTodos.map(renderTodoHtml).join('')
    : getEmptyStateHtml();
  updateListSummary();
}

function renderChangedTodos(todoIds) {
  const visibleTodos = getVisibleTodos();
  if (visibleTodos.length === 0) {
    list.innerHTML = getEmptyStateHtml();
    updateListSummary();
    return;
  }

  list.querySelector(':scope > .empty-state')?.remove();
  for (const id of todoIds) {
    const existing = getTodoElement(id);
    const todo = todos.find(item => item.id === id);
    if (!todo || !isTodoVisible(todo)) {
      existing?.remove();
      continue;
    }

    const replacement = createTodoElement(todo);
    if (existing) existing.replaceWith(replacement);
    else list.appendChild(replacement);
  }

  for (const todo of visibleTodos) {
    if (!getTodoElement(todo.id)) list.appendChild(createTodoElement(todo));
  }

  let nextElement = list.firstElementChild;
  for (const todo of visibleTodos) {
    const element = getTodoElement(todo.id);
    if (element !== nextElement) list.insertBefore(element, nextElement);
    nextElement = element.nextElementSibling;
  }

  updateListSummary();
}

// ============================================================
// 行内编辑
// ============================================================

function startEditTitle(id) {
  const t = todos.find(t => t.id === id);
  if (!t) return;
  const textEl = document.querySelector(`.todo-item[data-id="${id}"] .todo-text`);
  if (!textEl) return;

  textEl.contentEditable = 'true';
  textEl.classList.add('editing');
  textEl.querySelector('.progress-badge')?.remove();
  textEl.focus();

  // 选中全部文字
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const originalText = t.text;
  let cancelled = false;
  let finishing = false;

  const restoreProgressBadge = () => {
    if (!t.collapsed || t.subtasks.length === 0 || textEl.querySelector('.progress-badge')) return;
    const doneCount = t.subtasks.filter(subtask => subtask.done).length;
    const badge = document.createElement('span');
    badge.className = 'progress-badge';
    badge.textContent = `${doneCount}/${t.subtasks.length}`;
    textEl.prepend(badge);
  };

  const finish = async () => {
    if (finishing) return;
    finishing = true;
    const newText = textEl.textContent.trim();
    textEl.contentEditable = 'false';
    textEl.classList.remove('editing');

    if (cancelled || !newText) {
      textEl.textContent = originalText;
      restoreProgressBadge();
      return;
    }
    if (newText === originalText) {
      restoreProgressBadge();
      return;
    }

    t.text = newText;
    restoreProgressBadge();
    try {
      await updateTodoWithRealtimeEcho(id, { text: newText });
    } catch (error) {
      t.text = originalText;
      if (textEl.isConnected) {
        textEl.textContent = originalText;
        restoreProgressBadge();
      }
      await restoreCloudState(error);
    }
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      textEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelled = true;
      textEl.textContent = originalText;
      textEl.blur();
    }
  });
}

function startEditSubtask(todoId, subId) {
  const t = todos.find(t => t.id === todoId);
  if (!t) return;
  const sub = t.subtasks.find(s => s.id === subId);
  if (!sub) return;
  const textEl = document.querySelector(`.subtask-item[data-id="${subId}"] .subtask-text`);
  if (!textEl) return;

  textEl.contentEditable = 'true';
  textEl.classList.add('editing');
  textEl.focus();

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const originalText = sub.text;
  let cancelled = false;
  let finishing = false;
  const finish = async () => {
    if (finishing) return;
    finishing = true;
    const newText = textEl.textContent.trim();
    textEl.contentEditable = 'false';
    textEl.classList.remove('editing');

    if (cancelled || !newText) {
      textEl.textContent = originalText;
      return;
    }
    if (newText === originalText) return;

    sub.text = newText;
    try {
      await updateTodoWithRealtimeEcho(subId, { text: newText });
    } catch (error) {
      sub.text = originalText;
      if (textEl.isConnected) textEl.textContent = originalText;
      await restoreCloudState(error);
    }
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      textEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelled = true;
      textEl.textContent = originalText;
      textEl.blur();
    }
  });
}

// ============================================================
// 拖拽排序
// ============================================================

let draggedId = null;   // 父任务拖拽
let draggedSub = null;  // 子任务拖拽 { todoId, subId }

list.addEventListener('dragstart', (e) => {
  // 优先检查子任务拖拽
  const subItem = e.target.closest('.subtask-item');
  if (subItem) {
    if (e.target.closest('[data-action], input, button, .subtask-text.editing, .desc-display, .desc-edit')) {
      e.preventDefault();
      return;
    }
    draggedSub = { todoId: subItem.dataset.todoId, subId: subItem.dataset.id };
    subItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', subItem.dataset.id);
    return;
  }

  // 父任务拖拽
  const todoItem = e.target.closest('.todo-item');
  if (!todoItem) return;
  if (e.target.closest('[data-action], input, button, .todo-text.editing, .desc-display, .desc-edit')) {
    e.preventDefault();
    return;
  }
  draggedId = todoItem.dataset.id;
  todoItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedId);
});

list.addEventListener('dragend', (e) => {
  const todoItem = e.target.closest('.todo-item');
  const subItem = e.target.closest('.subtask-item');
  if (todoItem) todoItem.classList.remove('dragging');
  if (subItem) subItem.classList.remove('dragging');
  draggedId = null;
  draggedSub = null;
  document.querySelectorAll('.drag-over, .subtask-drag-over').forEach(el => {
    el.classList.remove('drag-over', 'subtask-drag-over');
  });
});

list.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  // 清除所有高亮
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.subtask-drag-over').forEach(el => el.classList.remove('subtask-drag-over'));

  if (draggedSub) {
    const subTarget = e.target.closest('.subtask-item');
    if (subTarget && subTarget.dataset.id !== draggedSub.subId) {
      subTarget.classList.add('subtask-drag-over');
    }
  } else if (draggedId) {
    const todoTarget = e.target.closest('.todo-item');
    if (todoTarget && todoTarget.dataset.id !== draggedId) {
      todoTarget.classList.add('drag-over');
    }
  }
});

list.addEventListener('dragleave', (e) => {
  const todoItem = e.target.closest('.todo-item');
  const subItem = e.target.closest('.subtask-item');
  if (todoItem && !todoItem.contains(e.relatedTarget)) {
    todoItem.classList.remove('drag-over');
  }
  if (subItem && !subItem.contains(e.relatedTarget)) {
    subItem.classList.remove('subtask-drag-over');
  }
});

list.addEventListener('drop', async (e) => {
  e.preventDefault();

  // 子任务排序
  if (draggedSub) {
    const subTarget = e.target.closest('.subtask-item');
    if (!subTarget) return;
    const targetSubId = subTarget.dataset.id;
    if (targetSubId === draggedSub.subId) return;

    const t = todos.find(t => t.id === draggedSub.todoId);
    if (!t) return;

    const fromIndex = t.subtasks.findIndex(s => s.id === draggedSub.subId);
    const toIndex = t.subtasks.findIndex(s => s.id === targetSubId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = t.subtasks.splice(fromIndex, 1);
    t.subtasks.splice(toIndex, 0, moved);

    render();
    try {
      await saveTodoPositions(updateTodoWithRealtimeEcho);
    } catch (error) {
      await restoreCloudState(error);
    }
    return;
  }

  // 父任务排序
  if (!draggedId) return;
  const targetItem = e.target.closest('.todo-item');
  if (!targetItem) return;

  const targetId = targetItem.dataset.id;
  if (targetId === draggedId) return;

  const fromIndex = todos.findIndex(t => t.id === draggedId);
  const toIndex = todos.findIndex(t => t.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = todos.splice(fromIndex, 1);
  todos.splice(toIndex, 0, moved);

  render();
  try {
    await saveTodoPositions(updateTodoWithRealtimeEcho);
  } catch (error) {
    await restoreCloudState(error);
  }
});

// ============================================================
// 事件委托：主列表点击
// ============================================================

list.addEventListener('click', (e) => {
  const item = e.target.closest('.todo-item');
  if (!item) return;
  const actionEl = e.target.closest('[data-action]');
  const action = actionEl ? actionEl.dataset.action : '';
  const todoId = item.dataset.id;

  if (action === 'toggle') {
    e.preventDefault();
    toggleTodo(todoId);
  } else if (action === 'delete') {
    deleteTodo(actionEl.dataset.id);
  } else if (action === 'toggle-sub') {
    e.preventDefault();
    e.stopPropagation();
    const subId = actionEl.dataset.subId;
    toggleSubtask(actionEl.dataset.todoId, subId);
  } else if (action === 'delete-sub') {
    e.stopPropagation();
    const subId = actionEl.dataset.subId;
    deleteSubtask(actionEl.dataset.todoId, subId);
  } else if (action === 'show-sub-add') {
    e.stopPropagation();
    const targetTodoId = actionEl.dataset.todoId;
    const addRow = document.getElementById(`sub-add-${targetTodoId}`);
    const isVisible = addRow.style.display !== 'none';
    document.querySelectorAll('.subtask-add-row').forEach(el => { el.style.display = 'none'; });
    if (!isVisible) {
      addRow.style.display = 'flex';
      const inp = addRow.querySelector('input');
      inp.value = '';
      inp.focus();
    }
  } else if (action === 'confirm-sub') {
    e.stopPropagation();
    const targetTodoId = actionEl.dataset.todoId;
    const row = document.getElementById(`sub-add-${targetTodoId}`);
    const inp = row.querySelector('input');
    if (inp.value.trim()) addSubtask(targetTodoId, inp.value);
  } else if (action === 'start-edit') {
    e.stopPropagation();
    startEditTitle(actionEl.dataset.id);
  } else if (action === 'toggle-collapse') {
    e.stopPropagation();
    const t = todos.find(t => t.id === actionEl.dataset.id);
    if (t) {
      const collapsed = !t.collapsed;
      updateTodoWithRealtimeEcho(t.id, { collapsed })
        .then(() => {
          t.collapsed = collapsed;
          renderChangedTodos(new Set([t.id]));
        })
        .catch(restoreCloudState);
    }
  } else if (action === 'toggle-desc') {
    e.stopPropagation();
    const todoId = actionEl.dataset.id || actionEl.dataset.todoId;
    const subId = actionEl.dataset.subId || null;
    toggleDescription(todoId, subId);
  }
});

// 双击编辑：父任务标题
list.addEventListener('dblclick', (e) => {
  const textEl = e.target.closest('.todo-text');
  if (!textEl) return;
  const item = textEl.closest('.todo-item');
  if (!item) return;
  e.preventDefault();
  startEditTitle(item.dataset.id);
});

// 双击编辑：子任务标题
list.addEventListener('dblclick', (e) => {
  const textEl = e.target.closest('.subtask-text');
  if (!textEl) return;
  const subItem = textEl.closest('.subtask-item');
  if (!subItem) return;
  e.preventDefault();
  startEditSubtask(subItem.dataset.todoId, subItem.dataset.id);
});

// 子任务输入框回车确认
list.addEventListener('keydown', (e) => {
  if (e.target.dataset.action === 'sub-input' && e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    const todoId = e.target.dataset.todoId;
    if (e.target.value.trim()) addSubtask(todoId, e.target.value);
  }
});

// 点击空白处关闭所有子任务输入行
document.addEventListener('click', (e) => {
  if (!e.target.closest('.subtask-add-row')) {
    document.querySelectorAll('.subtask-add-row').forEach(el => { el.style.display = 'none'; });
  }
});

// 点击描述展示区进入编辑模式
list.addEventListener('click', (e) => {
  const descDisplay = e.target.closest('.desc-display');
  if (!descDisplay) return;

  const descSection = descDisplay.closest('.desc-section, .subtask-desc-section');
  if (!descSection) return;

  const isSub = descSection.classList.contains('subtask-desc-section');
  const todoId = isSub ? descSection.dataset.todoId : descSection.dataset.id;
  const subId = isSub ? descSection.dataset.subId : null;
  startEditDescription(todoId, subId);
});

// ============================================================
// 顶部输入区事件
// ============================================================

addBtn.addEventListener('click', addTodo);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    addTodo();
  }
});

// 过滤按钮
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// 清除已完成
clearBtn.addEventListener('click', clearCompleted);

// ============================================================
// 侧边栏小部件
// ============================================================

function updateDateTime() {
  const now = new Date();
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

  document.getElementById('dateDisplay').textContent =
    `${now.getFullYear()}年 ${months[now.getMonth()]} ${now.getDate()}日`;
  document.getElementById('timeDisplay').textContent =
    now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  document.getElementById('weekdayDisplay').textContent = weekdays[now.getDay()];
}

function createParticles() {
  const container = document.getElementById('particles');
  const colors = ['var(--neon-blue)', 'var(--neon-purple)', 'var(--neon-pink)', 'var(--neon-green)'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    container.appendChild(p);
  }
}

function setDailyQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  document.getElementById('quoteText').textContent = quotes[dayOfYear % quotes.length];
}

// ============================================================
// 启动
// ============================================================

function normalizeRealtimeTodoChange(event, message) {
  const payload = message?.payload || message;
  const row = event === 'DELETE'
    ? (payload?.old_record || payload?.record)
    : payload?.record;
  if (!row?.id) return null;
  return { event, item: mapRow(row) };
}

function handleRealtimeTodoChange(event, message) {
  try {
    const change = normalizeRealtimeTodoChange(event, message);
    if (!change) {
      scheduleRealtimeRefresh();
      return;
    }

    const { item } = change;
    if (item.userId && item.userId !== activeUserId) return;
    if (event === 'UPDATE' && consumeRealtimeEcho(item)) return;
    if (event === 'INSERT' && consumeLocalCreate(item.id)) return;
    if (event === 'DELETE' && consumeLocalDelete(item.id)) return;

    const affectedTodoIds = event === 'DELETE'
      ? removeTodoItem(item.id, item.parentId)
      : upsertTodoItem(item);
    if (!affectedTodoIds) {
      scheduleRealtimeRefresh();
      return;
    }
    renderChangedTodos(affectedTodoIds);
  } catch (error) {
    console.error('实时同步局部更新失败:', error);
    scheduleRealtimeRefresh();
  }
}

function scheduleRealtimeRefresh() {
  clearTimeout(realtimeRefreshTimer);
  const expectedUserId = activeUserId;
  realtimeRefreshTimer = setTimeout(async () => {
    try {
      await loadTodos();
      if (activeUserId !== expectedUserId) return;
      openDescriptions = loadOpenDescriptions(todos);
      render();
    } catch (error) {
      console.error('实时同步刷新失败:', error);
    }
  }, 150);
}

function initAppShell() {
  createParticles();
  setDailyQuote();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  initTheme();
}

async function startTodoApp(user) {
  if (!user || activeUserId === user.id) return;

  stopTodoApp();
  const sessionVersion = ++appSessionVersion;
  activeUserId = user.id;
  setCurrentUser(user);

  list.innerHTML = '<li class="empty-state"><p>正在从云端加载...</p></li>';
  try {
    await loadTodos();
    if (sessionVersion !== appSessionVersion || activeUserId !== user.id) return;
    openDescriptions = loadOpenDescriptions(todos);
    render();
    todoChannel = await subscribeTodoChanges(user.id, handleRealtimeTodoChange);
  } catch (error) {
    if (sessionVersion !== appSessionVersion) return;
    showCloudError(error);
    list.innerHTML = '<li class="empty-state"><p>云端数据加载失败，请检查建表语句与网络连接。</p></li>';
  }
}

function stopTodoApp() {
  appSessionVersion += 1;
  activeUserId = null;
  clearTimeout(realtimeRefreshTimer);
  pendingRealtimeEchoes.clear();
  recentLocalCreates.clear();
  recentLocalDeletes.clear();
  unsubscribeTodoChanges(todoChannel);
  todoChannel = null;
  setCurrentUser(null);
  openDescriptions = new Set();
}

window.addEventListener('beforeunload', () => unsubscribeTodoChanges(todoChannel));
initAppShell();
