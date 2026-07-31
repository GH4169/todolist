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
const workspaceLabel = document.getElementById('workspaceLabel');
const workspaceSummary = document.getElementById('workspaceSummary');
const activeTaskCount = document.getElementById('activeTaskCount');
const completedTaskCount = document.getElementById('completedTaskCount');
const todayTaskCount = document.getElementById('todayTaskCount');
const tomorrowTaskCount = document.getElementById('tomorrowTaskCount');
const categoryList = document.getElementById('categoryList');
const todayTasksNav = document.getElementById('todayTasksNav');
const tomorrowTasksNav = document.getElementById('tomorrowTasksNav');
const newTaskCategorySelect = document.getElementById('newTaskCategorySelect');
const composerCategory = document.getElementById('composerCategory');
const composerGoalRow = document.getElementById('composerGoalRow');
const completionGoalInput = document.getElementById('completionGoalInput');
const completionGoalInputLabel = document.getElementById('completionGoalInputLabel');
const appRoot = document.getElementById('appView');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
const sidebarScrim = document.getElementById('sidebarScrim');
const taskWorkspace = document.getElementById('taskWorkspace');
const settingsView = document.getElementById('settingsView');
const settingsBtn = document.getElementById('settingsBtn');
const accountMenuToggle = document.getElementById('accountMenuButton');
const accountMenuPanel = document.getElementById('accountMenu');
const sidebarProfileArea = document.getElementById('sidebarProfile');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const showSidebarTimeSetting = document.getElementById('showSidebarTimeSetting');
const showQuoteSetting = document.getElementById('showQuoteSetting');
const showTaskTimesSetting = document.getElementById('showTaskTimesSetting');
const categoryContextMenu = document.getElementById('categoryContextMenu');
const datePlanMenu = document.getElementById('datePlanMenu');
const deleteCategoryDialog = document.getElementById('deleteCategoryDialog');
const todayCarryover = document.getElementById('todayCarryover');
const todayCarryoverList = document.getElementById('todayCarryoverList');
const carryAllToTodayBtn = document.getElementById('carryAllToTodayBtn');
const completionGoalDialog = document.getElementById('completionGoalDialog');
const completionGoalForm = document.getElementById('completionGoalForm');
const completionGoalTask = document.getElementById('completionGoalTask');
const completionGoalDate = document.getElementById('completionGoalDate');
const completionGoalContent = document.getElementById('completionGoalContent');
const completionGoalCarried = document.getElementById('completionGoalCarried');
const completionGoalCarriedLabel = document.getElementById('completionGoalCarriedLabel');
const completionGoalCarriedContent = document.getElementById('completionGoalCarriedContent');
const completionGoalHistoryToggle = document.getElementById('completionGoalHistoryToggle');
const completionGoalHistoryLabel = document.getElementById('completionGoalHistoryLabel');
const completionGoalHistory = document.getElementById('completionGoalHistory');
const completionGoalStatus = document.getElementById('completionGoalStatus');
const deleteCompletionGoalBtn = document.getElementById('deleteCompletionGoalBtn');
const saveCompletionGoalBtn = document.getElementById('saveCompletionGoalBtn');
const completionReviewDialog = document.getElementById('completionReviewDialog');
const completionReviewForm = document.getElementById('completionReviewForm');
const completionReviewTask = document.getElementById('completionReviewTask');
const completionReviewDate = document.getElementById('completionReviewDate');
const completionReviewGoalContent = document.getElementById('completionReviewGoalContent');
const completionReviewContent = document.getElementById('completionReviewContent');
const completionReviewContentCount = document.getElementById('completionReviewContentCount');
const completionReviewHistoryToggle = document.getElementById('completionReviewHistoryToggle');
const completionReviewHistoryLabel = document.getElementById('completionReviewHistoryLabel');
const completionReviewHistory = document.getElementById('completionReviewHistory');
const completionReviewStatus = document.getElementById('completionReviewStatus');
const deleteCompletionReviewBtn = document.getElementById('deleteCompletionReviewBtn');
const saveCompletionReviewBtn = document.getElementById('saveCompletionReviewBtn');

const circumference = 2 * Math.PI * 60;
const TIME_VISIBILITY_STORAGE_PREFIX = 'geek-todos-show-times:';
const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'geek-todos-sidebar-collapsed:';
const COMPLETED_EXPANDED_STORAGE_PREFIX = 'geek-todos-completed-expanded:';
const COMPLETED_SUBTASKS_EXPANDED_STORAGE_PREFIX = 'geek-todos-completed-subtasks-expanded:';
const SIDEBAR_TIME_STORAGE_PREFIX = 'geek-todos-sidebar-time:';
const QUOTE_VISIBLE_STORAGE_PREFIX = 'geek-todos-quote-visible:';
const ACTIVE_CATEGORY_STORAGE_PREFIX = 'geek-todos-active-category:';
const EXPANDED_CATEGORIES_STORAGE_PREFIX = 'geek-todos-expanded-categories:';
const PLANNED_COMPOSER_CATEGORY_STORAGE_PREFIX = 'geek-todos-today-composer-category:';
const TODAY_CATEGORY_ID = 'today';
const TOMORROW_CATEGORY_ID = 'tomorrow';
const UNASSIGNED_CATEGORY_ID = 'unassigned';
let activeCategoryId = TODAY_CATEGORY_ID;
let plannedComposerCategoryId = null;
let expandedCategoryIds = new Set();
let expandedCompletedSubtaskTodoIds = new Set();
let showTaskTimes = false;
let completedExpanded = false;
let sidebarCollapsed = false;
let showSidebarTime = true;
let showSidebarQuote = true;
let lastMoveUndo = null;
let toastTimer = null;
let contextMenuCategoryId = null;
let contextMenuReturnFocus = null;
let datePlanItemId = null;
let datePlanReturnFocus = null;
let currentLocalDateKey = getLocalDateKey();

// 记录展开的描述区域 key: "todoId" 或 "todoId:subId"
let openDescriptions = new Set();
let todoChannel = null;
let categoryChannel = null;
let completionGoalChannel = null;
let completionReviewChannel = null;
let realtimeRefreshTimer = null;
const pendingRealtimeEchoes = new Map();
const pendingDescriptionSaves = new Map();
const pendingCollapseUpdates = new Map();
const pendingCompletedSubtaskMoves = new Map();
const recentLocalCreates = new Map();
const recentLocalDeletes = new Map();
let activeUserId = null;
let appSessionVersion = 0;
let completionGoalTodoId = null;
let completionGoalEditingId = null;
let completionGoalReturnFocus = null;
let completionGoalHistoryLimit = 5;
let completionReviewTodoId = null;
let completionReviewEditingId = null;
let completionReviewReturnFocus = null;
let completionReviewHistoryLimit = 5;

const COMPLETION_REVIEW_RESULTS = {
  achieved: { label: '已达成', className: 'is-achieved' },
  partial: { label: '部分达成', className: 'is-partial' },
  missed: { label: '未达成', className: 'is-missed' },
};

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

function getSavedString(prefix, userId, fallback = null) {
  if (!userId) return fallback;
  try {
    return localStorage.getItem(`${prefix}${userId}`) ?? fallback;
  } catch (error) {
    console.warn('读取界面偏好失败:', error);
    return fallback;
  }
}

function saveString(prefix, value) {
  if (!activeUserId) return;
  try {
    localStorage.setItem(`${prefix}${activeUserId}`, value);
  } catch (error) {
    console.warn('保存界面偏好失败:', error);
  }
}

function saveActiveCategory() {
  saveString(ACTIVE_CATEGORY_STORAGE_PREFIX, activeCategoryId);
}

function savePlannedComposerCategory() {
  saveString(PLANNED_COMPOSER_CATEGORY_STORAGE_PREFIX, plannedComposerCategoryId || '');
}

function restorePlannedComposerCategory(userId) {
  const savedCategoryId = getSavedString(PLANNED_COMPOSER_CATEGORY_STORAGE_PREFIX, userId, '');
  plannedComposerCategoryId = savedCategoryId && getCategoryById(savedCategoryId)
    ? savedCategoryId
    : null;
  if (savedCategoryId && !plannedComposerCategoryId) savePlannedComposerCategory();
}

function saveExpandedCategories() {
  saveString(EXPANDED_CATEGORIES_STORAGE_PREFIX, JSON.stringify([...expandedCategoryIds]));
}

function loadExpandedCategories(userId) {
  const saved = getSavedString(EXPANDED_CATEGORIES_STORAGE_PREFIX, userId);
  if (saved === null) return null;
  try {
    const ids = JSON.parse(saved);
    return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
  } catch (error) {
    console.warn('读取分组展开状态失败:', error);
    return new Set();
  }
}

function isValidCategoryId(categoryId) {
  if (categoryId === TODAY_CATEGORY_ID || categoryId === TOMORROW_CATEGORY_ID) return true;
  if (categoryId === UNASSIGNED_CATEGORY_ID) return todos.some(todo => !todo.categoryId);
  return Boolean(getCategoryById(categoryId));
}

function restoreCategoryNavigationState(userId) {
  const savedCategoryId = getSavedString(ACTIVE_CATEGORY_STORAGE_PREFIX, userId, TODAY_CATEGORY_ID);
  activeCategoryId = isValidCategoryId(savedCategoryId) ? savedCategoryId : TODAY_CATEGORY_ID;

  const savedExpandedIds = loadExpandedCategories(userId);
  expandedCategoryIds = savedExpandedIds ?? new Set(
    isPlannedDateView() ? [] : [activeCategoryId]
  );
  expandedCategoryIds = new Set([...expandedCategoryIds].filter(id => (
    id === UNASSIGNED_CATEGORY_ID
      ? todos.some(todo => !todo.categoryId)
      : Boolean(getCategoryById(id))
  )));
  saveActiveCategory();
  saveExpandedCategories();
}

function saveExpandedCompletedSubtasks() {
  saveString(
    COMPLETED_SUBTASKS_EXPANDED_STORAGE_PREFIX,
    JSON.stringify([...expandedCompletedSubtaskTodoIds])
  );
}

