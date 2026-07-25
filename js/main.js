// ============================================================
// main.js — DOM 操作、事件交互、渲染引擎
// ============================================================

// (storage.js、theme.js 已在前面的 <script> 中加载，所有函数均为全局可用)

// ---- DOM 引用 ----
const input = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const list = document.getElementById('todoLists');
const activeList = document.getElementById('todoList');
const completedList = document.getElementById('completedTodoList');
const completedSection = document.getElementById('completedSection');
const completedToggle = document.getElementById('completedToggle');
const countText = document.getElementById('countText');
const clearBtn = document.getElementById('clearDone');
const progressCircle = document.getElementById('progressCircle');
const percentText = document.getElementById('percentText');
const workspaceTitle = document.getElementById('workspaceTitle');
const workspaceSummary = document.getElementById('workspaceSummary');
const activeTaskCount = document.getElementById('activeTaskCount');
const completedTaskCount = document.getElementById('completedTaskCount');
const allTaskCount = document.getElementById('allTaskCount');
const categoryList = document.getElementById('categoryList');
const allTasksNav = document.getElementById('allTasksNav');
const newTaskCategorySelect = document.getElementById('newTaskCategorySelect');
const composerCategory = document.getElementById('composerCategory');
const appRoot = document.getElementById('appView');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
const sidebarScrim = document.getElementById('sidebarScrim');
const taskWorkspace = document.getElementById('taskWorkspace');
const settingsView = document.getElementById('settingsView');
const settingsBtn = document.getElementById('settingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const showSidebarTimeSetting = document.getElementById('showSidebarTimeSetting');
const showQuoteSetting = document.getElementById('showQuoteSetting');
const showTaskTimesSetting = document.getElementById('showTaskTimesSetting');

const circumference = 2 * Math.PI * 60;
const TIME_VISIBILITY_STORAGE_PREFIX = 'geek-todos-show-times:';
const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'geek-todos-sidebar-collapsed:';
const COMPLETED_EXPANDED_STORAGE_PREFIX = 'geek-todos-completed-expanded:';
const SIDEBAR_TIME_STORAGE_PREFIX = 'geek-todos-sidebar-time:';
const QUOTE_VISIBLE_STORAGE_PREFIX = 'geek-todos-quote-visible:';
const ALL_CATEGORY_ID = 'all';
const UNASSIGNED_CATEGORY_ID = 'unassigned';
const CATEGORY_COLORS = ['#9fc79f', '#78b8c5', '#e6b65f', '#ef806d', '#b8a7d9', '#8fa58f'];
let activeCategoryId = ALL_CATEGORY_ID;
let showTaskTimes = false;
let completedExpanded = false;
let sidebarCollapsed = false;
let showSidebarTime = true;
let showSidebarQuote = true;
let lastMoveUndo = null;
let toastTimer = null;

// 记录展开的描述区域 key: "todoId" 或 "todoId:subId"
let openDescriptions = new Set();
let todoChannel = null;
let categoryChannel = null;
let realtimeRefreshTimer = null;
const pendingRealtimeEchoes = new Map();
const pendingDescriptionSaves = new Map();
const pendingCollapseUpdates = new Map();
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

function getSavedBoolean(prefix, userId, fallback) {
  if (!userId) return fallback;
  try {
    const value = localStorage.getItem(`${prefix}${userId}`);
    return value === null ? fallback : value === 'true';
  } catch (error) {
    console.warn('读取界面偏好失败:', error);
    return fallback;
  }
}

function saveBoolean(prefix, value) {
  if (!activeUserId) return;
  try {
    localStorage.setItem(`${prefix}${activeUserId}`, String(Boolean(value)));
  } catch (error) {
    console.warn('保存界面偏好失败:', error);
  }
}

function getSavedTimeVisibility(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${TIME_VISIBILITY_STORAGE_PREFIX}${userId}`) === 'true';
  } catch (error) {
    console.warn('读取时间显示偏好失败:', error);
    return false;
  }
}

function saveTimeVisibility() {
  if (!activeUserId) return;
  try {
    localStorage.setItem(`${TIME_VISIBILITY_STORAGE_PREFIX}${activeUserId}`, String(showTaskTimes));
  } catch (error) {
    console.warn('保存时间显示偏好失败:', error);
  }
}

function setTimeVisibility(visible, { persist = false } = {}) {
  showTaskTimes = Boolean(visible);
  document.body.classList.toggle('show-task-times', showTaskTimes);
  showTaskTimesSetting.checked = showTaskTimes;

  if (persist) saveTimeVisibility();
}

function setSidebarCollapsed(collapsed, { persist = false } = {}) {
  sidebarCollapsed = Boolean(collapsed);
  appRoot.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
  sidebarToggle.setAttribute('aria-label', sidebarCollapsed ? '展开侧栏' : '收起侧栏');
  sidebarToggle.title = sidebarCollapsed ? '展开侧栏' : '收起侧栏';
  if (persist) saveBoolean(SIDEBAR_COLLAPSED_STORAGE_PREFIX, sidebarCollapsed);
}

function setCompletedExpanded(expanded, { persist = false } = {}) {
  completedExpanded = Boolean(expanded);
  completedList.hidden = !completedExpanded;
  completedSection.classList.toggle('expanded', completedExpanded);
  completedToggle.setAttribute('aria-expanded', String(completedExpanded));
  if (persist) saveBoolean(COMPLETED_EXPANDED_STORAGE_PREFIX, completedExpanded);
}

function setSidebarTimeVisible(visible, { persist = false } = {}) {
  showSidebarTime = Boolean(visible);
  document.getElementById('sidebarDatetime').hidden = !showSidebarTime;
  showSidebarTimeSetting.checked = showSidebarTime;
  if (persist) saveBoolean(SIDEBAR_TIME_STORAGE_PREFIX, showSidebarTime);
}

function setSidebarQuoteVisible(visible, { persist = false } = {}) {
  showSidebarQuote = Boolean(visible);
  document.getElementById('sidebarQuote').hidden = !showSidebarQuote;
  showQuoteSetting.checked = showSidebarQuote;
  if (persist) saveBoolean(QUOTE_VISIBLE_STORAGE_PREFIX, showSidebarQuote);
}

async function restoreCloudState(error) {
  showCloudError(error);
  try {
    await Promise.all([loadCategories(), loadTodos()]);
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
  const positionOrder = a.position - b.position;
  if (positionOrder !== 0) return positionOrder;
  return a.parentId ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
}

function getCategoryById(id) {
  return categories.find(category => category.id === id) || null;
}

function getCategoryName(categoryId) {
  if (!categoryId) return '未分组';
  return getCategoryById(categoryId)?.name || '未分组';
}

function getCategoryColor(categoryId) {
  return getCategoryById(categoryId)?.color || '#8fa58f';
}

function matchesCategory(todo, categoryId = activeCategoryId) {
  if (categoryId === ALL_CATEGORY_ID) return true;
  if (categoryId === UNASSIGNED_CATEGORY_ID) return !todo.categoryId;
  return todo.categoryId === categoryId;
}

function getScopedTodos() {
  return todos.filter(todo => matchesCategory(todo));
}

function categoryOptionHtml(selectedCategoryId = null) {
  return [
    `<option value="" ${selectedCategoryId ? '' : 'selected'}>未分组</option>`,
    ...categories.map(category => (
      `<option value="${category.id}" ${category.id === selectedCategoryId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`
    )),
  ].join('');
}

function syncCategorySelects() {
  const composerValue = newTaskCategorySelect.value;
  newTaskCategorySelect.innerHTML = categoryOptionHtml(composerValue || null);
  if (composerValue && getCategoryById(composerValue)) newTaskCategorySelect.value = composerValue;

  const moveSelect = document.getElementById('moveCategorySelect');
  const bulkSelect = document.getElementById('bulkCategorySelect');
  moveSelect.innerHTML = categoryOptionHtml();
  bulkSelect.innerHTML = categories.length > 0
    ? categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
    : '<option value="" disabled>请先新建分组</option>';
}

function syncComposerCategory() {
  const isAllTasks = activeCategoryId === ALL_CATEGORY_ID;
  composerCategory.hidden = !isAllTasks;
  if (isAllTasks && !newTaskCategorySelect.value) newTaskCategorySelect.value = '';

  const targetName = activeCategoryId === ALL_CATEGORY_ID
    ? getCategoryName(newTaskCategorySelect.value || null)
    : (activeCategoryId === UNASSIGNED_CATEGORY_ID ? '未分组' : getCategoryName(activeCategoryId));
  input.placeholder = `添加到「${targetName}」`;
}

function setActiveCategory(categoryId) {
  const validId = categoryId === ALL_CATEGORY_ID
    || categoryId === UNASSIGNED_CATEGORY_ID
    || Boolean(getCategoryById(categoryId));
  activeCategoryId = validId ? categoryId : ALL_CATEGORY_ID;
  taskWorkspace.hidden = false;
  settingsView.hidden = true;
  settingsBtn.classList.remove('active');
  closeMobileSidebar();
  render();
}

function renderCategoryNavigation() {
  const unassignedCount = todos.filter(todo => !todo.categoryId).length;
  const unassignedActive = activeCategoryId === UNASSIGNED_CATEGORY_ID;
  const unassignedRow = `
    <li class="category-row system-category-row" data-drop-category-id="${UNASSIGNED_CATEGORY_ID}">
      <button class="group-nav-item ${unassignedActive ? 'active' : ''}" type="button" data-category-id="${UNASSIGNED_CATEGORY_ID}" ${unassignedActive ? 'aria-current="page"' : ''}>
        <span class="category-dot unassigned-dot" aria-hidden="true"></span>
        <span>未分组</span>
        <b>${unassignedCount}</b>
      </button>
      ${unassignedCount > 0 ? `<button class="category-row-action organize-category-btn" type="button" data-action="bulk-organize" title="批量整理未分组任务" aria-label="批量整理未分组任务">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg>
      </button>` : ''}
    </li>`;

  const customRows = categories.map(category => {
    const count = todos.filter(todo => todo.categoryId === category.id).length;
    const isActive = activeCategoryId === category.id;
    return `
      <li class="category-row" draggable="true" data-category-row-id="${category.id}" data-drop-category-id="${category.id}">
        <button class="group-nav-item ${isActive ? 'active' : ''}" type="button" data-category-id="${category.id}" ${isActive ? 'aria-current="page"' : ''}>
          <span class="category-dot" style="--category-color: ${category.color}" aria-hidden="true"></span>
          <span>${escapeHtml(category.name)}</span>
          <b>${count}</b>
        </button>
        <button class="category-row-action" type="button" data-action="edit-category" data-category-id="${category.id}" title="编辑${escapeHtml(category.name)}" aria-label="编辑${escapeHtml(category.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
        </button>
      </li>`;
  }).join('');

  categoryList.innerHTML = unassignedRow + customRows;
  allTasksNav.classList.toggle('active', activeCategoryId === ALL_CATEGORY_ID);
  allTasksNav.toggleAttribute('aria-current', activeCategoryId === ALL_CATEGORY_ID);
  allTaskCount.textContent = todos.length;
  syncCategorySelects();
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
  render();
  const todoElement = getTodoElement(todo.id);
  if (!todoElement) return null;

  todoElement.classList.toggle('done', todo.done);
  const checkbox = todoElement.querySelector('.checkbox');
  if (checkbox) {
    checkbox.setAttribute('aria-pressed', String(todo.done));
    checkbox.setAttribute('aria-label', todo.done ? '标记为未完成' : '标记为已完成');
  }
  const timeElement = todoElement.querySelector('.task-time-label');
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
        timeElement.innerHTML = renderSubtaskTimeContentHtml(subtask);
      }
    }
    syncSubtaskProgressDom(todo, todoElement);
  }
  updateListSummary();
}

function syncSubtaskProgressDom(todo, todoElement = getTodoElement(todo.id)) {
  if (!todoElement || todo.subtasks.length === 0) return;

  const doneCount = todo.subtasks.filter(item => item.done).length;
  const progress = Math.round((doneCount / todo.subtasks.length) * 100);
  const progressFill = todoElement.querySelector('.subtask-bar-fill');
  const progressElement = todoElement.querySelector('.subtask-progress');
  const doneCountElement = todoElement.querySelector('.subtask-count .done-count');
  const totalCountElement = todoElement.querySelector('.subtask-count .total-count');
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressElement) progressElement.setAttribute('aria-label', `子任务完成情况：${doneCount}/${todo.subtasks.length}`);
  if (doneCountElement) doneCountElement.textContent = doneCount;
  if (totalCountElement) totalCountElement.textContent = todo.subtasks.length;

  const progressMeta = todoElement.querySelector('.task-progress-meta');
  if (progressMeta) {
    progressMeta.textContent = `子任务 ${doneCount}/${todo.subtasks.length}`;
    progressMeta.classList.toggle('is-complete', doneCount === todo.subtasks.length);
    progressMeta.setAttribute('aria-label', `子任务完成情况：${doneCount}/${todo.subtasks.length}`);
  }
}

function syncCollapsedProgressDom(todo, todoElement) {
  const timeElement = todoElement.querySelector('.task-time');
  if (!timeElement) return;

  let progressMeta = timeElement.querySelector('.task-progress-meta');
  if (!todo.collapsed || todo.subtasks.length === 0) {
    progressMeta?.remove();
    return;
  }

  const doneCount = todo.subtasks.filter(subtask => subtask.done).length;
  if (!progressMeta) {
    progressMeta = document.createElement('span');
    progressMeta.className = 'task-progress-meta';
    timeElement.appendChild(progressMeta);
  }
  progressMeta.textContent = `子任务 ${doneCount}/${todo.subtasks.length}`;
  progressMeta.classList.toggle('is-complete', doneCount === todo.subtasks.length);
  progressMeta.setAttribute('aria-label', `子任务完成情况：${doneCount}/${todo.subtasks.length}`);
}

function ensureSubtaskStructureDom(todo, todoElement) {
  const section = todoElement.querySelector('.subtask-section');
  if (!section) return null;

  let subtaskList = section.querySelector('.subtask-list');
  const addRow = section.querySelector('.subtask-add-row');
  if (!subtaskList) {
    const template = document.createElement('template');
    template.innerHTML = '<ul class="subtask-list"></ul>';
    subtaskList = template.content.firstElementChild;
    section.insertBefore(subtaskList, addRow || null);
  }

  if (!section.querySelector('.subtask-footer')) {
    const template = document.createElement('template');
    template.innerHTML = renderSubtaskFooterHtml(todo).trim();
    section.insertBefore(template.content.firstElementChild, addRow || null);
  }

  if (!todoElement.querySelector('.collapse-toggle')) {
    const actions = todoElement.querySelector('.todo-actions');
    if (actions) {
      const template = document.createElement('template');
      template.innerHTML = renderCollapseToggleHtml(todo).trim();
      actions.before(template.content.firstElementChild);
    }
  }

  section.classList.toggle('collapsed', todo.collapsed);
  return subtaskList;
}

function syncInsertedSubtaskDom(todo, subtask) {
  const todoElement = syncTodoCompletionDom(todo);
  if (!todoElement) {
    updateListSummary();
    return;
  }

  const subtaskList = ensureSubtaskStructureDom(todo, todoElement);
  if (!subtaskList) return;

  let subtaskElement = [...subtaskList.children]
    .find(element => element.dataset.id === subtask.id);
  if (!subtaskElement) {
    subtaskElement = createSubtaskElement(todo, subtask);
    subtaskList.appendChild(subtaskElement);
  }

  for (const item of todo.subtasks) {
    const element = [...subtaskList.children]
      .find(candidate => candidate.dataset.id === item.id);
    if (element) subtaskList.appendChild(element);
  }

  syncSubtaskProgressDom(todo, todoElement);
  syncCollapsedProgressDom(todo, todoElement);
  const addRow = todoElement.querySelector('.subtask-add-row');
  syncSubtaskAddTriggers(todo.id, addRow?.classList.contains('visible') || false);
  updateListSummary();
}

function syncTodoCollapseDom(todo, { animate = true } = {}) {
  const todoElement = getTodoElement(todo.id);
  if (!todoElement) return;

  const button = todoElement.querySelector('.collapse-toggle');
  const chevron = button?.querySelector('.collapse-chevron');
  const section = todoElement.querySelector('.subtask-section');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (button) {
    const label = todo.collapsed ? '展开子任务' : '折叠子任务';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(!todo.collapsed));
  }
  chevron?.classList.toggle('collapsed', todo.collapsed);

  if (section) {
    const transitionId = String(Number(section.dataset.collapseTransition || 0) + 1);
    section.dataset.collapseTransition = transitionId;
    clearTimeout(section.collapseTransitionTimer);

    if (!animate || reduceMotion) {
      section.classList.toggle('collapsed', todo.collapsed);
      section.classList.remove('is-animating');
      section.style.maxHeight = '';
    } else {
      const currentHeight = section.getBoundingClientRect().height;
      section.classList.add('is-animating');
      section.style.maxHeight = `${currentHeight}px`;
      section.getBoundingClientRect();
      section.classList.toggle('collapsed', todo.collapsed);
      const targetHeight = todo.collapsed ? 0 : section.scrollHeight;

      requestAnimationFrame(() => {
        if (section.dataset.collapseTransition === transitionId) {
          section.style.maxHeight = `${targetHeight}px`;
        }
      });

      section.collapseTransitionTimer = setTimeout(() => {
        if (section.dataset.collapseTransition !== transitionId) return;
        section.classList.remove('is-animating');
        section.style.maxHeight = '';
      }, 380);
    }
  }

  syncCollapsedProgressDom(todo, todoElement);
}

function toggleTodoCollapse(todo) {
  const previousCollapsed = todo.collapsed;
  const collapsed = !previousCollapsed;
  let controller = pendingCollapseUpdates.get(todo.id);
  if (!controller) {
    controller = {
      confirmedCollapsed: previousCollapsed,
      latestSequence: 0,
      queue: Promise.resolve(),
    };
    pendingCollapseUpdates.set(todo.id, controller);
  }

  todo.collapsed = collapsed;
  syncTodoCollapseDom(todo);

  const sequence = ++controller.latestSequence;
  const expectedUserId = activeUserId;
  const operation = controller.queue.then(async () => {
    if (activeUserId !== expectedUserId) return;
    try {
      await updateTodoWithRealtimeEcho(todo.id, { collapsed });
      controller.confirmedCollapsed = collapsed;
    } catch (error) {
      if (activeUserId !== expectedUserId) return;
      const currentTodo = todos.find(item => item.id === todo.id);
      if (
        sequence === controller.latestSequence
        && currentTodo?.collapsed === collapsed
      ) {
        currentTodo.collapsed = controller.confirmedCollapsed;
        syncTodoCollapseDom(currentTodo);
      }
      showCloudError(error);
    }
  });

  controller.queue = operation;
  operation.finally(() => {
    if (
      controller.queue === operation
      && sequence === controller.latestSequence
      && pendingCollapseUpdates.get(todo.id) === controller
    ) {
      pendingCollapseUpdates.delete(todo.id);
    }
  });
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
  const categoryId = activeCategoryId === ALL_CATEGORY_ID
    ? (newTaskCategorySelect.value || null)
    : (activeCategoryId === UNASSIGNED_CATEGORY_ID ? null : activeCategoryId);
  try {
    const todo = await createTodoRecord({ text, categoryId, position: 0 });
    const alreadyPresent = Boolean(findTodoItem(todo.id));
    rememberLocalCreate(todo.id);
    const affectedTodoIds = upsertTodoItem(todo);
    input.value = '';
    input.focus();
    if (!alreadyPresent) renderChangedTodos(affectedTodoIds);
    await saveParentTodoPositions(updateTodoWithRealtimeEcho);
  } catch (error) {
    await restoreCloudState(error);
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
  const descriptionKey = `${todoId}:${subId}`;
  const pendingDescriptionSave = pendingDescriptionSaves.get(descriptionKey);
  if (pendingDescriptionSave && !(await pendingDescriptionSave)) return;

  const t = todos.find(t => t.id === todoId);
  if (!t) return;
  const sub = t.subtasks.find(s => s.id === subId);
  if (sub) {
    const previousSubDone = sub.done;
    const previousSubCompletedAt = sub.completedAt;
    const previousSubDescriptionOpen = sub.descriptionOpen;
    const previousDescriptionWasOpen = openDescriptions.has(descriptionKey);
    const previousParentDone = t.done;
    const previousParentCompletedAt = t.completedAt;
    const done = !sub.done;
    const completedAt = done ? Date.now() : null;
    const siblingStates = t.subtasks.map(item => item.id === subId ? done : item.done);
    const parentDone = siblingStates.every(Boolean);
    const parentCompletedAt = parentDone ? (t.completedAt || Date.now()) : null;

    sub.done = done;
    sub.completedAt = completedAt;
    if (done) {
      sub.descriptionOpen = false;
      openDescriptions.delete(descriptionKey);
      syncDescriptionDom(todoId, subId);
    }
    t.done = parentDone;
    t.completedAt = parentCompletedAt;
    syncSubtaskCompletionDom(t, sub);

    // 双向同步：所有子任务完成 → 父任务完成；有子任务取消 → 父任务取消
    try {
      await Promise.all([
        updateTodoWithRealtimeEcho(subId, {
          done,
          completedAt,
          ...(done ? { descriptionOpen: false } : {}),
        }),
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
        if (
          done
          && sub.descriptionOpen === false
          && !openDescriptions.has(descriptionKey)
        ) {
          sub.descriptionOpen = previousSubDescriptionOpen;
          if (previousDescriptionWasOpen) openDescriptions.add(descriptionKey);
          else openDescriptions.delete(descriptionKey);
          syncDescriptionDom(todoId, subId);
        }
      }
      showCloudError(error);
    }
  }
}

async function addSubtask(todoId, text) {
  const t = todos.find(t => t.id === todoId);
  const subtaskText = text.trim();
  if (!t || !subtaskText) return false;

  try {
    const operations = [createTodoRecord({
      text: subtaskText,
      parentId: todoId,
      position: t.subtasks.length,
    })];
    if (t.done) {
      operations.push(updateTodoWithRealtimeEcho(todoId, { done: false, completedAt: null }));
    }

    const [subtask] = await Promise.all(operations);
    rememberLocalCreate(subtask.id);
    upsertTodoItem(subtask);
    if (t.done) {
      t.done = false;
      t.completedAt = null;
    }
    syncInsertedSubtaskDom(t, subtask);
    return true;
  } catch (error) {
    showCloudError(error);
    return false;
  }
}

function setSubtaskAddPending(row, isPending) {
  const inputElement = row.querySelector('input');
  const confirmButton = row.querySelector('.sub-confirm');
  row.classList.toggle('is-saving', isPending);
  row.setAttribute('aria-busy', String(isPending));
  if (inputElement) inputElement.readOnly = isPending;
  if (confirmButton) confirmButton.disabled = isPending;
}

function syncSubtaskAddTriggers(todoId, isOpen) {
  if (!todoId) return;
  document.querySelectorAll(`[data-action="show-sub-add"][data-todo-id="${todoId}"]`)
    .forEach(trigger => trigger.setAttribute('aria-expanded', String(isOpen)));
}

function closeSubtaskAddRow(row, { clear = false } = {}) {
  if (!row) return;
  row.classList.remove('visible');
  const inputElement = row.querySelector('input');
  if (clear && inputElement && !row.classList.contains('is-saving')) inputElement.value = '';
  syncSubtaskAddTriggers(row.querySelector('input')?.dataset.todoId, false);
}

function closeAllSubtaskAddRows(exceptRow = null) {
  document.querySelectorAll('.subtask-add-row.visible').forEach(row => {
    if (row !== exceptRow) closeSubtaskAddRow(row);
  });
}

function toggleSubtaskAddRow(todoId) {
  const row = document.getElementById(`sub-add-${todoId}`);
  const todo = todos.find(item => item.id === todoId);
  if (!row || !todo) return;

  const isVisible = row.classList.contains('visible');
  closeAllSubtaskAddRows(row);
  if (isVisible) {
    closeSubtaskAddRow(row, { clear: true });
    return;
  }

  const inputElement = row.querySelector('input');
  row.classList.add('visible');
  syncSubtaskAddTriggers(todoId, true);
  if (inputElement && !row.classList.contains('is-saving')) inputElement.value = '';
  if (todo.collapsed) toggleTodoCollapse(todo);

  requestAnimationFrame(() => {
    inputElement?.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  });
}

async function submitSubtaskAddRow(row) {
  if (!row || row.classList.contains('is-saving')) return;
  const inputElement = row.querySelector('input');
  const todoId = inputElement?.dataset.todoId;
  const submittedText = inputElement?.value.trim();
  if (!todoId || !submittedText) return;

  setSubtaskAddPending(row, true);
  const wasAdded = await addSubtask(todoId, submittedText);
  setSubtaskAddPending(row, false);
  if (!row.isConnected) return;

  if (wasAdded) inputElement.value = '';
  else inputElement.value = submittedText;
  if (row.classList.contains('visible')) {
    inputElement.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
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
  const doneIds = new Set(getScopedTodos().filter(t => t.done).map(t => t.id));
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

  if (!target.description && !openDescriptions.has(key)) {
    openDescriptions.add(key);
    syncDescriptionDom(todoId, subId);
    startEditDescription(todoId, subId, { isNewDescription: true });
    return;
  }

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

function startEditDescription(todoId, subId, { isNewDescription = false } = {}) {
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
  const rollbackWasOpen = isNewDescription ? false : originalWasOpen;

  const save = () => {
    if (saved) return pendingDescriptionSaves.get(key) || Promise.resolve(true);
    saved = true;
    const operation = (async () => {
      const newDesc = textarea.value.trim();
      const target = subId ? t.subtasks.find(s => s.id === subId) : t;
      if (!target) return false;

      const changes = { description: newDesc };
      if (isNewDescription) {
        target.descriptionOpen = Boolean(newDesc);
        changes.descriptionOpen = Boolean(newDesc);
      } else if (!newDesc) {
        changes.descriptionOpen = false;
      }

      target.description = newDesc;
      if (!newDesc) {
        target.descriptionOpen = false;
        openDescriptions.delete(key);
      }
      const optimisticDescriptionOpen = target.descriptionOpen;
      syncDescriptionDom(todoId, subId);

      const needsUpdate = newDesc !== currentDesc
        || (!newDesc && originalWasOpen && !isNewDescription);
      if (!needsUpdate) return true;

      try {
        await updateTodoWithRealtimeEcho(target.id, changes);
        return true;
      } catch (error) {
        if (
          target.description === newDesc
          && target.descriptionOpen === optimisticDescriptionOpen
        ) {
          target.description = currentDesc;
          target.descriptionOpen = originalDescriptionOpen;
          if (rollbackWasOpen) openDescriptions.add(key);
          else openDescriptions.delete(key);
          syncDescriptionDom(todoId, subId);
        }
        showCloudError(error);
        return false;
      }
    })();

    pendingDescriptionSaves.set(key, operation);
    operation.finally(() => {
      if (pendingDescriptionSaves.get(key) === operation) {
        pendingDescriptionSaves.delete(key);
      }
    });
    return operation;
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      saved = true; // 阻止 blur 保存
      if (isNewDescription) {
        const target = subId ? t.subtasks.find(s => s.id === subId) : t;
        if (target) target.descriptionOpen = originalDescriptionOpen;
        openDescriptions.delete(key);
      }
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
  const scopedTodos = getScopedTodos();
  if (scopedTodos.length === 0) {
    progressCircle.style.strokeDashoffset = circumference;
    percentText.textContent = '0%';
    return;
  }
  const allSubtasks = scopedTodos.flatMap(t => t.subtasks);
  const totalItems = scopedTodos.length + allSubtasks.length;
  if (totalItems === 0) {
    progressCircle.style.strokeDashoffset = circumference;
    percentText.textContent = '0%';
    return;
  }
  const doneTodos = scopedTodos.filter(t => t.done).length;
  const doneSubtasks = allSubtasks.filter(s => s.done).length;
  const totalDone = doneTodos + doneSubtasks;
  const percent = Math.round((totalDone / totalItems) * 100);
  const offset = circumference - (totalDone / totalItems) * circumference;
  progressCircle.style.strokeDashoffset = offset;
  percentText.textContent = percent + '%';
}

function updateSideStats() {
  const scopedTodos = getScopedTodos();
  const done = scopedTodos.filter(todo => todo.done).length;
  workspaceSummary.textContent = `${scopedTodos.length - done} 个进行中 · ${done} 个已完成`;
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
  return matchesCategory(todo);
}

function getVisibleTodos() {
  return getScopedTodos();
}

function getEmptyStateHtml(scopedTodos = getScopedTodos()) {
  const icon = scopedTodos.length === 0
    ? '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="8" width="30" height="32" rx="5"/><path d="M16 18h16M16 25h10M16 32h7"/><path class="empty-accent" d="m29 31 3 3 7-8"/></svg>'
    : '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path class="empty-accent" d="m16 24 5 5 11-12"/></svg>';
  const title = scopedTodos.length === 0 ? '这个分组还没有任务' : '进行中的任务已经清空';
  const desc = scopedTodos.length === 0 ? '先写下一件值得完成的事' : '已完成任务收在下方';
  return `
    <li class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </li>`;
}

function renderSubtaskAddRowHtml(todoId) {
  return `
    <div class="subtask-add-row" id="sub-add-${todoId}" aria-busy="false">
      <input type="text" placeholder="输入子任务" data-action="sub-input" data-todo-id="${todoId}" />
      <button class="sub-confirm" type="button" data-action="confirm-sub" data-todo-id="${todoId}">添加</button>
    </div>`;
}

function renderSubtaskTimeContentHtml(subtask) {
  const completedTime = subtask.done && subtask.completedAt
    ? `
      <span class="subtask-time-arrow" aria-hidden="true">→</span>
      <span class="subtask-time-entry is-completed">
        <span class="subtask-time-label">完成于</span>
        <span class="subtask-time-value">${formatTime(subtask.completedAt)}</span>
      </span>`
    : '';

  return `
    <span class="subtask-time-entry">
      <span class="subtask-time-label">创建于</span>
      <span class="subtask-time-value">${formatTime(subtask.createdAt)}</span>
    </span>
    ${completedTime}`;
}

function renderSubtaskHtml(todo, subtask) {
  return `
    <li class="subtask-item ${subtask.done ? 'done' : ''}" data-todo-id="${todo.id}" data-id="${subtask.id}" draggable="true">
      <div class="subtask-main">
        <span class="subtask-drag-handle" title="拖拽排序" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg></span>
        <button class="subtask-checkbox" type="button" data-action="toggle-sub" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" aria-label="${subtask.done ? '标记为未完成' : '标记为已完成'}" aria-pressed="${subtask.done}">
          <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
        </button>
        <div class="subtask-body">
          <div class="subtask-actions">
            <button class="subtask-desc-btn ${subtask.description ? 'has-desc' : ''}" type="button" data-action="toggle-desc" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" title="详情描述" aria-label="详情描述">
              <svg class="desc-icon" viewBox="0 0 16 16" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
                <path d="M5.5 6.5h5M5.5 9h3.5"/>
              </svg>
            </button>
            <button class="subtask-delete" type="button" data-action="delete-sub" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" title="删除子任务" aria-label="删除子任务">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <span class="subtask-text">${escapeHtml(subtask.text)}</span>
          <div class="subtask-time">${renderSubtaskTimeContentHtml(subtask)}</div>
        </div>
      </div>
      ${subtask.description || openDescriptions.has(todo.id + ':' + subtask.id) ? `<div class="subtask-desc-section" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" style="display: ${openDescriptions.has(todo.id + ':' + subtask.id) ? 'block' : 'none'};">
        <div class="desc-display">${subtask.description ? escapeHtml(subtask.description) : ''}</div>
      </div>` : ''}
    </li>`;
}

function renderSubtaskFooterHtml(todo) {
  const doneCount = todo.subtasks.filter(subtask => subtask.done).length;
  const progress = todo.subtasks.length > 0
    ? Math.round((doneCount / todo.subtasks.length) * 100)
    : 0;
  return `
    <div class="subtask-footer">
      <div class="subtask-progress" aria-label="子任务完成情况：${doneCount}/${todo.subtasks.length}">
        <div class="subtask-bar-bg">
          <div class="subtask-bar-fill" style="width: ${progress}%"></div>
        </div>
        <span class="subtask-count"><span class="done-count">${doneCount}</span>/<span class="total-count">${todo.subtasks.length}</span></span>
      </div>
      <button class="subtask-add-trigger" type="button" data-action="show-sub-add" data-todo-id="${todo.id}" aria-label="添加子任务" aria-controls="sub-add-${todo.id}" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>添加子任务</span>
      </button>
    </div>`;
}

function renderCollapseToggleHtml(todo) {
  return `<button class="collapse-toggle" type="button" data-action="toggle-collapse" data-id="${todo.id}" title="${todo.collapsed ? '展开子任务' : '折叠子任务'}" aria-label="${todo.collapsed ? '展开子任务' : '折叠子任务'}" aria-expanded="${!todo.collapsed}">
    <svg class="collapse-chevron ${todo.collapsed ? 'collapsed' : ''}" viewBox="0 0 12 12"><polyline points="2,3 6,8 10,3" /></svg>
  </button>`;
}

function renderTodoHtml(t) {
  const subtaskCount = t.subtasks.length;
  const doneCount = t.subtasks.filter(s => s.done).length;
  const subAddRowHtml = renderSubtaskAddRowHtml(t.id);
  const categoryBadgeHtml = activeCategoryId === ALL_CATEGORY_ID
    ? `<span class="task-category-badge"><span style="--category-color: ${getCategoryColor(t.categoryId)}"></span>${escapeHtml(getCategoryName(t.categoryId))}</span>`
    : '';

  const subtasksHtml = subtaskCount > 0 ? `
    <div class="subtask-section ${t.collapsed ? 'collapsed' : ''}">
      <ul class="subtask-list">
        ${t.subtasks.map(s => renderSubtaskHtml(t, s)).join('')}
      </ul>
      ${renderSubtaskFooterHtml(t)}
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
        <div class="todo-body">
          <div class="todo-text">${escapeHtml(t.text)}</div>
          <div class="task-meta">${categoryBadgeHtml}<div class="task-time"><span class="task-time-label">创建于 ${formatTime(t.createdAt)}${t.done && t.completedAt ? ' · 完成于 ' + formatTime(t.completedAt) : ''}</span>${t.collapsed && subtaskCount > 0 ? `<span class="task-progress-meta ${doneCount === subtaskCount ? 'is-complete' : ''}" aria-label="子任务完成情况：${doneCount}/${subtaskCount}">子任务 ${doneCount}/${subtaskCount}</span>` : ''}</div></div>
          ${t.description || openDescriptions.has(t.id) ? `<div class="desc-section" data-id="${t.id}" style="display: ${openDescriptions.has(t.id) ? 'block' : 'none'};">
            <div class="desc-display">${t.description ? escapeHtml(t.description) : ''}</div>
          </div>` : ''}
        </div>
        ${subtaskCount > 0 ? renderCollapseToggleHtml(t) : ''}
        <div class="todo-actions">
          <button class="action-btn sub-add-action" type="button" data-action="show-sub-add" data-todo-id="${t.id}" title="添加子任务" aria-label="添加子任务" aria-controls="sub-add-${t.id}" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="action-btn edit-btn" type="button" data-action="start-edit" data-id="${t.id}" title="编辑标题" aria-label="编辑标题">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button class="action-btn move-btn" type="button" data-action="move-group" data-id="${t.id}" title="移动到分组" aria-label="移动到分组">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="m10 13 2 2 4-4"/></svg>
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
      ${subtasksHtml}
    </li>
  `;
}

function createTodoElement(todo) {
  const template = document.createElement('template');
  template.innerHTML = renderTodoHtml(todo).trim();
  return template.content.firstElementChild;
}

function createSubtaskElement(todo, subtask) {
  const template = document.createElement('template');
  template.innerHTML = renderSubtaskHtml(todo, subtask).trim();
  return template.content.firstElementChild;
}

function getTodoElement(id) {
  return [...list.querySelectorAll('.todo-item')].find(element => element.dataset.id === id) || null;
}

function updateListSummary() {
  const scopedTodos = getScopedTodos();
  const activeCountValue = scopedTodos.filter(todo => !todo.done).length;
  const completedCountValue = scopedTodos.length - activeCountValue;
  countText.textContent = scopedTodos.length === 0
    ? '暂无任务'
    : `进行中 ${activeCountValue} · 共 ${scopedTodos.length} 个父任务`;
  activeTaskCount.textContent = activeCountValue;
  completedTaskCount.textContent = completedCountValue;
  clearBtn.style.display = completedCountValue > 0 ? 'inline-grid' : 'none';
  updateProgress();
  updateSideStats();
}

function render() {
  if (activeCategoryId !== ALL_CATEGORY_ID
    && activeCategoryId !== UNASSIGNED_CATEGORY_ID
    && !getCategoryById(activeCategoryId)) {
    activeCategoryId = UNASSIGNED_CATEGORY_ID;
  }
  const scopedTodos = getVisibleTodos();
  const activeTodos = scopedTodos.filter(todo => !todo.done);
  const completedTodos = scopedTodos.filter(todo => todo.done);

  activeList.innerHTML = activeTodos.length > 0
    ? activeTodos.map(renderTodoHtml).join('')
    : getEmptyStateHtml(scopedTodos);
  completedList.innerHTML = completedTodos.map(renderTodoHtml).join('');
  completedSection.hidden = completedTodos.length === 0;
  completedList.hidden = !completedExpanded;

  if (activeCategoryId === ALL_CATEGORY_ID) workspaceTitle.textContent = '全部任务';
  else if (activeCategoryId === UNASSIGNED_CATEGORY_ID) workspaceTitle.textContent = '未分组';
  else workspaceTitle.textContent = getCategoryName(activeCategoryId);

  renderCategoryNavigation();
  syncComposerCategory();
  updateListSummary();
}

function renderChangedTodos(todoIds) {
  void todoIds;
  render();
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

    t.text = newText;
    try {
      await updateTodoWithRealtimeEcho(id, { text: newText });
    } catch (error) {
      t.text = originalText;
      if (textEl.isConnected) {
        textEl.textContent = originalText;
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
// 分组、设置与侧栏交互
// ============================================================

function showToast(message, undoAction = null) {
  const toast = document.getElementById('appToast');
  const undoButton = document.getElementById('undoMoveBtn');
  clearTimeout(toastTimer);
  document.getElementById('appToastText').textContent = message;
  lastMoveUndo = undoAction;
  undoButton.hidden = !undoAction;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    lastMoveUndo = null;
  }, 5000);
}

function closeMobileSidebar() {
  appRoot.classList.remove('mobile-sidebar-open');
  mobileSidebarToggle.setAttribute('aria-expanded', 'false');
}

function openMobileSidebar() {
  appRoot.classList.add('mobile-sidebar-open');
  mobileSidebarToggle.setAttribute('aria-expanded', 'true');
}

function showTaskWorkspace() {
  taskWorkspace.hidden = false;
  settingsView.hidden = true;
  settingsBtn.classList.remove('active');
  closeMobileSidebar();
}

function showSettings() {
  taskWorkspace.hidden = true;
  settingsView.hidden = false;
  settingsBtn.classList.add('active');
  closeMobileSidebar();
}

function closeDialog(id) {
  document.getElementById(id)?.close();
}

function openCategoryDialog(category = null) {
  const dialog = document.getElementById('categoryDialog');
  document.getElementById('categoryDialogTitle').textContent = category ? '编辑分组' : '新建分组';
  document.getElementById('categoryIdInput').value = category?.id || '';
  document.getElementById('categoryNameInput').value = category?.name || '';
  document.getElementById('deleteCategoryBtn').hidden = !category;

  const color = category?.color || CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];
  document.getElementById('categoryColorOptions').innerHTML = CATEGORY_COLORS.map(value => `
    <label class="category-color-option" title="${value}">
      <input type="radio" name="categoryColor" value="${value}" ${value === color ? 'checked' : ''}>
      <span style="--category-color: ${value}"></span>
    </label>`).join('');

  dialog.showModal();
  requestAnimationFrame(() => document.getElementById('categoryNameInput').focus());
}

async function submitCategoryForm(event) {
  event.preventDefault();
  const id = document.getElementById('categoryIdInput').value;
  const name = document.getElementById('categoryNameInput').value.trim();
  const color = document.querySelector('input[name="categoryColor"]:checked')?.value || CATEGORY_COLORS[0];
  if (!name) return;

  const duplicate = categories.some(category => category.id !== id && category.name.localeCompare(name, 'zh-CN', { sensitivity: 'accent' }) === 0);
  if (duplicate) {
    showToast('已经有同名分组');
    document.getElementById('categoryNameInput').focus();
    return;
  }

  try {
    if (id) {
      const updated = await updateCategoryRecord(id, { name, color });
      const category = getCategoryById(id);
      if (category) Object.assign(category, updated);
    } else {
      const created = await createCategoryRecord({ name, color, position: categories.length });
      categories.push(created);
      activeCategoryId = created.id;
    }
    closeDialog('categoryDialog');
    render();
  } catch (error) {
    showCloudError(error);
  }
}

async function deleteCurrentCategory() {
  const id = document.getElementById('categoryIdInput').value;
  const category = getCategoryById(id);
  if (!category || !window.confirm(`删除“${category.name}”？其中的任务会回到“未分组”。`)) return;

  try {
    await deleteCategoryRecord(id);
    categories = categories.filter(item => item.id !== id);
    todos.forEach(todo => {
      if (todo.categoryId === id) todo.categoryId = null;
    });
    if (activeCategoryId === id) activeCategoryId = UNASSIGNED_CATEGORY_ID;
    closeDialog('categoryDialog');
    render();
    showToast(`已删除“${category.name}”，任务已移到未分组`);
  } catch (error) {
    await restoreCloudState(error);
  }
}

function openMoveDialog(todoId) {
  const todo = todos.find(item => item.id === todoId);
  if (!todo) return;
  document.getElementById('moveTodoId').value = todoId;
  const select = document.getElementById('moveCategorySelect');
  select.innerHTML = categoryOptionHtml(todo.categoryId);
  select.value = todo.categoryId || '';
  document.getElementById('moveDialog').showModal();
  requestAnimationFrame(() => select.focus());
}

async function moveTodoToCategory(todoId, categoryId, { allowUndo = true, insertIndex = null } = {}) {
  const todo = todos.find(item => item.id === todoId);
  const normalizedCategoryId = categoryId || null;
  if (!todo || todo.categoryId === normalizedCategoryId) return false;
  if (normalizedCategoryId && !getCategoryById(normalizedCategoryId)) return false;

  const oldCategoryId = todo.categoryId;
  const oldIndex = todos.indexOf(todo);
  todos.splice(oldIndex, 1);
  todo.categoryId = normalizedCategoryId;
  if (Number.isInteger(insertIndex)) todos.splice(Math.min(insertIndex, todos.length), 0, todo);
  else todos.push(todo);
  render();

  try {
    await updateTodoWithRealtimeEcho(todoId, { categoryId: normalizedCategoryId });
    await saveParentTodoPositions(updateTodoWithRealtimeEcho);
    const destination = getCategoryName(normalizedCategoryId);
    showToast(`已移动到“${destination}”`, allowUndo
      ? () => moveTodoToCategory(todoId, oldCategoryId, { allowUndo: false, insertIndex: oldIndex })
      : null);
    return true;
  } catch (error) {
    await restoreCloudState(error);
    return false;
  }
}

async function submitMoveForm(event) {
  event.preventDefault();
  const todoId = document.getElementById('moveTodoId').value;
  const categoryId = document.getElementById('moveCategorySelect').value || null;
  closeDialog('moveDialog');
  await moveTodoToCategory(todoId, categoryId);
}

function openBulkOrganizeDialog() {
  const unassignedTodos = todos.filter(todo => !todo.categoryId);
  const dialog = document.getElementById('bulkOrganizeDialog');
  const taskContainer = document.getElementById('bulkTaskList');
  taskContainer.innerHTML = unassignedTodos.length > 0
    ? unassignedTodos.map(todo => `<label><input type="checkbox" name="bulkTodo" value="${todo.id}"><span>${escapeHtml(todo.text)}</span></label>`).join('')
    : '<p>没有需要整理的任务。</p>';
  document.getElementById('bulkCategorySelect').innerHTML = categories.length > 0
    ? categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
    : '<option value="" disabled>请先新建分组</option>';
  dialog.querySelector('.dialog-primary').disabled = categories.length === 0 || unassignedTodos.length === 0;
  dialog.showModal();
}

async function submitBulkOrganize(event) {
  event.preventDefault();
  const ids = [...document.querySelectorAll('input[name="bulkTodo"]:checked')].map(inputElement => inputElement.value);
  const categoryId = document.getElementById('bulkCategorySelect').value;
  if (ids.length === 0 || !categoryId) {
    showToast('请选择要整理的任务');
    return;
  }

  const snapshots = ids.map(id => {
    const todo = todos.find(item => item.id === id);
    return { id, categoryId: todo?.categoryId || null };
  });
  ids.forEach(id => {
    const todo = todos.find(item => item.id === id);
    if (todo) todo.categoryId = categoryId;
  });
  closeDialog('bulkOrganizeDialog');
  render();

  try {
    await Promise.all(ids.map(id => updateTodoWithRealtimeEcho(id, { categoryId })));
    showToast(`已整理 ${ids.length} 个任务到“${getCategoryName(categoryId)}”`, async () => {
      snapshots.forEach(snapshot => {
        const todo = todos.find(item => item.id === snapshot.id);
        if (todo) todo.categoryId = snapshot.categoryId;
      });
      render();
      try {
        await Promise.all(snapshots.map(snapshot => updateTodoWithRealtimeEcho(snapshot.id, { categoryId: snapshot.categoryId })));
      } catch (error) {
        await restoreCloudState(error);
      }
    });
  } catch (error) {
    await restoreCloudState(error);
  }
}

// ============================================================
// 拖拽排序与分组
// ============================================================

let draggedId = null;   // 父任务拖拽
let draggedSub = null;  // 子任务拖拽 { todoId, subId }
let draggedCategoryId = null;

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
  if (sidebarCollapsed) appRoot.classList.add('sidebar-drag-open');
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
  appRoot.classList.remove('sidebar-drag-open');
  document.querySelectorAll('.drag-over, .subtask-drag-over, .category-drop-target').forEach(el => {
    el.classList.remove('drag-over', 'subtask-drag-over', 'category-drop-target');
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
    const draggedTodo = todos.find(todo => todo.id === draggedId);
    const targetTodo = todoTarget ? todos.find(todo => todo.id === todoTarget.dataset.id) : null;
    if (todoTarget && targetTodo && draggedTodo
      && targetTodo.id !== draggedTodo.id
      && targetTodo.done === draggedTodo.done
      && targetTodo.categoryId === draggedTodo.categoryId) {
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

  const draggedTodo = todos.find(todo => todo.id === draggedId);
  const targetTodo = todos.find(todo => todo.id === targetId);
  if (!draggedTodo || !targetTodo
    || draggedTodo.done !== targetTodo.done
    || draggedTodo.categoryId !== targetTodo.categoryId) return;

  const fromIndex = todos.findIndex(t => t.id === draggedId);
  const toIndex = todos.findIndex(t => t.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = todos.splice(fromIndex, 1);
  todos.splice(toIndex, 0, moved);

  render();
  try {
    await saveParentTodoPositions(updateTodoWithRealtimeEcho);
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
    toggleSubtaskAddRow(actionEl.dataset.todoId);
  } else if (action === 'confirm-sub') {
    e.stopPropagation();
    submitSubtaskAddRow(actionEl.closest('.subtask-add-row'));
  } else if (action === 'start-edit') {
    e.stopPropagation();
    startEditTitle(actionEl.dataset.id);
  } else if (action === 'move-group') {
    e.stopPropagation();
    openMoveDialog(actionEl.dataset.id);
  } else if (action === 'toggle-collapse') {
    e.stopPropagation();
    const t = todos.find(t => t.id === actionEl.dataset.id);
    if (t) {
      if (!t.collapsed) closeSubtaskAddRow(document.getElementById(`sub-add-${t.id}`), { clear: true });
      toggleTodoCollapse(t);
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
  if (e.target.dataset.action !== 'sub-input') return;
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    submitSubtaskAddRow(e.target.closest('.subtask-add-row'));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeSubtaskAddRow(e.target.closest('.subtask-add-row'), { clear: true });
  }
});

// 点击空白处关闭所有子任务输入行
document.addEventListener('click', (e) => {
  if (!e.target.closest('.subtask-add-row')) {
    closeAllSubtaskAddRows();
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

newTaskCategorySelect.addEventListener('change', syncComposerCategory);
completedToggle.addEventListener('click', () => setCompletedExpanded(!completedExpanded, { persist: true }));
clearBtn.addEventListener('click', clearCompleted);

allTasksNav.addEventListener('click', () => setActiveCategory(ALL_CATEGORY_ID));
document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryDialog());

categoryList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton?.dataset.action === 'edit-category') {
    openCategoryDialog(getCategoryById(actionButton.dataset.categoryId));
    return;
  }
  if (actionButton?.dataset.action === 'bulk-organize') {
    openBulkOrganizeDialog();
    return;
  }
  const categoryButton = event.target.closest('[data-category-id]');
  if (categoryButton) setActiveCategory(categoryButton.dataset.categoryId);
});

categoryList.addEventListener('dragstart', (event) => {
  const row = event.target.closest('[data-category-row-id]');
  if (!row || draggedId) return;
  draggedCategoryId = row.dataset.categoryRowId;
  row.classList.add('dragging-category');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedCategoryId);
});

categoryList.addEventListener('dragover', (event) => {
  const row = event.target.closest('[data-drop-category-id]');
  if (!row) return;
  if (draggedId || draggedCategoryId) event.preventDefault();
  document.querySelectorAll('.category-drop-target').forEach(element => element.classList.remove('category-drop-target'));
  if (draggedId || (draggedCategoryId && row.dataset.categoryRowId)) row.classList.add('category-drop-target');
});

categoryList.addEventListener('drop', async (event) => {
  const row = event.target.closest('[data-drop-category-id]');
  if (!row) return;
  event.preventDefault();

  if (draggedId) {
    const targetId = row.dataset.dropCategoryId === UNASSIGNED_CATEGORY_ID
      ? null
      : row.dataset.dropCategoryId;
    await moveTodoToCategory(draggedId, targetId);
    return;
  }

  if (!draggedCategoryId || !row.dataset.categoryRowId || draggedCategoryId === row.dataset.categoryRowId) return;
  const fromIndex = categories.findIndex(category => category.id === draggedCategoryId);
  const toIndex = categories.findIndex(category => category.id === row.dataset.categoryRowId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = categories.splice(fromIndex, 1);
  categories.splice(toIndex, 0, moved);
  renderCategoryNavigation();
  try {
    await saveCategoryPositions();
  } catch (error) {
    await restoreCloudState(error);
  }
});

categoryList.addEventListener('dragend', () => {
  draggedCategoryId = null;
  document.querySelectorAll('.dragging-category, .category-drop-target').forEach(element => {
    element.classList.remove('dragging-category', 'category-drop-target');
  });
});

sidebarToggle.addEventListener('click', () => setSidebarCollapsed(!sidebarCollapsed, { persist: true }));
mobileSidebarToggle.addEventListener('click', () => {
  if (appRoot.classList.contains('mobile-sidebar-open')) closeMobileSidebar();
  else openMobileSidebar();
});
sidebarScrim.addEventListener('click', closeMobileSidebar);
settingsBtn.addEventListener('click', showSettings);
settingsCloseBtn.addEventListener('click', showTaskWorkspace);

showSidebarTimeSetting.addEventListener('change', () => setSidebarTimeVisible(showSidebarTimeSetting.checked, { persist: true }));
showQuoteSetting.addEventListener('change', () => setSidebarQuoteVisible(showQuoteSetting.checked, { persist: true }));
showTaskTimesSetting.addEventListener('change', () => setTimeVisibility(showTaskTimesSetting.checked, { persist: true }));

document.getElementById('categoryForm').addEventListener('submit', submitCategoryForm);
document.getElementById('deleteCategoryBtn').addEventListener('click', deleteCurrentCategory);
document.getElementById('moveForm').addEventListener('submit', submitMoveForm);
document.getElementById('bulkOrganizeForm').addEventListener('submit', submitBulkOrganize);
document.querySelectorAll('[data-dialog-close]').forEach(button => {
  button.addEventListener('click', () => closeDialog(button.dataset.dialogClose));
});
document.getElementById('undoMoveBtn').addEventListener('click', async () => {
  const undo = lastMoveUndo;
  document.getElementById('appToast').hidden = true;
  lastMoveUndo = null;
  if (undo) await undo();
});

// ============================================================
// 侧边栏小部件
// ============================================================

function updateDateTime() {
  const now = new Date();
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

  document.getElementById('dateDisplay').textContent =
    `${now.getFullYear()}年${months[now.getMonth()]}${now.getDate()}日`;
  document.getElementById('timeDisplay').textContent =
    now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
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

document.getElementById('refreshQuoteBtn').addEventListener('click', () => {
  const quoteElement = document.getElementById('quoteText');
  const availableQuotes = quotes.filter(quote => quote !== quoteElement.textContent);
  quoteElement.textContent = availableQuotes[Math.floor(Math.random() * availableQuotes.length)] || quotes[0];
});

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

    if (event === 'INSERT' && item.parentId) {
      const affectedTodoIds = upsertTodoItem(item);
      const parent = todos.find(todo => todo.id === item.parentId);
      if (!affectedTodoIds || !parent) {
        scheduleRealtimeRefresh();
        return;
      }
      syncInsertedSubtaskDom(parent, item);
      return;
    }

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
      await Promise.all([loadCategories(), loadTodos()]);
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
  const millisecondsUntilNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    updateDateTime();
    setInterval(updateDateTime, 60000);
  }, millisecondsUntilNextMinute);
  initTheme();
}

async function startTodoApp(user) {
  if (!user || activeUserId === user.id) return;

  stopTodoApp();
  const sessionVersion = ++appSessionVersion;
  activeUserId = user.id;
  setCurrentUser(user);
  setTimeVisibility(getSavedTimeVisibility(user.id));
  setSidebarCollapsed(getSavedBoolean(SIDEBAR_COLLAPSED_STORAGE_PREFIX, user.id, false));
  setCompletedExpanded(getSavedBoolean(COMPLETED_EXPANDED_STORAGE_PREFIX, user.id, false));
  setSidebarTimeVisible(getSavedBoolean(SIDEBAR_TIME_STORAGE_PREFIX, user.id, true));
  setSidebarQuoteVisible(getSavedBoolean(QUOTE_VISIBLE_STORAGE_PREFIX, user.id, true));
  activeCategoryId = ALL_CATEGORY_ID;

  activeList.innerHTML = '<li class="empty-state"><p>正在从云端加载...</p></li>';
  completedSection.hidden = true;
  try {
    await Promise.all([loadCategories(), loadTodos()]);
    if (sessionVersion !== appSessionVersion || activeUserId !== user.id) return;
    openDescriptions = loadOpenDescriptions(todos);
    render();
    [todoChannel, categoryChannel] = await Promise.all([
      subscribeTodoChanges(user.id, handleRealtimeTodoChange),
      subscribeCategoryChanges(user.id, scheduleRealtimeRefresh),
    ]);
  } catch (error) {
    if (sessionVersion !== appSessionVersion) return;
    showCloudError(error);
    activeList.innerHTML = '<li class="empty-state"><p>云端数据加载失败，请先执行最新的数据库建表语句。</p></li>';
  }
}

function stopTodoApp() {
  appSessionVersion += 1;
  activeUserId = null;
  clearTimeout(realtimeRefreshTimer);
  pendingRealtimeEchoes.clear();
  pendingDescriptionSaves.clear();
  pendingCollapseUpdates.clear();
  recentLocalCreates.clear();
  recentLocalDeletes.clear();
  unsubscribeTodoChanges(todoChannel);
  unsubscribeCategoryChanges(categoryChannel);
  todoChannel = null;
  categoryChannel = null;
  setCurrentUser(null);
  openDescriptions = new Set();
  setTimeVisibility(false);
  setSidebarCollapsed(false);
  setCompletedExpanded(false);
  setSidebarTimeVisible(true);
  setSidebarQuoteVisible(true);
  activeCategoryId = ALL_CATEGORY_ID;
}

window.addEventListener('beforeunload', () => {
  unsubscribeTodoChanges(todoChannel);
  unsubscribeCategoryChanges(categoryChannel);
});
initAppShell();