function restoreExpandedCompletedSubtasks(userId) {
  const saved = getSavedString(COMPLETED_SUBTASKS_EXPANDED_STORAGE_PREFIX, userId);
  if (saved === null) {
    expandedCompletedSubtaskTodoIds = new Set();
    return;
  }

  try {
    const ids = JSON.parse(saved);
    expandedCompletedSubtaskTodoIds = new Set(
      Array.isArray(ids)
        ? ids.filter(id => typeof id === 'string' && todos.some(todo => todo.id === id))
        : []
    );
  } catch (error) {
    console.warn('读取已完成子任务展开状态失败:', error);
    expandedCompletedSubtaskTodoIds = new Set();
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
  if (sidebarCollapsed) setAccountMenuOpen(false);
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

function setCompletedSubtasksExpanded(todoId, expanded, { persist = true } = {}) {
  const todo = todos.find(item => item.id === todoId);
  if (!todo) return;

  const isExpanded = Boolean(expanded);
  if (isExpanded) expandedCompletedSubtaskTodoIds.add(todoId);
  else expandedCompletedSubtaskTodoIds.delete(todoId);

  const todoElement = getTodoElement(todoId);
  const group = todoElement?.querySelector('.completed-subtasks');
  const button = group?.querySelector('.completed-subtasks-toggle');
  const completedSubtaskList = group?.querySelector('.completed-subtask-list');
  const completedCount = todo.subtasks.filter(subtask => subtask.done).length;
  const actionLabel = isExpanded ? '折叠' : '展开';

  group?.classList.toggle('expanded', isExpanded);
  if (completedSubtaskList) completedSubtaskList.hidden = !isExpanded;
  if (button) {
    button.setAttribute('aria-expanded', String(isExpanded));
    button.setAttribute('aria-label', `${actionLabel}已完成子任务，共 ${completedCount} 项`);
    button.title = `${actionLabel}已完成子任务`;
  }

  if (persist) saveExpandedCompletedSubtasks();
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

function getLocalDateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getRelativeLocalDate(offset = 0, baseDate = new Date()) {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + offset,
    12
  );
}

function formatDateHeading(date) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatGoalDate(dateKey) {
  if (!dateKey) return '';
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}月${day}日`;
}

function sortCompletionGoals(goals = []) {
  return [...goals].sort((a, b) => (
    b.targetDate.localeCompare(a.targetDate)
    || (b.updatedAt || 0) - (a.updatedAt || 0)
  ));
}

function getGoalProjection(item, contextDate = null) {
  const goals = sortCompletionGoals(item.completionGoals);
  if (!contextDate) {
    return goals[0] ? { goal: goals[0], state: 'latest' } : { goal: null, state: 'missing' };
  }

  const exact = goals.find(goal => goal.targetDate === contextDate);
  if (exact) return { goal: exact, state: 'exact' };
  const previous = goals.find(goal => goal.targetDate < contextDate);
  return previous ? { goal: previous, state: 'carried' } : { goal: null, state: 'missing' };
}

function getCompletionGoalForDate(item, targetDate) {
  return item.completionGoals?.find(goal => goal.targetDate === targetDate) || null;
}

function upsertCompletionGoalInMemory(goal) {
  const state = findTodoItem(goal.todoId);
  if (!state) return false;
  const goals = state.item.completionGoals || (state.item.completionGoals = []);
  const existingIndex = goals.findIndex(item => item.id === goal.id);
  if (existingIndex === -1) goals.push(goal);
  else goals[existingIndex] = goal;
  goals.sort((a, b) => b.targetDate.localeCompare(a.targetDate));
  return true;
}

function removeCompletionGoalFromMemory(goalId, todoId = null) {
  const state = todoId ? findTodoItem(todoId) : null;
  const candidates = state ? [state.item] : getTaskEntries().map(entry => entry.item);
  for (const item of candidates) {
    const index = item.completionGoals?.findIndex(goal => goal.id === goalId) ?? -1;
    if (index !== -1) {
      item.completionGoals.splice(index, 1);
      return true;
    }
  }
  return false;
}

function sortCompletionReviews(reviews = []) {
  return [...reviews].sort((a, b) => (
    b.reviewDate.localeCompare(a.reviewDate)
    || (b.updatedAt || 0) - (a.updatedAt || 0)
  ));
}

function getCompletionReviewForDate(item, reviewDate) {
  return item.completionReviews?.find(review => review.reviewDate === reviewDate) || null;
}

function getCompletionReviewResultConfig(result) {
  const config = COMPLETION_REVIEW_RESULTS[result];
  if (config) return config;
  console.error('未知的完成评价结果:', result);
  return { label: '未知结果', className: 'is-unknown' };
}

function upsertCompletionReviewInMemory(review) {
  const state = findTodoItem(review.todoId);
  if (!state) return false;
  const reviews = state.item.completionReviews || (state.item.completionReviews = []);
  const existingIndex = reviews.findIndex(item => item.id === review.id);
  if (existingIndex === -1) reviews.push(review);
  else reviews[existingIndex] = review;
  reviews.sort((a, b) => (
    b.reviewDate.localeCompare(a.reviewDate)
    || (b.updatedAt || 0) - (a.updatedAt || 0)
  ));
  return true;
}

function removeCompletionReviewFromMemory(reviewId, todoId = null) {
  const state = todoId ? findTodoItem(todoId) : null;
  const candidates = state ? [state.item] : getTaskEntries().map(entry => entry.item);
  for (const item of candidates) {
    const index = item.completionReviews?.findIndex(review => review.id === reviewId) ?? -1;
    if (index !== -1) {
      item.completionReviews.splice(index, 1);
      return true;
    }
  }
  return false;
}

function getPlannedViewConfig(categoryId = activeCategoryId, baseDate = new Date()) {
  const configs = {
    [TODAY_CATEGORY_ID]: {
      offset: 0,
      title: '今日待办',
      relativeLabel: '今天',
      emptyTitle: '今天还没有安排',
      clearedTitle: '今日进行中已经清空',
      emptyHint: '先安排一件最重要的事',
    },
    [TOMORROW_CATEGORY_ID]: {
      offset: 1,
      title: '明日待办',
      relativeLabel: '明天',
      emptyTitle: '明天还没有安排',
      clearedTitle: '明日进行中已经清空',
      emptyHint: '给明天留下一件重要的事',
    },
  };
  const config = configs[categoryId];
  if (!config) return null;
  const date = getRelativeLocalDate(config.offset, baseDate);
  return { ...config, categoryId, date, dateKey: getLocalDateKey(date) };
}

function getTaskEntries() {
  return todos.flatMap(todo => [
    { todo, item: todo, isSubtask: false },
    ...todo.subtasks.map(item => ({ todo, item, isSubtask: true })),
  ]);
}

function getPlannedEntries(dateKey) {
  if (!dateKey) return [];
  return getTaskEntries().filter(({ item }) => item.plannedDate === dateKey);
}

function getTodayEntries() {
  return getPlannedEntries(getPlannedViewConfig(TODAY_CATEGORY_ID).dateKey);
}

function getTomorrowEntries() {
  return getPlannedEntries(getPlannedViewConfig(TOMORROW_CATEGORY_ID).dateKey);
}

function getActivePlannedEntries() {
  return getPlannedEntries(getPlannedViewConfig()?.dateKey);
}

function getCarryoverEntries() {
  const today = getLocalDateKey();
  return getTaskEntries().filter(({ item }) => (
    !item.done && item.plannedDate && item.plannedDate < today
  ));
}

function isTodayView() {
  return activeCategoryId === TODAY_CATEGORY_ID;
}

function isTomorrowView() {
  return activeCategoryId === TOMORROW_CATEGORY_ID;
}

function isPlannedDateView() {
  return Boolean(getPlannedViewConfig());
}

function matchesCategory(todo, categoryId = activeCategoryId) {
  const plannedView = getPlannedViewConfig(categoryId);
  if (plannedView) {
    return todo.plannedDate === plannedView.dateKey
      || todo.subtasks.some(item => item.plannedDate === plannedView.dateKey);
  }
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
  if (plannedComposerCategoryId && !getCategoryById(plannedComposerCategoryId)) {
    plannedComposerCategoryId = null;
    savePlannedComposerCategory();
  }
  const composerValue = isPlannedDateView()
    ? plannedComposerCategoryId
    : newTaskCategorySelect.value;
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
  const isCrossCategoryView = isPlannedDateView();
  composerCategory.hidden = !isCrossCategoryView;
  composerGoalRow.hidden = !isCrossCategoryView;
  if (isCrossCategoryView && !newTaskCategorySelect.value) newTaskCategorySelect.value = '';

  const targetName = isCrossCategoryView
    ? getCategoryName(newTaskCategorySelect.value || null)
    : (activeCategoryId === UNASSIGNED_CATEGORY_ID ? '未分组' : getCategoryName(activeCategoryId));
  const plannedView = getPlannedViewConfig();
  input.placeholder = plannedView
    ? `添加到「${targetName}」并安排${plannedView.relativeLabel}`
    : `添加到「${targetName}」`;
  if (plannedView) {
    const dayLabel = isTomorrowView() ? '明日' : '今日';
    completionGoalInputLabel.textContent = `${dayLabel}完成目标`;
    completionGoalInput.placeholder = `${plannedView.relativeLabel}至少推进到哪里？（可选）`;
  }
}

function setActiveCategory(categoryId) {
  const validId = categoryId === TODAY_CATEGORY_ID
    || categoryId === TOMORROW_CATEGORY_ID
    || categoryId === UNASSIGNED_CATEGORY_ID
    || Boolean(getCategoryById(categoryId));
  activeCategoryId = validId ? categoryId : TODAY_CATEGORY_ID;
  closeDatePlanMenu();
  saveActiveCategory();
  taskWorkspace.hidden = false;
  settingsView.hidden = true;
  settingsBtn.classList.remove('active');
  closeMobileSidebar();
  render();
}

function getActiveCategoryTodos(categoryId) {
  return todos.filter(todo => (
    !todo.done && (
      categoryId === UNASSIGNED_CATEGORY_ID
        ? !todo.categoryId
        : todo.categoryId === categoryId
    )
  ));
}

function renderCategoryTaskTree(categoryId, categoryTodos, expanded) {
  if (categoryTodos.length === 0) return '';
  return `
    <ul class="category-task-tree" id="category-tasks-${categoryId}" ${expanded ? '' : 'hidden'}>
      ${categoryTodos.map(todo => `
        <li>
          <button class="category-task-link ${todo.done ? 'done' : ''}" type="button" data-category-task-id="${todo.id}" data-category-id="${categoryId}" title="${escapeHtml(todo.text)}">
            <span class="category-task-status" aria-hidden="true"></span>
            <span>${escapeHtml(todo.text)}</span>
          </button>
        </li>`).join('')}
    </ul>`;
}

function renderCategoryNode({ id, name, isSystem = false }) {
  const categoryTodos = getActiveCategoryTodos(id);
  const count = categoryTodos.length;
  const isActive = activeCategoryId === id;
  const expanded = count > 0 && expandedCategoryIds.has(id);
  const toggleLabel = `${expanded ? '折叠' : '展开'}「${name}」中的父任务`;
  const folderIcon = expanded
    ? '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'
    : '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
  const rowId = isSystem ? '' : ` data-category-row-id="${id}"`;
  const dragAttributes = isSystem ? '' : ` draggable="true" data-category-drag-id="${id}"`;
  const action = isSystem
    ? `<button class="category-row-action organize-category-btn" type="button" data-action="bulk-organize" title="批量整理未分组任务" aria-label="批量整理未分组任务">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg>
      </button>`
    : `<button class="category-row-action category-menu-trigger" type="button" data-action="open-category-menu" data-category-id="${id}" title="打开「${escapeHtml(name)}」分组菜单" aria-label="打开「${escapeHtml(name)}」分组菜单" aria-haspopup="menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </button>`;

  return `
    <li class="category-node ${isSystem ? 'system-category-node' : ''} ${isActive ? 'active' : ''} ${expanded ? 'expanded' : ''}"${rowId} data-drop-category-id="${id}">
      <div class="category-row"${dragAttributes}>
        <button class="category-expand-toggle" type="button" data-action="toggle-category-tree" data-category-id="${id}" title="${escapeHtml(toggleLabel)}" aria-label="${escapeHtml(toggleLabel)}" aria-expanded="${expanded}" ${count > 0 ? `aria-controls="category-tasks-${id}"` : 'disabled'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">${folderIcon}</svg>
        </button>
        <button class="group-nav-item ${isActive ? 'active' : ''}" type="button" data-category-id="${id}" ${isActive ? 'aria-current="page"' : ''}>
          <span class="${isSystem ? '' : 'category-name'}">${escapeHtml(name)}</span>
          <b>${count}</b>
        </button>
        ${action}
      </div>
      ${renderCategoryTaskTree(id, categoryTodos, expanded)}
    </li>`;
}

function renderCategoryNavigation() {
  const unassignedCount = todos.filter(todo => !todo.categoryId).length;
  const unassignedRow = unassignedCount > 0
    ? renderCategoryNode({
      id: UNASSIGNED_CATEGORY_ID,
      name: '未分组',
      isSystem: true,
    })
    : '';

  const customRows = categories.map(category => {
    return renderCategoryNode({
      id: category.id,
      name: category.name,
    });
  }).join('');

  categoryList.innerHTML = unassignedRow + customRows;
  todayTasksNav.classList.toggle('active', activeCategoryId === TODAY_CATEGORY_ID);
  todayTasksNav.toggleAttribute('aria-current', activeCategoryId === TODAY_CATEGORY_ID);
  tomorrowTasksNav.classList.toggle('active', activeCategoryId === TOMORROW_CATEGORY_ID);
  tomorrowTasksNav.toggleAttribute('aria-current', activeCategoryId === TOMORROW_CATEGORY_ID);
  todayTaskCount.textContent = getTodayEntries().filter(({ item }) => !item.done).length;
  tomorrowTaskCount.textContent = getTomorrowEntries().filter(({ item }) => !item.done).length;
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
      const goals = existing.completionGoals || [];
      const reviews = existing.completionReviews || [];
      Object.assign(existing, incoming, { subtasks, completionGoals: goals, completionReviews: reviews });
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
  if (existing) {
    const goals = existing.completionGoals || [];
    const reviews = existing.completionReviews || [];
    Object.assign(existing, incoming, { subtasks: [], completionGoals: goals, completionReviews: reviews });
  }
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
    if (expandedCompletedSubtaskTodoIds.delete(id)) saveExpandedCompletedSubtasks();
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

function syncSubtaskRowCompletionDom(todoElement, subtask) {
  const subtaskElement = [...todoElement.querySelectorAll('.subtask-item')]
    .find(element => element.dataset.id === subtask.id);
  if (!subtaskElement) return null;

  subtaskElement.classList.toggle('done', subtask.done);
  const checkbox = subtaskElement.querySelector('.subtask-checkbox');
  if (checkbox) {
    checkbox.setAttribute('aria-pressed', String(subtask.done));
    checkbox.setAttribute('aria-label', subtask.done ? '标记为未完成' : '标记为已完成');
  }
  const timeElement = subtaskElement.querySelector('.subtask-time');
  if (timeElement) timeElement.innerHTML = renderSubtaskTimeContentHtml(subtask);
  return subtaskElement;
}

function syncSubtaskCompletionDom(todo, subtask) {
  const todoElement = syncTodoCompletionDom(todo);
  if (todoElement) {
    syncSubtaskRowCompletionDom(todoElement, subtask);
    syncSubtaskProgressDom(todo, todoElement);
  }
  updateListSummary();
}

function cancelPendingCompletedSubtaskMove(subtaskId) {
  const timer = pendingCompletedSubtaskMoves.get(subtaskId);
  if (!timer) return;
  clearTimeout(timer);
  pendingCompletedSubtaskMoves.delete(subtaskId);
}

function previewCompletedSubtaskMove(todo, subtask) {
  const todoElement = getTodoElement(todo.id);
  if (!todoElement) {
    render();
    return;
  }

  const subtaskElement = syncSubtaskRowCompletionDom(todoElement, subtask);
  subtaskElement?.classList.add('completion-settling');
  syncSubtaskProgressDom(todo, todoElement);
  updateListSummary();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render();
    return;
  }

  const timer = setTimeout(() => {
    pendingCompletedSubtaskMoves.delete(subtask.id);
    const currentTodo = todos.find(item => item.id === todo.id);
    const currentSubtask = currentTodo?.subtasks.find(item => item.id === subtask.id);
    if (currentTodo && currentSubtask?.done) render();
  }, 480);
  pendingCompletedSubtaskMoves.set(subtask.id, timer);
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
  const plannedView = getPlannedViewConfig();
  const goalContent = plannedView ? completionGoalInput.value.trim() : '';
  const categoryId = plannedView
    ? (newTaskCategorySelect.value || null)
    : (activeCategoryId === UNASSIGNED_CATEGORY_ID ? null : activeCategoryId);
  try {
    const todo = await createTodoRecord({
      text,
      categoryId,
      position: 0,
      plannedDate: plannedView?.dateKey || null,
    });
    rememberLocalCreate(todo.id);
    if (goalContent) {
      try {
        const goal = await upsertCompletionGoalForDate({
          todoId: todo.id,
          targetDate: plannedView.dateKey,
          content: goalContent,
        });
        todo.completionGoals = [goal];
      } catch (goalError) {
        showCloudError(goalError);
        showToast('任务已创建，完成目标保存失败，可稍后补写');
      }
    }
    const affectedTodoIds = upsertTodoItem(todo);
    input.value = '';
    completionGoalInput.value = '';
    input.focus();
    renderChangedTodos(affectedTodoIds);
    await saveParentTodoPositions(updateTodoWithRealtimeEcho);
  } catch (error) {
    await restoreCloudState(error);
  }
}

async function setTodoPlannedDate(id, plannedDate, { returnFocus = null } = {}) {
  const state = findTodoItem(id);
  if (!state) return;

  const previousPlannedDate = state.item.plannedDate;
  if (previousPlannedDate === plannedDate) return;
  state.item.plannedDate = plannedDate;
  render();

  try {
    await updateTodoWithRealtimeEcho(id, { plannedDate });
    const today = getPlannedViewConfig(TODAY_CATEGORY_ID).dateKey;
    const tomorrow = getPlannedViewConfig(TOMORROW_CATEGORY_ID).dateKey;
    const message = plannedDate === today
      ? '已安排到今天'
      : plannedDate === tomorrow
        ? '已安排到明天'
        : '已取消日期安排';
    showToast(message);
    if (plannedDate && !getCompletionGoalForDate(state.item, plannedDate)) {
      openCompletionGoalDialog(id, {
        targetDate: plannedDate,
        returnFocus,
      });
    }
  } catch (error) {
    if (state.item.plannedDate === plannedDate) state.item.plannedDate = previousPlannedDate;
    render();
    showCloudError(error);
  }
}

async function moveEntriesToToday(entries) {
  if (entries.length === 0) return;
  const today = getLocalDateKey();
  entries.forEach(({ item }) => { item.plannedDate = today; });
  render();

  try {
    await Promise.all(entries.map(({ item }) => (
      updateTodoWithRealtimeEcho(item.id, { plannedDate: today })
    )));
    showToast(entries.length === 1 ? '已移到今日待办' : `已将 ${entries.length} 项移到今天`);
    const missingGoals = entries.filter(({ item }) => !getCompletionGoalForDate(item, today));
    if (entries.length === 1 && missingGoals.length === 1) {
      openCompletionGoalDialog(missingGoals[0].item.id, { targetDate: today });
    } else if (missingGoals.length > 0) {
      showToast(`已移到今天，其中 ${missingGoals.length} 项待补今日完成目标`);
    }
  } catch (error) {
    await restoreCloudState(error);
  }
}

async function moveCarryoverItemToToday(id) {
  const state = findTodoItem(id);
  if (!state || state.item.done || !state.item.plannedDate) return;
  await moveEntriesToToday([{ todo: state.todo, item: state.item, isSubtask: Boolean(state.item.parentId) }]);
}

async function clearPlannedDateCompleted() {
  const plannedView = getPlannedViewConfig();
  if (!plannedView) return;
  const completedEntries = getActivePlannedEntries().filter(({ item }) => item.done);
  if (completedEntries.length === 0) return;

  completedEntries.forEach(({ item }) => { item.plannedDate = null; });
  render();
  try {
    await Promise.all(completedEntries.map(({ item }) => (
      updateTodoWithRealtimeEcho(item.id, { plannedDate: null })
    )));
    showToast(`已从${plannedView.title}收起 ${completedEntries.length} 项已完成任务`);
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
    cancelPendingCompletedSubtaskMove(subId);
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
    const shouldPreviewMove = done
      && !previousParentDone
      && !parentDone
      && !isPlannedDateView();
    if (shouldPreviewMove) previewCompletedSubtaskMove(t, sub);
    else syncSubtaskCompletionDom(t, sub);

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
        cancelPendingCompletedSubtaskMove(subId);
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
  cancelPendingCompletedSubtaskMove(subId);
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
  if (isPlannedDateView()) {
    await clearPlannedDateCompleted();
    return;
  }
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
  if (isPlannedDateView()) {
    const entries = getActivePlannedEntries();
    const completedCount = entries.filter(({ item }) => item.done).length;
    const percent = entries.length > 0 ? Math.round((completedCount / entries.length) * 100) : 0;
    progressCircle.style.strokeDashoffset = entries.length > 0
      ? circumference - (completedCount / entries.length) * circumference
      : circumference;
    percentText.textContent = `${percent}%`;
    return;
  }

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
  if (isPlannedDateView()) {
    const entries = getActivePlannedEntries();
    const done = entries.filter(({ item }) => item.done).length;
    workspaceSummary.textContent = `${entries.length - done} 项进行中 · ${done} 项已完成`;
    return;
  }

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
  const plannedView = getPlannedViewConfig();
  if (plannedView) {
    const hasPlannedEntries = getActivePlannedEntries().length > 0;
    return `
      <li class="empty-state today-empty-state">
        <div class="empty-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="10" width="32" height="30" rx="5"/><path d="M16 7v7M32 7v7M8 19h32"/><path class="empty-accent" d="m17 29 5 5 10-11"/></svg></div>
        <h3>${hasPlannedEntries ? plannedView.clearedTitle : plannedView.emptyTitle}</h3>
        <p>${hasPlannedEntries ? '已完成事项收在下方' : plannedView.emptyHint}</p>
      </li>`;
  }

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

function renderDatePlanButton(item, { subtask = false } = {}) {
  const today = getPlannedViewConfig(TODAY_CATEGORY_ID).dateKey;
  const tomorrow = getPlannedViewConfig(TOMORROW_CATEGORY_ID).dateKey;
  const isToday = item.plannedDate === today;
  const isTomorrow = item.plannedDate === tomorrow;
  const isScheduled = Boolean(item.plannedDate);
  const label = isToday
    ? '安排日期：今天'
    : isTomorrow
      ? '安排日期：明天'
      : isScheduled
        ? `安排日期：${item.plannedDate}`
        : '安排日期';
  const stateIcon = isToday
    ? '<path class="today-check" d="m8.5 15 2 2 4-4"/>'
    : isTomorrow
      ? '<path class="tomorrow-arrow" d="M8 15h8M13 12l3 3-3 3"/>'
      : '<path class="date-plus" d="M12 13v6M9 16h6"/>';
  const stateClass = isToday ? 'is-today' : isTomorrow ? 'is-tomorrow' : isScheduled ? 'is-scheduled' : '';
  const classes = subtask
    ? `subtask-schedule-toggle ${stateClass}`
    : `action-btn schedule-toggle ${stateClass}`;
  return `
    <button class="${classes}" type="button" data-action="open-date-menu" data-id="${item.id}" title="${label}" aria-label="${label}" aria-haspopup="menu" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>${stateIcon}</svg>
    </button>`;
}

function renderCompletionGoalBlock(item, { plannedView = getPlannedViewConfig() } = {}) {
  const contextDate = plannedView?.dateKey || null;
  const projection = getGoalProjection(item, contextDate);
  if (!plannedView && !projection.goal) return '';

  const targetDate = projection.state === 'carried'
    ? contextDate
    : (projection.goal?.targetDate || contextDate || item.plannedDate || getLocalDateKey());
  const relativeLabel = isTomorrowView() ? '明日' : '今日';
  const label = projection.state === 'exact'
    ? `${relativeLabel}完成目标`
    : projection.state === 'carried'
      ? `上次目标 · ${formatGoalDate(projection.goal.targetDate)}`
      : projection.state === 'latest'
        ? `完成目标 · ${formatGoalDate(projection.goal.targetDate)}`
        : `设定${relativeLabel}完成目标`;
  const content = projection.goal?.content || `${plannedView.relativeLabel}至少推进到哪里？`;
  const carriedAction = projection.state === 'carried'
    ? `<span class="completion-goal-update">更新${relativeLabel}目标</span>`
    : '';
  const stateClass = projection.state === 'missing' ? 'is-missing' : `is-${projection.state}`;
  const ariaLabel = projection.state === 'carried'
    ? `为“${item.text}”更新${relativeLabel}完成目标`
    : projection.goal
    ? `编辑“${item.text}”${formatGoalDate(targetDate)}的完成目标`
    : `为“${item.text}”设定${relativeLabel}完成目标`;

  return `
    <button class="completion-goal-block ${stateClass}" type="button" data-action="open-completion-goal" data-id="${item.id}" data-goal-date="${targetDate}" ${projection.goal && projection.state !== 'carried' ? `data-goal-id="${projection.goal.id}"` : ''} aria-label="${escapeHtml(ariaLabel)}">
      <span class="completion-goal-rule" aria-hidden="true"></span>
      <span class="completion-goal-copy">
        <span class="completion-goal-label">${label}</span>
        <span class="completion-goal-content">${escapeHtml(content)}</span>
      </span>
      ${carriedAction}
    </button>`;
}

function renderCompletionGoalAction(item, { subtask = false } = {}) {
  const classes = subtask ? 'subtask-goal-btn' : 'action-btn completion-goal-action';
  const targetDate = item.plannedDate || getLocalDateKey();
  return `
    <button class="${classes}" type="button" data-action="open-completion-goal" data-id="${item.id}" data-goal-date="${targetDate}" title="完成目标" aria-label="编辑完成目标">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 9h8M8 13h5"/><path d="m14 17 2 2 4-5"/></svg>
    </button>`;
}

function renderCompletionReviewBlock(item) {
  if (!isTodayView()) return '';
  const today = getLocalDateKey();
  const review = getCompletionReviewForDate(item, today);
  if (!review) {
    return `
      <button class="completion-review-block is-missing" type="button" data-action="open-completion-review" data-id="${item.id}" data-review-date="${today}" aria-label="评价“${escapeHtml(item.text)}”的今日完成情况">
        <span class="completion-review-mark" aria-hidden="true">○</span>
        <span class="completion-review-copy">
          <span class="completion-review-heading">评价今日完成情况</span>
          <span class="completion-review-content">写下实际做到哪里</span>
        </span>
      </button>`;
  }

  const resultConfig = getCompletionReviewResultConfig(review.result);
  return `
    <button class="completion-review-block ${resultConfig.className}" type="button" data-action="open-completion-review" data-id="${item.id}" data-review-date="${today}" data-review-id="${review.id}" aria-label="编辑“${escapeHtml(item.text)}”的今日完成评价：${resultConfig.label}">
      <span class="completion-review-mark" aria-hidden="true">✓</span>
      <span class="completion-review-copy">
        <span class="completion-review-heading">今日完成评价 <em>· ${resultConfig.label}</em></span>
        <span class="completion-review-content">${escapeHtml(review.content)}</span>
      </span>
    </button>`;
}

function renderCompletionReviewAction(item, { subtask = false } = {}) {
  if (isTomorrowView()) return '';
  const today = getLocalDateKey();
  const review = getCompletionReviewForDate(item, today);
  const resultConfig = review ? getCompletionReviewResultConfig(review.result) : null;
  const classes = subtask
    ? `subtask-review-btn ${resultConfig?.className || ''}`
    : `action-btn completion-review-action ${resultConfig?.className || ''}`;
  const title = review ? `完成评价：${resultConfig.label}` : '完成评价';
  const ariaLabel = review
    ? `编辑“${item.text}”的今日完成评价：${resultConfig.label}`
    : `填写“${item.text}”的今日完成评价`;
  return `
    <button class="${classes}" type="button" data-action="open-completion-review" data-id="${item.id}" data-review-date="${today}" ${review ? `data-review-id="${review.id}"` : ''} title="${title}" aria-label="${escapeHtml(ariaLabel)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 9h8M8 13h5"/><path d="m13 17 2 2 4-5"/></svg>
    </button>`;
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
            ${renderCompletionGoalAction(subtask, { subtask: true })}
            ${renderCompletionReviewAction(subtask, { subtask: true })}
            ${renderDatePlanButton(subtask, { subtask: true })}
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
          ${renderCompletionGoalBlock(subtask)}
          ${renderCompletionReviewBlock(subtask)}
          <div class="subtask-time">${renderSubtaskTimeContentHtml(subtask)}</div>
        </div>
      </div>
      ${subtask.description || openDescriptions.has(todo.id + ':' + subtask.id) ? `<div class="subtask-desc-section" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" style="display: ${openDescriptions.has(todo.id + ':' + subtask.id) ? 'block' : 'none'};">
        <div class="desc-display">${subtask.description ? escapeHtml(subtask.description) : ''}</div>
      </div>` : ''}
    </li>`;
}

function renderCompletedSubtasksHtml(todo, completedSubtasks) {
  const expanded = expandedCompletedSubtaskTodoIds.has(todo.id);
  const actionLabel = expanded ? '折叠' : '展开';
  return `
    <div class="completed-subtasks ${expanded ? 'expanded' : ''}">
      <button class="completed-subtasks-toggle" type="button" data-action="toggle-completed-subtasks" data-todo-id="${todo.id}" title="${actionLabel}已完成子任务" aria-label="${actionLabel}已完成子任务，共 ${completedSubtasks.length} 项" aria-expanded="${expanded}" aria-controls="completed-subtasks-${todo.id}">
        <svg viewBox="0 0 12 12" aria-hidden="true"><polyline points="2,3 6,8 10,3" /></svg>
        <span>已完成</span>
        <b>${completedSubtasks.length}</b>
      </button>
      <ul class="subtask-list completed-subtask-list" id="completed-subtasks-${todo.id}" ${expanded ? '' : 'hidden'}>
        ${completedSubtasks.map(subtask => renderSubtaskHtml(todo, subtask)).join('')}
      </ul>
    </div>`;
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

function renderTodoHtml(t, { todayCompact = false } = {}) {
  const subtaskCount = t.subtasks.length;
  const activeSubtasks = t.subtasks.filter(subtask => !subtask.done);
  const completedSubtasks = t.subtasks.filter(subtask => subtask.done);
  const doneCount = completedSubtasks.length;
  const subAddRowHtml = renderSubtaskAddRowHtml(t.id);
  const categoryBadgeHtml = isPlannedDateView()
    ? `<span class="task-category-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z"/></svg>${escapeHtml(getCategoryName(t.categoryId))}</span>`
    : '';

  const groupedSubtasksHtml = !t.done && completedSubtasks.length > 0
    ? `
      <ul class="subtask-list subtask-active-list">
        ${activeSubtasks.map(subtask => renderSubtaskHtml(t, subtask)).join('')}
      </ul>
      ${renderCompletedSubtasksHtml(t, completedSubtasks)}`
    : `
      <ul class="subtask-list">
        ${t.subtasks.map(subtask => renderSubtaskHtml(t, subtask)).join('')}
      </ul>`;

  const subtasksHtml = todayCompact ? '' : (subtaskCount > 0 ? `
    <div class="subtask-section ${t.collapsed ? 'collapsed' : ''}">
      ${groupedSubtasksHtml}
      ${renderSubtaskFooterHtml(t)}
      ${subAddRowHtml}
    </div>
  ` : `
    <div class="subtask-section">
      ${subAddRowHtml}
    </div>
  `);

  return `
    <li class="todo-item ${todayCompact ? 'today-parent-card' : ''} ${t.done ? 'done' : ''}" data-id="${t.id}" draggable="${todayCompact ? 'false' : 'true'}">
      <div class="todo-main">
        <span class="drag-handle" title="拖拽排序" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg></span>
        <button class="checkbox" type="button" data-action="toggle" aria-label="${t.done ? '标记为未完成' : '标记为已完成'}" aria-pressed="${t.done}">
          <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
        </button>
        <div class="todo-body">
          <div class="todo-text">${escapeHtml(t.text)}</div>
          ${renderCompletionGoalBlock(t)}
          ${renderCompletionReviewBlock(t)}
          <div class="task-meta">${categoryBadgeHtml}<div class="task-time"><span class="task-time-label">创建于 ${formatTime(t.createdAt)}${t.done && t.completedAt ? ' · 完成于 ' + formatTime(t.completedAt) : ''}</span>${(todayCompact || t.collapsed) && subtaskCount > 0 ? `<span class="task-progress-meta ${doneCount === subtaskCount ? 'is-complete' : ''}" aria-label="子任务完成情况：${doneCount}/${subtaskCount}">子任务 ${doneCount}/${subtaskCount}</span>` : ''}</div></div>
          ${t.description || openDescriptions.has(t.id) ? `<div class="desc-section" data-id="${t.id}" style="display: ${openDescriptions.has(t.id) ? 'block' : 'none'};">
            <div class="desc-display">${t.description ? escapeHtml(t.description) : ''}</div>
          </div>` : ''}
        </div>
        ${!todayCompact && subtaskCount > 0 ? renderCollapseToggleHtml(t) : ''}
        <div class="todo-actions">
          ${renderCompletionGoalAction(t)}
          ${renderCompletionReviewAction(t)}
          ${renderDatePlanButton(t)}
          ${todayCompact ? '' : `<button class="action-btn sub-add-action" type="button" data-action="show-sub-add" data-todo-id="${t.id}" title="添加子任务" aria-label="添加子任务" aria-controls="sub-add-${t.id}" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>`}
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

function renderTodaySubtaskHtml(todo, subtask) {
  const descriptionKey = `${todo.id}:${subtask.id}`;
  return `
    <li class="todo-item subtask-item today-child-card ${subtask.done ? 'done' : ''}" data-todo-id="${todo.id}" data-id="${subtask.id}" draggable="false">
      <div class="today-child-main">
        <button class="subtask-checkbox" type="button" data-action="toggle-sub" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" aria-label="${subtask.done ? '标记为未完成' : '标记为已完成'}" aria-pressed="${subtask.done}">
          <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
        </button>
        <div class="today-child-body">
          <span class="today-item-kind">子任务</span>
          <div class="subtask-text">${escapeHtml(subtask.text)}</div>
          ${renderCompletionGoalBlock(subtask)}
          ${renderCompletionReviewBlock(subtask)}
          <div class="today-item-source">
            <span>${escapeHtml(todo.text)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(getCategoryName(todo.categoryId))}</span>
          </div>
        </div>
        <div class="today-child-actions">
          ${renderCompletionGoalAction(subtask, { subtask: true })}
          ${renderCompletionReviewAction(subtask, { subtask: true })}
          ${renderDatePlanButton(subtask, { subtask: true })}
          <button class="subtask-desc-btn ${subtask.description ? 'has-desc' : ''}" type="button" data-action="toggle-desc" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" title="详情描述" aria-label="详情描述">
            <svg class="desc-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/><path d="M5.5 6.5h5M5.5 9h3.5"/></svg>
          </button>
          <button class="subtask-delete" type="button" data-action="delete-sub" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" title="删除子任务" aria-label="删除子任务">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      ${subtask.description || openDescriptions.has(descriptionKey) ? `<div class="subtask-desc-section" data-todo-id="${todo.id}" data-sub-id="${subtask.id}" style="display: ${openDescriptions.has(descriptionKey) ? 'block' : 'none'};">
        <div class="desc-display">${subtask.description ? escapeHtml(subtask.description) : ''}</div>
      </div>` : ''}
    </li>`;
}

function renderTodayEntryHtml({ todo, item, isSubtask }) {
  return isSubtask ? renderTodaySubtaskHtml(todo, item) : renderTodoHtml(todo, { todayCompact: true });
}

function renderCarryover() {
  const entries = getCarryoverEntries();
  todayCarryover.hidden = !isTodayView() || entries.length === 0;
  if (todayCarryover.hidden) {
    todayCarryoverList.innerHTML = '';
    return;
  }

  todayCarryoverList.innerHTML = entries.map(({ todo, item, isSubtask }) => `
    <li>
      <div>
        <strong>${escapeHtml(item.text)}</strong>
        <span>${isSubtask ? `子任务 · ${escapeHtml(todo.text)}` : escapeHtml(getCategoryName(todo.categoryId))}</span>
      </div>
      <button type="button" data-carryover-id="${item.id}" title="移到今天" aria-label="将“${escapeHtml(item.text)}”移到今天">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </li>`).join('');
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
  const plannedView = getPlannedViewConfig();
  if (plannedView) {
    const entries = getActivePlannedEntries();
    const activeCountValue = entries.filter(({ item }) => !item.done).length;
    const completedCountValue = entries.length - activeCountValue;
    const viewLabel = plannedView.title.replace('待办', '');
    countText.textContent = entries.length === 0
      ? `${viewLabel}暂无安排`
      : `${viewLabel}进行中 ${activeCountValue} · 共 ${entries.length} 项`;
    activeTaskCount.textContent = activeCountValue;
    completedTaskCount.textContent = completedCountValue;
    clearBtn.style.display = completedCountValue > 0 ? 'inline-grid' : 'none';
    clearBtn.title = `收起${viewLabel}已完成`;
    clearBtn.setAttribute('aria-label', `收起${viewLabel}已完成`);
    updateProgress();
    updateSideStats();
    return;
  }

  const scopedTodos = getScopedTodos();
  const activeCountValue = scopedTodos.filter(todo => !todo.done).length;
  const completedCountValue = scopedTodos.length - activeCountValue;
  countText.textContent = scopedTodos.length === 0
    ? '暂无任务'
    : `进行中 ${activeCountValue} · 共 ${scopedTodos.length} 个父任务`;
  activeTaskCount.textContent = activeCountValue;
  completedTaskCount.textContent = completedCountValue;
  clearBtn.style.display = completedCountValue > 0 ? 'inline-grid' : 'none';
  clearBtn.title = '清除已完成';
  clearBtn.setAttribute('aria-label', '清除已完成');
  updateProgress();
  updateSideStats();
}

function render() {
  closeDatePlanMenu();
  const hasUnassignedTodos = todos.some(todo => !todo.categoryId);
  let activeCategoryChanged = false;
  if (activeCategoryId !== TODAY_CATEGORY_ID
    && activeCategoryId !== TOMORROW_CATEGORY_ID
    && activeCategoryId !== UNASSIGNED_CATEGORY_ID
    && !getCategoryById(activeCategoryId)) {
    activeCategoryId = hasUnassignedTodos ? UNASSIGNED_CATEGORY_ID : TODAY_CATEGORY_ID;
    activeCategoryChanged = true;
  }
  if (activeCategoryId === UNASSIGNED_CATEGORY_ID && !hasUnassignedTodos) {
    activeCategoryId = TODAY_CATEGORY_ID;
    activeCategoryChanged = true;
  }
  if (activeCategoryChanged) saveActiveCategory();
  const scopedTodos = getVisibleTodos();
  const plannedView = getPlannedViewConfig();
  if (plannedView) {
    const entries = getActivePlannedEntries();
    const activeEntries = entries.filter(({ item }) => !item.done);
    const completedEntries = entries.filter(({ item }) => item.done);
    activeList.innerHTML = activeEntries.length > 0
      ? activeEntries.map(renderTodayEntryHtml).join('')
      : getEmptyStateHtml(scopedTodos);
    completedList.innerHTML = completedEntries.map(renderTodayEntryHtml).join('');
    completedSection.hidden = completedEntries.length === 0;
  } else {
    const activeTodos = scopedTodos.filter(todo => !todo.done);
    const completedTodos = scopedTodos.filter(todo => todo.done);
    activeList.innerHTML = activeTodos.length > 0
      ? activeTodos.map(renderTodoHtml).join('')
      : getEmptyStateHtml(scopedTodos);
    completedList.innerHTML = completedTodos.map(renderTodoHtml).join('');
    completedSection.hidden = completedTodos.length === 0;
  }
  completedList.hidden = !completedExpanded;

  taskWorkspace.classList.toggle('planned-date-view', isPlannedDateView());
  taskWorkspace.classList.toggle('today-view', isTodayView());
  taskWorkspace.classList.toggle('tomorrow-view', isTomorrowView());
  if (plannedView) {
    workspaceLabel.textContent = `TODOLIST · ${formatDateHeading(plannedView.date)}`;
    workspaceTitle.textContent = plannedView.title;
  } else if (activeCategoryId === UNASSIGNED_CATEGORY_ID) workspaceTitle.textContent = '未分组';
  else workspaceTitle.textContent = getCategoryName(activeCategoryId);
  if (!plannedView) workspaceLabel.textContent = 'TODOLIST · 专注工作台';

  renderCarryover();
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

function setAccountMenuOpen(open) {
  const expanded = Boolean(open);
  if (expanded) closeDatePlanMenu();
  accountMenuPanel.hidden = !expanded;
  accountMenuToggle.setAttribute('aria-expanded', String(expanded));
  sidebarProfileArea.classList.toggle('menu-open', expanded);
}

function closeMobileSidebar() {
  setAccountMenuOpen(false);
  appRoot.classList.remove('mobile-sidebar-open');
  mobileSidebarToggle.setAttribute('aria-expanded', 'false');
}

function openMobileSidebar() {
  appRoot.classList.add('mobile-sidebar-open');
  mobileSidebarToggle.setAttribute('aria-expanded', 'true');
}

function showTaskWorkspace() {
  setAccountMenuOpen(false);
  taskWorkspace.hidden = false;
  settingsView.hidden = true;
  settingsBtn.classList.remove('active');
  closeMobileSidebar();
}

function showSettings() {
  setAccountMenuOpen(false);
  taskWorkspace.hidden = true;
  settingsView.hidden = false;
  settingsBtn.classList.add('active');
  closeMobileSidebar();
}

function getActiveCompletionGoalItem() {
  return completionGoalTodoId ? findTodoItem(completionGoalTodoId)?.item || null : null;
}

function getEditingCompletionGoal() {
  return getActiveCompletionGoalItem()?.completionGoals?.find(goal => goal.id === completionGoalEditingId) || null;
}

function renderCompletionGoalHistory() {
  const item = getActiveCompletionGoalItem();
  if (!item) return;
  const goals = sortCompletionGoals(item.completionGoals);
  completionGoalHistoryLabel.textContent = `历史目标 ${goals.length}`;
  const visibleGoals = goals.slice(0, completionGoalHistoryLimit);
  completionGoalHistory.innerHTML = visibleGoals.length === 0
    ? '<p class="completion-history-empty">还没有历史目标。保存后会按日期积累在这里。</p>'
    : `${visibleGoals.map(goal => `
        <div class="completion-history-item ${goal.id === completionGoalEditingId ? 'is-current' : ''}">
          <button type="button" data-goal-history-id="${goal.id}" aria-label="编辑 ${formatGoalDate(goal.targetDate)} 的完成目标">
            <span><b>${formatGoalDate(goal.targetDate)}</b>${goal.id === completionGoalEditingId ? '<em>当前</em>' : ''}</span>
            <p>${escapeHtml(goal.content)}</p>
          </button>
          <button class="completion-history-delete" type="button" data-delete-goal-id="${goal.id}" title="删除" aria-label="删除 ${formatGoalDate(goal.targetDate)} 的完成目标">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>`).join('')}
      ${goals.length > visibleGoals.length ? '<button class="completion-history-more" type="button" data-goal-history-more>查看更多</button>' : ''}`;
}

function syncCompletionGoalFormForDate({ preferredGoalId = null, preserveContent = false } = {}) {
  const item = getActiveCompletionGoalItem();
  if (!item) return;
  const existing = preferredGoalId
    ? item.completionGoals.find(goal => goal.id === preferredGoalId)
    : getCompletionGoalForDate(item, completionGoalDate.value);
  completionGoalEditingId = existing?.id || null;
  if (existing) {
    if (!preserveContent) {
      completionGoalDate.value = existing.targetDate;
      completionGoalContent.value = existing.content;
    }
  } else if (!preserveContent) {
    completionGoalContent.value = '';
  }
  deleteCompletionGoalBtn.hidden = !existing;

  const previous = sortCompletionGoals(item.completionGoals)
    .find(goal => goal.targetDate < completionGoalDate.value);
  const isEditingSelectedDate = existing?.targetDate === completionGoalDate.value;
  completionGoalCarried.hidden = Boolean(isEditingSelectedDate || !previous);
  if (previous && !isEditingSelectedDate) {
    completionGoalCarried.dataset.goalId = previous.id;
    completionGoalCarriedLabel.textContent = `上次目标 · ${formatGoalDate(previous.targetDate)}`;
    completionGoalCarriedContent.textContent = previous.content;
  } else {
    delete completionGoalCarried.dataset.goalId;
  }
  renderCompletionGoalHistory();
}

function openCompletionGoalDialog(todoId, { targetDate = null, goalId = null, returnFocus = null } = {}) {
  const state = findTodoItem(todoId);
  if (!state) return;
  completionGoalTodoId = todoId;
  completionGoalReturnFocus = returnFocus || document.activeElement;
  completionGoalHistoryLimit = 5;
  completionGoalTask.textContent = state.item.text;
  completionGoalStatus.textContent = '';
  completionGoalHistoryToggle.setAttribute('aria-expanded', 'false');
  completionGoalHistory.hidden = true;
  completionGoalDate.value = targetDate || state.item.plannedDate || getLocalDateKey();
  syncCompletionGoalFormForDate({ preferredGoalId: goalId });
  if (!completionGoalDialog.open) completionGoalDialog.showModal();
  requestAnimationFrame(() => completionGoalContent.focus());
}

function resetCompletionGoalDialog() {
  const returnTodoId = completionGoalTodoId;
  completionGoalTodoId = null;
  completionGoalEditingId = null;
  completionGoalHistoryLimit = 5;
  completionGoalStatus.textContent = '';
  completionGoalContent.value = '';
  const returnFocus = completionGoalReturnFocus;
  completionGoalReturnFocus = null;
  if (returnFocus?.isConnected) returnFocus.focus();
  else if (returnTodoId) {
    requestAnimationFrame(() => {
      list.querySelector(`[data-action="open-completion-goal"][data-id="${returnTodoId}"]`)?.focus();
    });
  }
}

async function saveCompletionGoal(event) {
  event.preventDefault();
  const item = getActiveCompletionGoalItem();
  const targetDate = completionGoalDate.value;
  const content = completionGoalContent.value.trim();
  if (!item || !targetDate || !content) return;

  const editingGoal = getEditingCompletionGoal();
  const conflictingGoal = item.completionGoals.find(goal => (
    goal.targetDate === targetDate && goal.id !== editingGoal?.id
  ));
  if (conflictingGoal && !window.confirm(`${formatGoalDate(targetDate)}已有目标，是否用当前内容替换？`)) return;

  saveCompletionGoalBtn.disabled = true;
  deleteCompletionGoalBtn.disabled = true;
  completionGoalDialog.setAttribute('aria-busy', 'true');
  completionGoalStatus.textContent = '正在保存…';
  try {
    let saved;
    if (conflictingGoal) {
      saved = await updateCompletionGoalRecord(conflictingGoal.id, { content });
      if (editingGoal) {
        await deleteCompletionGoalRecord(editingGoal.id);
        removeCompletionGoalFromMemory(editingGoal.id, item.id);
      }
    } else if (editingGoal) {
      saved = await updateCompletionGoalRecord(editingGoal.id, { targetDate, content });
    } else {
      saved = await createCompletionGoalRecord({ todoId: item.id, targetDate, content });
    }
    upsertCompletionGoalInMemory(saved);
    completionGoalEditingId = saved.id;
    render();
    showToast(`已保存 ${formatGoalDate(saved.targetDate)} 的完成目标`);
    completionGoalDialog.close();
  } catch (error) {
    completionGoalStatus.textContent = error?.message || '保存失败，请稍后重试';
  } finally {
    saveCompletionGoalBtn.disabled = false;
    deleteCompletionGoalBtn.disabled = false;
    completionGoalDialog.removeAttribute('aria-busy');
  }
}

async function deleteCompletionGoal(goalId = completionGoalEditingId) {
  const item = getActiveCompletionGoalItem();
  const goal = item?.completionGoals?.find(entry => entry.id === goalId);
  if (!item || !goal) return;
  if (!window.confirm(`删除 ${formatGoalDate(goal.targetDate)} 的完成目标？此操作无法撤销。`)) return;

  deleteCompletionGoalBtn.disabled = true;
  completionGoalStatus.textContent = '正在删除…';
  try {
    await deleteCompletionGoalRecord(goal.id);
    removeCompletionGoalFromMemory(goal.id, item.id);
    if (completionGoalEditingId === goal.id) {
      completionGoalEditingId = null;
      syncCompletionGoalFormForDate();
    } else {
      renderCompletionGoalHistory();
    }
    completionGoalStatus.textContent = '';
    render();
    showToast('已删除完成目标');
  } catch (error) {
    completionGoalStatus.textContent = error?.message || '删除失败，请稍后重试';
  } finally {
    deleteCompletionGoalBtn.disabled = false;
  }
}

function getActiveCompletionReviewItem() {
  return completionReviewTodoId ? findTodoItem(completionReviewTodoId)?.item || null : null;
}

function getEditingCompletionReview() {
  return getActiveCompletionReviewItem()?.completionReviews?.find(
    review => review.id === completionReviewEditingId
  ) || null;
}

function getSelectedCompletionReviewResult() {
  return completionReviewForm.elements.completionReviewResult.value || '';
}

function setSelectedCompletionReviewResult(result = '') {
  completionReviewForm.querySelectorAll('input[name="completionReviewResult"]').forEach(input => {
    input.checked = input.value === result;
  });
}

function updateCompletionReviewContentCount() {
  completionReviewContentCount.textContent = `${completionReviewContent.value.length}/500`;
}

function renderCompletionReviewGoalReference() {
  const item = getActiveCompletionReviewItem();
  if (!item) return;
  const goal = getCompletionGoalForDate(item, completionReviewDate.value);
  completionReviewGoalContent.textContent = goal?.content
    || '当天未设完成目标，可以直接记录实际完成情况。';
  completionReviewGoalContent.classList.toggle('is-missing', !goal);
}

function renderCompletionReviewHistory() {
  const item = getActiveCompletionReviewItem();
  if (!item) return;
  const reviews = sortCompletionReviews(item.completionReviews);
  completionReviewHistoryLabel.textContent = `历史评价 ${reviews.length}`;
  const visibleReviews = reviews.slice(0, completionReviewHistoryLimit);
  completionReviewHistory.innerHTML = visibleReviews.length === 0
    ? '<p class="completion-history-empty">还没有历史评价。保存后会按日期积累在这里。</p>'
    : `${visibleReviews.map(review => {
        const resultConfig = getCompletionReviewResultConfig(review.result);
        const snapshot = review.goalContentSnapshot || '无目标记录';
        return `
          <div class="completion-review-history-item ${review.id === completionReviewEditingId ? 'is-current' : ''}">
            <button type="button" data-review-history-id="${review.id}" aria-label="编辑 ${formatGoalDate(review.reviewDate)} 的完成评价">
              <span class="completion-review-history-heading"><b>${formatGoalDate(review.reviewDate)}</b><strong class="${resultConfig.className}">${resultConfig.label}</strong>${review.id === completionReviewEditingId ? '<em>当前</em>' : ''}</span>
              <p>${escapeHtml(review.content)}</p>
              <small>当时目标：${escapeHtml(snapshot)}</small>
            </button>
            <button class="completion-history-delete" type="button" data-delete-review-id="${review.id}" title="删除" aria-label="删除 ${formatGoalDate(review.reviewDate)} 的完成评价">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>`;
      }).join('')}
      ${reviews.length > visibleReviews.length ? '<button class="completion-history-more" type="button" data-review-history-more>查看更多</button>' : ''}`;
}

function syncCompletionReviewFormForDate({ preferredReviewId = null, preserveContent = false } = {}) {
  const item = getActiveCompletionReviewItem();
  if (!item) return;
  const existing = preferredReviewId
    ? item.completionReviews.find(review => review.id === preferredReviewId)
    : getCompletionReviewForDate(item, completionReviewDate.value);
  completionReviewEditingId = existing?.id || null;

  if (existing && !preserveContent) {
    completionReviewDate.value = existing.reviewDate;
    setSelectedCompletionReviewResult(existing.result);
    completionReviewContent.value = existing.content;
  } else if (!existing && !preserveContent) {
    setSelectedCompletionReviewResult();
    completionReviewContent.value = '';
  }

  deleteCompletionReviewBtn.hidden = !existing;
  renderCompletionReviewGoalReference();
  renderCompletionReviewHistory();
  updateCompletionReviewContentCount();
}

function openCompletionReviewDialog(todoId, { reviewDate = null, reviewId = null, returnFocus = null } = {}) {
  const state = findTodoItem(todoId);
  if (!state) return;
  const today = getLocalDateKey();
  const requestedDate = reviewDate || today;
  completionReviewTodoId = todoId;
  completionReviewReturnFocus = returnFocus || document.activeElement;
  completionReviewHistoryLimit = 5;
  completionReviewTask.textContent = state.item.text;
  completionReviewStatus.textContent = '';
  completionReviewHistoryToggle.setAttribute('aria-expanded', 'false');
  completionReviewHistory.hidden = true;
  completionReviewDate.max = today;
  completionReviewDate.value = requestedDate > today ? today : requestedDate;
  syncCompletionReviewFormForDate({ preferredReviewId: reviewId });
  if (!completionReviewDialog.open) completionReviewDialog.showModal();
  requestAnimationFrame(() => {
    if (completionReviewEditingId) completionReviewContent.focus();
    else completionReviewForm.querySelector('input[name="completionReviewResult"]')?.focus();
  });
}

function resetCompletionReviewDialog() {
  const returnTodoId = completionReviewTodoId;
  completionReviewTodoId = null;
  completionReviewEditingId = null;
  completionReviewHistoryLimit = 5;
  completionReviewStatus.textContent = '';
  completionReviewContent.value = '';
  setSelectedCompletionReviewResult();
  updateCompletionReviewContentCount();
  const returnFocus = completionReviewReturnFocus;
  completionReviewReturnFocus = null;
  if (returnFocus?.isConnected) returnFocus.focus();
  else if (returnTodoId) {
    requestAnimationFrame(() => {
      list.querySelector(`[data-action="open-completion-review"][data-id="${returnTodoId}"]`)?.focus();
    });
  }
}

async function saveCompletionReview(event) {
  event.preventDefault();
  const item = getActiveCompletionReviewItem();
  const reviewDate = completionReviewDate.value;
  const result = getSelectedCompletionReviewResult();
  const content = completionReviewContent.value.trim();
  const today = getLocalDateKey();

  if (!item || !reviewDate) return;
  if (reviewDate > today) {
    completionReviewStatus.textContent = '不能提前评价未来日期。';
    completionReviewDate.focus();
    return;
  }
  if (!result) {
    completionReviewStatus.textContent = '请选择达成结果。';
    completionReviewForm.querySelector('input[name="completionReviewResult"]')?.focus();
    return;
  }
  if (!content) {
    completionReviewStatus.textContent = '请填写实际完成情况。';
    completionReviewContent.focus();
    return;
  }

  const editingReview = getEditingCompletionReview();
  const conflictingReview = item.completionReviews.find(review => (
    review.reviewDate === reviewDate && review.id !== editingReview?.id
  ));
  if (conflictingReview && !window.confirm(`${formatGoalDate(reviewDate)}已有完成评价，是否用当前内容替换？`)) return;

  const dateChanged = Boolean(editingReview && editingReview.reviewDate !== reviewDate);
  const exactGoal = getCompletionGoalForDate(item, reviewDate);
  const goalContentSnapshot = dateChanged || !editingReview
    ? exactGoal?.content || null
    : editingReview.goalContentSnapshot;

  saveCompletionReviewBtn.disabled = true;
  deleteCompletionReviewBtn.disabled = true;
  completionReviewDialog.setAttribute('aria-busy', 'true');
  completionReviewStatus.textContent = '正在保存…';
  try {
    let saved;
    if (conflictingReview) {
      saved = await updateCompletionReviewRecord(conflictingReview.id, {
        result,
        content,
        goalContentSnapshot: exactGoal?.content || null,
      });
      if (editingReview) {
        await deleteCompletionReviewRecord(editingReview.id);
        removeCompletionReviewFromMemory(editingReview.id, item.id);
      }
    } else if (editingReview) {
      saved = await updateCompletionReviewRecord(editingReview.id, {
        reviewDate,
        result,
        content,
        goalContentSnapshot,
      });
    } else {
      saved = await createCompletionReviewRecord({
        todoId: item.id,
        reviewDate,
        result,
        content,
        goalContentSnapshot,
      });
    }
    upsertCompletionReviewInMemory(saved);
    completionReviewEditingId = saved.id;
    render();
    showToast(`已保存 ${formatGoalDate(saved.reviewDate)} 的完成评价`);
    completionReviewDialog.close();
  } catch (error) {
    completionReviewStatus.textContent = error?.message || '保存失败，请稍后重试';
  } finally {
    saveCompletionReviewBtn.disabled = false;
    deleteCompletionReviewBtn.disabled = false;
    completionReviewDialog.removeAttribute('aria-busy');
  }
}

async function deleteCompletionReview(reviewId = completionReviewEditingId) {
  const item = getActiveCompletionReviewItem();
  const review = item?.completionReviews?.find(entry => entry.id === reviewId);
  if (!item || !review) return;
  if (!window.confirm(`删除 ${formatGoalDate(review.reviewDate)} 的完成评价？此操作无法撤销。`)) return;

  deleteCompletionReviewBtn.disabled = true;
  completionReviewStatus.textContent = '正在删除…';
  try {
    await deleteCompletionReviewRecord(review.id);
    removeCompletionReviewFromMemory(review.id, item.id);
    if (completionReviewEditingId === review.id) {
      completionReviewEditingId = null;
      syncCompletionReviewFormForDate();
    } else {
      renderCompletionReviewHistory();
    }
    completionReviewStatus.textContent = '';
    render();
    showToast('已删除完成评价');
  } catch (error) {
    completionReviewStatus.textContent = error?.message || '删除失败，请稍后重试';
  } finally {
    deleteCompletionReviewBtn.disabled = false;
  }
}

function closeDialog(id) {
  document.getElementById(id)?.close();
}

function openCategoryDialog() {
  const dialog = document.getElementById('categoryDialog');
  document.getElementById('categoryNameInput').value = '';
  dialog.showModal();
  requestAnimationFrame(() => document.getElementById('categoryNameInput').focus());
}

async function submitCategoryForm(event) {
  event.preventDefault();
  const name = document.getElementById('categoryNameInput').value.trim();
  if (!name) return;

  const duplicate = categories.some(category => category.name.localeCompare(name, 'zh-CN', { sensitivity: 'accent' }) === 0);
  if (duplicate) {
    showToast('已经有同名分组');
    document.getElementById('categoryNameInput').focus();
    return;
  }

  try {
    const created = await createCategoryRecord({ name, position: categories.length });
    categories.push(created);
    activeCategoryId = created.id;
    saveActiveCategory();
    closeDialog('categoryDialog');
    render();
  } catch (error) {
    showCloudError(error);
  }
}

function startCategoryNameEdit(id) {
  closeCategoryContextMenu();
  const category = getCategoryById(id);
  const row = categoryList.querySelector(`[data-category-row-id="${id}"]`);
  const rowHeader = row?.querySelector('.category-row');
  if (!category || !row || !rowHeader || row.classList.contains('editing')) return;

  const originalName = category.name;
  const editInput = document.createElement('input');
  editInput.className = 'category-inline-edit';
  editInput.type = 'text';
  editInput.maxLength = 30;
  editInput.value = originalName;
  editInput.setAttribute('aria-label', `重命名「${originalName}」`);
  editInput.style.setProperty('--category-edit-width', `${Math.min(Math.max(originalName.length + 2, 8), 20)}ch`);

  let finishing = false;
  let cancelled = false;

  const restoreRow = () => {
    editInput.remove();
    row.classList.remove('editing');
    rowHeader.draggable = true;
  };

  const refocus = message => {
    showToast(message);
    requestAnimationFrame(() => {
      if (!editInput.isConnected) return;
      editInput.focus();
      editInput.select();
    });
  };

  const finish = async () => {
    if (finishing) return;
    const name = editInput.value.trim();
    if (cancelled || name === originalName) {
      finishing = true;
      restoreRow();
      return;
    }
    if (!name) {
      refocus('分组名称不能为空');
      return;
    }
    const duplicate = categories.some(item => item.id !== id
      && item.name.localeCompare(name, 'zh-CN', { sensitivity: 'accent' }) === 0);
    if (duplicate) {
      refocus('已经有同名分组');
      return;
    }

    finishing = true;
    editInput.disabled = true;
    try {
      const updated = await updateCategoryRecord(id, { name });
      Object.assign(category, updated);
      render();
    } catch (error) {
      restoreRow();
      await restoreCloudState(error);
    }
  };

  row.classList.add('editing');
  rowHeader.draggable = false;
  rowHeader.append(editInput);
  editInput.addEventListener('blur', () => void finish());
  editInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      void finish();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelled = true;
      finishing = true;
      restoreRow();
    }
  });
  editInput.focus();
  editInput.select();
}

function closeCategoryContextMenu({ restoreFocus = false } = {}) {
  if (categoryContextMenu.hidden) return;
  categoryContextMenu.hidden = true;
  categoryContextMenu.removeAttribute('style');
  contextMenuCategoryId = null;
  if (restoreFocus && contextMenuReturnFocus?.isConnected) contextMenuReturnFocus.focus();
  contextMenuReturnFocus = null;
}

function openCategoryContextMenu(id, { x, y, anchor = null, focusMenu = true } = {}) {
  const category = getCategoryById(id);
  if (!category) return;

  closeDatePlanMenu();
  closeCategoryContextMenu();
  setAccountMenuOpen(false);
  contextMenuCategoryId = id;
  contextMenuReturnFocus = anchor;
  categoryContextMenu.hidden = false;
  categoryContextMenu.setAttribute('aria-label', `「${category.name}」分组操作`);

  const anchorRect = anchor?.getBoundingClientRect();
  const preferredX = Number.isFinite(x) ? x : (anchorRect?.left ?? 0);
  const preferredY = Number.isFinite(y) ? y : (anchorRect?.bottom ?? 0) + 4;
  const menuRect = categoryContextMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(preferredX, window.innerWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(preferredY, window.innerHeight - menuRect.height - 8));
  categoryContextMenu.style.left = `${left}px`;
  categoryContextMenu.style.top = `${top}px`;

  if (focusMenu) {
    requestAnimationFrame(() => categoryContextMenu.querySelector('[role="menuitem"]')?.focus());
  }
}

function closeDatePlanMenu({ restoreFocus = false } = {}) {
  const returnFocus = datePlanReturnFocus;
  if (returnFocus?.isConnected) returnFocus.setAttribute('aria-expanded', 'false');
  datePlanMenu.hidden = true;
  datePlanMenu.removeAttribute('style');
  datePlanItemId = null;
  datePlanReturnFocus = null;
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
}

function openDatePlanMenu(id, anchor) {
  const state = findTodoItem(id);
  if (!state || !anchor) return;
  if (!datePlanMenu.hidden && datePlanItemId === id) {
    closeDatePlanMenu({ restoreFocus: true });
    return;
  }

  closeDatePlanMenu();
  closeCategoryContextMenu();
  setAccountMenuOpen(false);
  datePlanItemId = id;
  datePlanReturnFocus = anchor;

  const todayView = getPlannedViewConfig(TODAY_CATEGORY_ID);
  const tomorrowView = getPlannedViewConfig(TOMORROW_CATEGORY_ID);
  document.getElementById('datePlanTodayLabel').textContent = formatShortDate(todayView.date);
  document.getElementById('datePlanTomorrowLabel').textContent = formatShortDate(tomorrowView.date);
  datePlanMenu.setAttribute('aria-label', `安排“${state.item.text}”的日期`);

  const todayButton = datePlanMenu.querySelector('[data-date-plan-action="today"]');
  const tomorrowButton = datePlanMenu.querySelector('[data-date-plan-action="tomorrow"]');
  const clearButton = datePlanMenu.querySelector('[data-date-plan-action="clear"]');
  todayButton.setAttribute('aria-checked', String(state.item.plannedDate === todayView.dateKey));
  tomorrowButton.setAttribute('aria-checked', String(state.item.plannedDate === tomorrowView.dateKey));
  clearButton.disabled = !state.item.plannedDate;

  datePlanMenu.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = datePlanMenu.getBoundingClientRect();
  const preferredX = anchorRect.right - menuRect.width;
  const preferredY = anchorRect.bottom + 5;
  const left = Math.max(8, Math.min(preferredX, window.innerWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(preferredY, window.innerHeight - menuRect.height - 8));
  datePlanMenu.style.left = `${left}px`;
  datePlanMenu.style.top = `${top}px`;

  requestAnimationFrame(() => {
    const selected = datePlanMenu.querySelector('[role="menuitemradio"][aria-checked="true"]');
    (selected || todayButton).focus();
  });
}

function openDeleteCategoryDialog(id) {
  const category = getCategoryById(id);
  if (!category) return;
  const affectedCount = todos.filter(todo => todo.categoryId === id).length;
  document.getElementById('deleteCategoryId').value = id;
  document.getElementById('deleteCategoryTitle').textContent = `删除「${category.name}」`;
  document.getElementById('deleteCategoryMessage').textContent = affectedCount > 0
    ? `这个分组包含 ${affectedCount} 个父任务。`
    : '这个分组目前没有任务。';
  document.getElementById('deleteCategoryNote').textContent = affectedCount > 0
    ? '删除分组后，这些任务会保留并移到「未分组」。'
    : '删除后无法恢复该分组。';
  deleteCategoryDialog.showModal();
  requestAnimationFrame(() => document.getElementById('cancelDeleteCategoryBtn').focus());
}

async function deleteCategory(id) {
  const category = getCategoryById(id);
  if (!category) return false;
  const affectedCount = todos.filter(todo => todo.categoryId === id).length;

  try {
    await deleteCategoryRecord(id);
    categories = categories.filter(item => item.id !== id);
    expandedCategoryIds.delete(id);
    saveExpandedCategories();
    todos.forEach(todo => {
      if (todo.categoryId === id) todo.categoryId = null;
    });
    if (activeCategoryId === id) {
      activeCategoryId = affectedCount > 0 ? UNASSIGNED_CATEGORY_ID : TODAY_CATEGORY_ID;
      saveActiveCategory();
    }
    render();
    showToast(affectedCount > 0
      ? `已删除「${category.name}」，任务已移到未分组`
      : `已删除「${category.name}」`);
    return true;
  } catch (error) {
    await restoreCloudState(error);
    return false;
  }
}

async function submitDeleteCategory(event) {
  event.preventDefault();
  const id = document.getElementById('deleteCategoryId').value;
  const confirmButton = document.getElementById('confirmDeleteCategoryBtn');
  if (!getCategoryById(id) || confirmButton.disabled) return;

  confirmButton.disabled = true;
  deleteCategoryDialog.setAttribute('aria-busy', 'true');
  const deleted = await deleteCategory(id);
  confirmButton.disabled = false;
  deleteCategoryDialog.removeAttribute('aria-busy');
  if (deleted) closeDialog('deleteCategoryDialog');
}

function toggleCategoryTree(categoryId) {
  if (getActiveCategoryTodos(categoryId).length === 0) return;
  if (expandedCategoryIds.has(categoryId)) expandedCategoryIds.delete(categoryId);
  else expandedCategoryIds.add(categoryId);
  saveExpandedCategories();
  renderCategoryNavigation();
  requestAnimationFrame(() => {
    categoryList.querySelector(`.category-expand-toggle[data-category-id="${categoryId}"]`)?.focus();
  });
}

function openCategoryTask(todoId, categoryId) {
  const todo = todos.find(item => item.id === todoId);
  if (!todo || !matchesCategory(todo, categoryId)) return;
  if (todo.done && !completedExpanded) setCompletedExpanded(true, { persist: true });
  setActiveCategory(categoryId);
  requestAnimationFrame(() => {
    const todoElement = getTodoElement(todoId);
    if (!todoElement) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    todoElement.scrollIntoView({ behavior, block: 'center' });
    todoElement.classList.add('sidebar-target-highlight');
    setTimeout(() => todoElement.classList.remove('sidebar-target-highlight'), 1200);
  });
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
    draggedSub = {
      todoId: subItem.dataset.todoId,
      subId: subItem.dataset.id,
      done: subItem.classList.contains('done'),
    };
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
    if (
      subTarget
      && subTarget.dataset.id !== draggedSub.subId
      && subTarget.dataset.todoId === draggedSub.todoId
      && subTarget.classList.contains('done') === draggedSub.done
    ) {
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
    if (
      subTarget.dataset.todoId !== draggedSub.todoId
      || subTarget.classList.contains('done') !== draggedSub.done
    ) return;
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
  } else if (action === 'open-date-menu') {
    e.preventDefault();
    e.stopPropagation();
    openDatePlanMenu(actionEl.dataset.id, actionEl);
  } else if (action === 'open-completion-goal') {
    e.preventDefault();
    e.stopPropagation();
    openCompletionGoalDialog(actionEl.dataset.id, {
      targetDate: actionEl.dataset.goalDate,
      goalId: actionEl.dataset.goalId || null,
      returnFocus: actionEl,
    });
  } else if (action === 'open-completion-review') {
    e.preventDefault();
    e.stopPropagation();
    openCompletionReviewDialog(actionEl.dataset.id, {
      reviewDate: actionEl.dataset.reviewDate,
      reviewId: actionEl.dataset.reviewId || null,
      returnFocus: actionEl,
    });
  } else if (action === 'toggle-sub') {
    e.preventDefault();
    e.stopPropagation();
    const subId = actionEl.dataset.subId;
    toggleSubtask(actionEl.dataset.todoId, subId);
  } else if (action === 'toggle-completed-subtasks') {
    e.preventDefault();
    e.stopPropagation();
    const targetTodoId = actionEl.dataset.todoId;
    setCompletedSubtasksExpanded(
      targetTodoId,
      !expandedCompletedSubtaskTodoIds.has(targetTodoId)
    );
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
completionGoalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    addTodo();
  }
});

newTaskCategorySelect.addEventListener('change', () => {
  if (isPlannedDateView()) {
    plannedComposerCategoryId = newTaskCategorySelect.value || null;
    savePlannedComposerCategory();
  }
  syncComposerCategory();
});
completedToggle.addEventListener('click', () => setCompletedExpanded(!completedExpanded, { persist: true }));
clearBtn.addEventListener('click', clearCompleted);

todayTasksNav.addEventListener('click', () => setActiveCategory(TODAY_CATEGORY_ID));
tomorrowTasksNav.addEventListener('click', () => setActiveCategory(TOMORROW_CATEGORY_ID));
carryAllToTodayBtn.addEventListener('click', () => moveEntriesToToday(getCarryoverEntries()));
todayCarryoverList.addEventListener('click', event => {
  const button = event.target.closest('[data-carryover-id]');
  if (button) moveCarryoverItemToToday(button.dataset.carryoverId);
});
document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryDialog());

categoryList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton?.dataset.action === 'toggle-category-tree') {
    event.stopPropagation();
    toggleCategoryTree(actionButton.dataset.categoryId);
    return;
  }
  if (actionButton?.dataset.action === 'open-category-menu') {
    event.stopPropagation();
    openCategoryContextMenu(actionButton.dataset.categoryId, { anchor: actionButton });
    return;
  }
  if (actionButton?.dataset.action === 'bulk-organize') {
    openBulkOrganizeDialog();
    return;
  }
  const categoryTask = event.target.closest('[data-category-task-id]');
  if (categoryTask) {
    openCategoryTask(categoryTask.dataset.categoryTaskId, categoryTask.dataset.categoryId);
    return;
  }
  const categoryName = event.target.closest('.category-name');
  if (categoryName && event.detail >= 2) {
    event.preventDefault();
    event.stopPropagation();
    startCategoryNameEdit(categoryName.closest('[data-category-row-id]')?.dataset.categoryRowId);
    return;
  }
  const categoryButton = event.target.closest('[data-category-id]');
  if (categoryButton) setActiveCategory(categoryButton.dataset.categoryId);
});

categoryList.addEventListener('dblclick', event => {
  const categoryName = event.target.closest('.category-name');
  if (!categoryName) return;
  event.preventDefault();
  event.stopPropagation();
  startCategoryNameEdit(categoryName.closest('[data-category-row-id]')?.dataset.categoryRowId);
});

categoryList.addEventListener('keydown', event => {
  const row = event.target.closest('[data-category-row-id]');
  const categoryId = row?.dataset.categoryRowId;
  if (!categoryId || !getCategoryById(categoryId)) return;
  if (event.key === 'F2') {
    event.preventDefault();
    startCategoryNameEdit(categoryId);
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    const anchor = row.querySelector('.group-nav-item');
    openCategoryContextMenu(categoryId, { anchor });
  }
});

categoryList.addEventListener('contextmenu', event => {
  const rowHeader = event.target.closest('.category-row');
  const row = rowHeader?.closest('[data-category-row-id]');
  if (!row || !getCategoryById(row.dataset.categoryRowId)) return;
  event.preventDefault();
  openCategoryContextMenu(row.dataset.categoryRowId, {
    x: event.clientX,
    y: event.clientY,
    anchor: row.querySelector('.group-nav-item'),
  });
});

categoryContextMenu.addEventListener('click', event => {
  const menuItem = event.target.closest('[data-category-menu-action]');
  const categoryId = contextMenuCategoryId;
  if (!menuItem || !categoryId) return;
  const action = menuItem.dataset.categoryMenuAction;
  closeCategoryContextMenu();
  if (action === 'rename') startCategoryNameEdit(categoryId);
  else if (action === 'delete') openDeleteCategoryDialog(categoryId);
});

datePlanMenu.addEventListener('click', event => {
  const menuItem = event.target.closest('[data-date-plan-action]');
  const itemId = datePlanItemId;
  if (!menuItem || !itemId || menuItem.disabled) return;
  const action = menuItem.dataset.datePlanAction;
  const returnFocus = datePlanReturnFocus;
  const plannedDate = action === 'today'
    ? getPlannedViewConfig(TODAY_CATEGORY_ID).dateKey
    : action === 'tomorrow'
      ? getPlannedViewConfig(TOMORROW_CATEGORY_ID).dateKey
      : null;
  closeDatePlanMenu();
  void setTodoPlannedDate(itemId, plannedDate, { returnFocus });
});

datePlanMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDatePlanMenu({ restoreFocus: true });
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...datePlanMenu.querySelectorAll('button:not(:disabled)')];
  if (items.length === 0) return;
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : event.key === 'ArrowDown'
        ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex].focus();
});

categoryList.addEventListener('dragstart', (event) => {
  const dragHeader = event.target.closest('[data-category-drag-id]');
  const row = event.target.closest('[data-category-row-id]');
  if (!dragHeader || !row || draggedId || event.target.closest('[data-action]')) {
    event.preventDefault();
    return;
  }
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
accountMenuToggle.addEventListener('click', event => {
  event.stopPropagation();
  setAccountMenuOpen(accountMenuPanel.hidden);
});
accountMenuPanel.addEventListener('click', event => event.stopPropagation());
settingsBtn.addEventListener('click', showSettings);
settingsCloseBtn.addEventListener('click', showTaskWorkspace);

document.addEventListener('click', event => {
  if (!sidebarProfileArea.contains(event.target)) setAccountMenuOpen(false);
  if (!datePlanMenu.contains(event.target)
    && !event.target.closest('[data-action="open-date-menu"]')) {
    closeDatePlanMenu();
  }
  if (!categoryContextMenu.contains(event.target)
    && !event.target.closest('[data-action="open-category-menu"]')) {
    closeCategoryContextMenu();
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!datePlanMenu.hidden) {
    event.preventDefault();
    closeDatePlanMenu({ restoreFocus: true });
    return;
  }
  if (!categoryContextMenu.hidden) {
    event.preventDefault();
    closeCategoryContextMenu({ restoreFocus: true });
    return;
  }
  if (!accountMenuPanel.hidden) {
    event.preventDefault();
    setAccountMenuOpen(false);
    accountMenuToggle.focus();
  }
});

window.addEventListener('resize', () => {
  closeCategoryContextMenu();
  closeDatePlanMenu();
});
window.addEventListener('scroll', () => {
  closeCategoryContextMenu();
  closeDatePlanMenu();
}, true);

showSidebarTimeSetting.addEventListener('change', () => setSidebarTimeVisible(showSidebarTimeSetting.checked, { persist: true }));
showQuoteSetting.addEventListener('change', () => setSidebarQuoteVisible(showQuoteSetting.checked, { persist: true }));
showTaskTimesSetting.addEventListener('change', () => setTimeVisibility(showTaskTimesSetting.checked, { persist: true }));

document.getElementById('categoryForm').addEventListener('submit', submitCategoryForm);
document.getElementById('deleteCategoryForm').addEventListener('submit', submitDeleteCategory);
document.getElementById('moveForm').addEventListener('submit', submitMoveForm);
document.getElementById('bulkOrganizeForm').addEventListener('submit', submitBulkOrganize);
completionGoalForm.addEventListener('submit', saveCompletionGoal);
completionGoalDate.addEventListener('change', () => {
  const editingGoal = getEditingCompletionGoal();
  const isChangingEditingDate = editingGoal && editingGoal.targetDate !== completionGoalDate.value;
  syncCompletionGoalFormForDate({
    preferredGoalId: isChangingEditingDate ? editingGoal.id : null,
    preserveContent: Boolean(isChangingEditingDate),
  });
});
deleteCompletionGoalBtn.addEventListener('click', () => void deleteCompletionGoal());
document.getElementById('usePreviousGoalBtn').addEventListener('click', () => {
  const item = getActiveCompletionGoalItem();
  const previous = item?.completionGoals?.find(goal => goal.id === completionGoalCarried.dataset.goalId);
  if (previous) {
    completionGoalContent.value = previous.content;
    completionGoalContent.focus();
  }
});
completionGoalHistoryToggle.addEventListener('click', () => {
  const expanded = completionGoalHistory.hidden;
  completionGoalHistory.hidden = !expanded;
  completionGoalHistoryToggle.setAttribute('aria-expanded', String(expanded));
});
completionGoalHistory.addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-goal-id]');
  if (deleteButton) {
    void deleteCompletionGoal(deleteButton.dataset.deleteGoalId);
    return;
  }
  if (event.target.closest('[data-goal-history-more]')) {
    completionGoalHistoryLimit += 5;
    renderCompletionGoalHistory();
    return;
  }
  const historyButton = event.target.closest('[data-goal-history-id]');
  if (!historyButton) return;
  syncCompletionGoalFormForDate({ preferredGoalId: historyButton.dataset.goalHistoryId });
  completionGoalContent.focus();
});
completionGoalDialog.addEventListener('close', resetCompletionGoalDialog);
completionReviewForm.addEventListener('submit', saveCompletionReview);
completionReviewDate.addEventListener('change', () => {
  const editingReview = getEditingCompletionReview();
  const isChangingEditingDate = editingReview && editingReview.reviewDate !== completionReviewDate.value;
  syncCompletionReviewFormForDate({
    preferredReviewId: isChangingEditingDate ? editingReview.id : null,
    preserveContent: Boolean(isChangingEditingDate),
  });
});
completionReviewContent.addEventListener('input', updateCompletionReviewContentCount);
deleteCompletionReviewBtn.addEventListener('click', () => void deleteCompletionReview());
document.getElementById('editCompletionReviewGoalBtn').addEventListener('click', () => {
  const todoId = completionReviewTodoId;
  const targetDate = completionReviewDate.value;
  const returnFocus = completionReviewReturnFocus;
  completionReviewDialog.close();
  requestAnimationFrame(() => openCompletionGoalDialog(todoId, { targetDate, returnFocus }));
});
completionReviewHistoryToggle.addEventListener('click', () => {
  const expanded = completionReviewHistory.hidden;
  completionReviewHistory.hidden = !expanded;
  completionReviewHistoryToggle.setAttribute('aria-expanded', String(expanded));
});
completionReviewHistory.addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-review-id]');
  if (deleteButton) {
    void deleteCompletionReview(deleteButton.dataset.deleteReviewId);
    return;
  }
  if (event.target.closest('[data-review-history-more]')) {
    completionReviewHistoryLimit += 5;
    renderCompletionReviewHistory();
    return;
  }
  const historyButton = event.target.closest('[data-review-history-id]');
  if (!historyButton) return;
  syncCompletionReviewFormForDate({ preferredReviewId: historyButton.dataset.reviewHistoryId });
  completionReviewContent.focus();
});
completionReviewDialog.addEventListener('close', resetCompletionReviewDialog);
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

  const nextLocalDateKey = getLocalDateKey(now);
  if (nextLocalDateKey !== currentLocalDateKey) {
    currentLocalDateKey = nextLocalDateKey;
    setDailyQuote();
    if (activeUserId) render();
  }
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
      const dialogState = completionGoalDialog.open && completionGoalTodoId
        ? {
            todoId: completionGoalTodoId,
            targetDate: completionGoalDate.value,
            goalId: completionGoalEditingId,
            historyExpanded: !completionGoalHistory.hidden,
          }
        : null;
      const reviewDialogState = completionReviewDialog.open && completionReviewTodoId
        ? {
            todoId: completionReviewTodoId,
            reviewDate: completionReviewDate.value,
            reviewId: completionReviewEditingId,
            result: getSelectedCompletionReviewResult(),
            content: completionReviewContent.value,
            historyExpanded: !completionReviewHistory.hidden,
          }
        : null;
      await Promise.all([loadCategories(), loadTodos()]);
      if (activeUserId !== expectedUserId) return;
      openDescriptions = loadOpenDescriptions(todos);
      render();
      if (dialogState && findTodoItem(dialogState.todoId)) {
        completionGoalDate.value = dialogState.targetDate;
        syncCompletionGoalFormForDate({ preferredGoalId: dialogState.goalId });
        completionGoalHistory.hidden = !dialogState.historyExpanded;
        completionGoalHistoryToggle.setAttribute('aria-expanded', String(dialogState.historyExpanded));
      }
      if (reviewDialogState && findTodoItem(reviewDialogState.todoId)) {
        completionReviewDate.value = reviewDialogState.reviewDate;
        syncCompletionReviewFormForDate({ preferredReviewId: reviewDialogState.reviewId });
        setSelectedCompletionReviewResult(reviewDialogState.result);
        completionReviewContent.value = reviewDialogState.content;
        updateCompletionReviewContentCount();
        completionReviewHistory.hidden = !reviewDialogState.historyExpanded;
        completionReviewHistoryToggle.setAttribute('aria-expanded', String(reviewDialogState.historyExpanded));
      }
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
  activeCategoryId = TODAY_CATEGORY_ID;

  activeList.innerHTML = '<li class="empty-state"><p>正在从云端加载...</p></li>';
  completedSection.hidden = true;
  try {
    await Promise.all([loadCategories(), loadTodos()]);
    if (sessionVersion !== appSessionVersion || activeUserId !== user.id) return;
    restoreCategoryNavigationState(user.id);
    restorePlannedComposerCategory(user.id);
    restoreExpandedCompletedSubtasks(user.id);
    openDescriptions = loadOpenDescriptions(todos);
    render();
    [todoChannel, categoryChannel, completionGoalChannel, completionReviewChannel] = await Promise.all([
      subscribeTodoChanges(user.id, handleRealtimeTodoChange),
      subscribeCategoryChanges(user.id, scheduleRealtimeRefresh),
      subscribeCompletionGoalChanges(user.id, scheduleRealtimeRefresh),
      subscribeCompletionReviewChanges(user.id, scheduleRealtimeRefresh),
    ]);
  } catch (error) {
    if (sessionVersion !== appSessionVersion) return;
    showCloudError(error);
    activeList.innerHTML = '<li class="empty-state"><p>云端数据加载失败，请先执行最新的数据库建表语句。</p></li>';
  }
}

function stopTodoApp() {
  appSessionVersion += 1;
  closeCategoryContextMenu();
  closeDatePlanMenu();
  if (completionGoalDialog.open) completionGoalDialog.close();
  if (completionReviewDialog.open) completionReviewDialog.close();
  if (deleteCategoryDialog.open) deleteCategoryDialog.close();
  activeUserId = null;
  clearTimeout(realtimeRefreshTimer);
  pendingRealtimeEchoes.clear();
  pendingDescriptionSaves.clear();
  pendingCollapseUpdates.clear();
  pendingCompletedSubtaskMoves.forEach(timer => clearTimeout(timer));
  pendingCompletedSubtaskMoves.clear();
  recentLocalCreates.clear();
  recentLocalDeletes.clear();
  unsubscribeTodoChanges(todoChannel);
  unsubscribeCategoryChanges(categoryChannel);
  unsubscribeCompletionGoalChanges(completionGoalChannel);
  unsubscribeCompletionReviewChanges(completionReviewChannel);
  todoChannel = null;
  categoryChannel = null;
  completionGoalChannel = null;
  completionReviewChannel = null;
  setCurrentUser(null);
  openDescriptions = new Set();
  expandedCategoryIds = new Set();
  expandedCompletedSubtaskTodoIds = new Set();
  setTimeVisibility(false);
  setSidebarCollapsed(false);
  setCompletedExpanded(false);
  setSidebarTimeVisible(true);
  setSidebarQuoteVisible(true);
  activeCategoryId = TODAY_CATEGORY_ID;
  plannedComposerCategoryId = null;
}

window.addEventListener('beforeunload', () => {
  unsubscribeTodoChanges(todoChannel);
  unsubscribeCategoryChanges(categoryChannel);
  unsubscribeCompletionGoalChanges(completionGoalChannel);
  unsubscribeCompletionReviewChanges(completionReviewChannel);
});
initAppShell();
