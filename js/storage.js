// ============================================================
// storage.js - Supabase 数据访问层
// ============================================================

const SUPABASE_URL = 'https://zfxvwlddhxhjumwedsjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CvJ8Fw0wcuvx_ND7BG6H7A_yVqG9xoc';
const initialAuthRedirectType = new URLSearchParams(window.location.hash.slice(1)).get('type');

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// main.js 使用的内存视图；Supabase 是唯一的任务持久化数据源。
let todos = [];
let categories = [];
let completionGoals = [];
let completionReviews = [];
let currentUserId = null;

function setCurrentUser(user) {
  currentUserId = user?.id || null;
  todos = [];
  categories = [];
  completionGoals = [];
  completionReviews = [];
}

function requireCurrentUserId() {
  if (!currentUserId) throw new Error('请先登录后再操作任务');
  return currentUserId;
}

function parseTime(value) {
  return value ? new Date(value).getTime() : null;
}

function mapRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    categoryId: row.category_id || null,
    text: row.text,
    done: row.is_completed,
    subtasks: [],
    collapsed: row.is_collapsed,
    descriptionOpen: row.is_description_open,
    position: row.position,
    createdAt: parseTime(row.created_at),
    completedAt: parseTime(row.completed_at),
    description: row.description || '',
    plannedDate: row.planned_date || null,
    completionGoals: [],
    completionReviews: [],
  };
}

function mapCompletionGoalRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    todoId: row.todo_id,
    targetDate: row.target_date,
    content: row.content,
    createdAt: parseTime(row.created_at),
    updatedAt: parseTime(row.updated_at),
  };
}

function compareCompletionGoalDate(a, b) {
  return b.targetDate.localeCompare(a.targetDate)
    || (b.updatedAt || 0) - (a.updatedAt || 0);
}

function mapCompletionReviewRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    todoId: row.todo_id,
    reviewDate: row.review_date,
    result: row.result,
    content: row.content,
    goalContentSnapshot: row.goal_content_snapshot || null,
    createdAt: parseTime(row.created_at),
    updatedAt: parseTime(row.updated_at),
  };
}

// Older deployments may still enforce a non-empty review content constraint.
// Keep blank achieved reviews valid at the UI level while writing a readable
// fallback for those databases; the goal snapshot remains the source of truth.
function normalizeCompletionReviewContent(content, result, goalContentSnapshot) {
  const normalizedContent = content?.trim() || '';
  if (normalizedContent || result !== 'achieved' || !goalContentSnapshot?.trim()) {
    return normalizedContent;
  }
  return '已按目标完成';
}

function compareCompletionReviewDate(a, b) {
  return b.reviewDate.localeCompare(a.reviewDate)
    || (b.updatedAt || 0) - (a.updatedAt || 0);
}

function attachCompletionGoals(items, goals = completionGoals) {
  const itemById = new Map();
  for (const todo of items) {
    todo.completionGoals = [];
    itemById.set(todo.id, todo);
    for (const subtask of todo.subtasks) {
      subtask.completionGoals = [];
      itemById.set(subtask.id, subtask);
    }
  }

  for (const goal of goals) {
    itemById.get(goal.todoId)?.completionGoals.push(goal);
  }
  itemById.forEach(item => item.completionGoals.sort(compareCompletionGoalDate));
}

function attachCompletionReviews(items, reviews = completionReviews) {
  const itemById = new Map();
  for (const todo of items) {
    todo.completionReviews = [];
    itemById.set(todo.id, todo);
    for (const subtask of todo.subtasks) {
      subtask.completionReviews = [];
      itemById.set(subtask.id, subtask);
    }
  }

  for (const review of reviews) {
    itemById.get(review.todoId)?.completionReviews.push(review);
  }
  itemById.forEach(item => item.completionReviews.sort(compareCompletionReviewDate));
}

function toDatabaseChanges(changes) {
  const result = {};
  const mappings = {
    text: 'text',
    done: 'is_completed',
    collapsed: 'is_collapsed',
    descriptionOpen: 'is_description_open',
    description: 'description',
    position: 'position',
    categoryId: 'category_id',
    plannedDate: 'planned_date',
  };

  for (const [appKey, column] of Object.entries(mappings)) {
    if (Object.hasOwn(changes, appKey)) result[column] = changes[appKey];
  }

  if (Object.hasOwn(changes, 'completedAt')) {
    result.completed_at = changes.completedAt
      ? new Date(changes.completedAt).toISOString()
      : null;
  }

  return result;
}

/** 从云端读取所有任务，并组装为父任务/子任务结构。 */
async function loadTodos() {
  const userId = requireCurrentUserId();
  const [{ data, error }, goals, reviews] = await Promise.all([
    supabaseClient
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false }),
    loadCompletionGoals(),
    loadCompletionReviews(),
  ]);

  if (error) throw error;

  const items = data.map(mapRow);
  const parents = items.filter(item => !item.parentId);
  const parentById = new Map(parents.map(item => [item.id, item]));

  for (const item of items) {
    if (item.parentId && parentById.has(item.parentId)) {
      parentById.get(item.parentId).subtasks.push(item);
    }
  }
  parents.forEach(parent => {
    parent.subtasks.sort((a, b) => (a.position - b.position) || (a.createdAt - b.createdAt));
  });

  todos = parents;
  attachCompletionGoals(todos, goals);
  attachCompletionReviews(todos, reviews);
  return todos;
}

async function loadCompletionGoals() {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_completion_goals')
    .select('*')
    .eq('user_id', userId)
    .order('target_date', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  completionGoals = data.map(mapCompletionGoalRow);
  return completionGoals;
}

async function createCompletionGoalRecord({ todoId, targetDate, content }) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_completion_goals')
    .insert({ todo_id: todoId, target_date: targetDate, content: content.trim(), user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return mapCompletionGoalRow(data);
}

async function updateCompletionGoalRecord(id, { targetDate, content }) {
  const userId = requireCurrentUserId();
  const changes = {};
  if (targetDate !== undefined) changes.target_date = targetDate;
  if (content !== undefined) changes.content = content.trim();
  const { data, error } = await supabaseClient
    .from('todo_completion_goals')
    .update(changes)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return mapCompletionGoalRow(data);
}

async function deleteCompletionGoalRecord(id) {
  const userId = requireCurrentUserId();
  const { error } = await supabaseClient
    .from('todo_completion_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

async function upsertCompletionGoalForDate({ todoId, targetDate, content }) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_completion_goals')
    .upsert(
      { todo_id: todoId, target_date: targetDate, content: content.trim(), user_id: userId },
      { onConflict: 'todo_id,target_date' }
    )
    .select()
    .single();

  if (error) throw error;
  return mapCompletionGoalRow(data);
}

async function loadCompletionReviews() {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_completion_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('review_date', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  completionReviews = data.map(mapCompletionReviewRow);
  return completionReviews;
}

async function createCompletionReviewRecord({ todoId, reviewDate, result, content, goalContentSnapshot }) {
  const userId = requireCurrentUserId();
  const normalizedGoalContentSnapshot = goalContentSnapshot?.trim() || null;
  const { data, error } = await supabaseClient
    .from('todo_completion_reviews')
    .insert({
      todo_id: todoId,
      review_date: reviewDate,
      result,
      content: normalizeCompletionReviewContent(content, result, normalizedGoalContentSnapshot),
      goal_content_snapshot: normalizedGoalContentSnapshot,
      user_id: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return mapCompletionReviewRow(data);
}

async function updateCompletionReviewRecord(id, {
  reviewDate,
  result,
  content,
  goalContentSnapshot,
}) {
  const userId = requireCurrentUserId();
  const changes = {};
  const normalizedGoalContentSnapshot = goalContentSnapshot?.trim() || null;
  if (reviewDate !== undefined) changes.review_date = reviewDate;
  if (result !== undefined) changes.result = result;
  if (content !== undefined) {
    changes.content = normalizeCompletionReviewContent(
      content,
      result,
      normalizedGoalContentSnapshot,
    );
  }
  if (goalContentSnapshot !== undefined) {
    changes.goal_content_snapshot = normalizedGoalContentSnapshot;
  }
  const { data, error } = await supabaseClient
    .from('todo_completion_reviews')
    .update(changes)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return mapCompletionReviewRow(data);
}

async function deleteCompletionReviewRecord(id) {
  const userId = requireCurrentUserId();
  const { error } = await supabaseClient
    .from('todo_completion_reviews')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

async function upsertCompletionReviewForDate({
  todoId,
  reviewDate,
  result,
  content,
  goalContentSnapshot,
}) {
  const userId = requireCurrentUserId();
  const normalizedGoalContentSnapshot = goalContentSnapshot?.trim() || null;
  const { data, error } = await supabaseClient
    .from('todo_completion_reviews')
    .upsert({
      todo_id: todoId,
      review_date: reviewDate,
      result,
      content: normalizeCompletionReviewContent(content, result, normalizedGoalContentSnapshot),
      goal_content_snapshot: normalizedGoalContentSnapshot,
      user_id: userId,
    }, { onConflict: 'todo_id,review_date' })
    .select()
    .single();

  if (error) throw error;
  return mapCompletionReviewRow(data);
}

/** 新增父任务或子任务，并返回服务器生成 ID 后的完整记录。 */
async function createTodoRecord({ text, parentId = null, categoryId = null, position = 0, plannedDate = null }) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todos')
    .insert({
      text,
      user_id: userId,
      parent_id: parentId,
      category_id: parentId ? null : categoryId,
      position,
      planned_date: plannedDate,
    })
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    position: row.position,
    createdAt: parseTime(row.created_at),
  };
}

/** 读取当前用户的自定义分组；NULL category_id 由界面显示为“未分组”。 */
async function loadCategories() {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_categories')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  categories = data.map(mapCategoryRow);
  return categories;
}

async function createCategoryRecord({ name, position = 0 }) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todo_categories')
    .insert({ name, position, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return mapCategoryRow(data);
}

async function updateCategoryRecord(id, changes) {
  const userId = requireCurrentUserId();
  const databaseChanges = {};
  if (Object.hasOwn(changes, 'name')) databaseChanges.name = changes.name;
  if (Object.hasOwn(changes, 'position')) databaseChanges.position = changes.position;

  const { data, error } = await supabaseClient
    .from('todo_categories')
    .update(databaseChanges)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return mapCategoryRow(data);
}

async function deleteCategoryRecord(id) {
  const userId = requireCurrentUserId();
  const { error: moveError } = await supabaseClient
    .from('todos')
    .update({ category_id: null })
    .eq('user_id', userId)
    .eq('category_id', id);

  if (moveError) throw moveError;

  const { error } = await supabaseClient
    .from('todo_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

async function saveCategoryPositions() {
  const updates = categories.map((category, position) => {
    category.position = position;
    return updateCategoryRecord(category.id, { position });
  });
  await Promise.all(updates);
}

/** 更新一条父任务或子任务。 */
async function updateTodoRecord(id, changes) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todos')
    .update(toDatabaseChanges(changes))
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** 删除一条记录；删除父任务时，数据库外键会级联删除其子任务。 */
async function deleteTodoRecord(id) {
  const userId = requireCurrentUserId();
  const { error } = await supabaseClient
    .from('todos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/** 批量删除已完成的父任务。 */
async function deleteTodoRecords(ids) {
  if (ids.length === 0) return;

  const userId = requireCurrentUserId();
  const { error } = await supabaseClient
    .from('todos')
    .delete()
    .eq('user_id', userId)
    .in('id', ids);

  if (error) throw error;
}

/** 持久化当前父任务及子任务的拖拽顺序。 */
async function saveTodoPositions(updateRecord = updateTodoRecord) {
  const updates = [];

  todos.forEach((todo, position) => {
    todo.position = position;
    updates.push(updateRecord(todo.id, { position }));
    todo.subtasks.forEach((subtask, subPosition) => {
      subtask.position = subPosition;
      updates.push(updateRecord(subtask.id, { position: subPosition }));
    });
  });

  await Promise.all(updates);
}

/** 将父任务按当前内存顺序重新编号，不改变任何子任务顺序。 */
async function saveParentTodoPositions(updateRecord = updateTodoRecord) {
  const updates = [];

  todos.forEach((todo, position) => {
    if (todo.position === position) return;
    todo.position = position;
    updates.push(updateRecord(todo.id, { position }));
  });

  await Promise.all(updates);
}

/** 描述展开状态也存放在 todos 表中，不再使用 localStorage。 */
function loadOpenDescriptions(items) {
  const open = new Set();

  for (const todo of items) {
    if (todo.descriptionOpen) open.add(todo.id);
    for (const subtask of todo.subtasks) {
      if (subtask.descriptionOpen) open.add(`${todo.id}:${subtask.id}`);
    }
  }

  return open;
}

/** 通过当前用户的私有 Broadcast 频道监听增删改。 */
async function subscribeTodoChanges(userId, onChange) {
  if (!userId || userId !== currentUserId) {
    throw new Error('无法为未登录用户订阅任务');
  }

  await supabaseClient.realtime.setAuth();
  return supabaseClient
    .channel(`todos:${userId}`, { config: { private: true } })
    .on('broadcast', { event: 'INSERT' }, message => onChange('INSERT', message))
    .on('broadcast', { event: 'UPDATE' }, message => onChange('UPDATE', message))
    .on('broadcast', { event: 'DELETE' }, message => onChange('DELETE', message))
    .subscribe();
}

async function subscribeCategoryChanges(userId, onChange) {
  if (!userId || userId !== currentUserId) {
    throw new Error('无法为未登录用户订阅分组');
  }

  await supabaseClient.realtime.setAuth();
  return supabaseClient
    .channel(`todo-categories:${userId}`, { config: { private: true } })
    .on('broadcast', { event: 'INSERT' }, message => onChange('INSERT', message))
    .on('broadcast', { event: 'UPDATE' }, message => onChange('UPDATE', message))
    .on('broadcast', { event: 'DELETE' }, message => onChange('DELETE', message))
    .subscribe();
}

async function subscribeCompletionGoalChanges(userId, onChange) {
  if (!userId || userId !== currentUserId) {
    throw new Error('无法为未登录用户订阅完成目标');
  }

  await supabaseClient.realtime.setAuth();
  return supabaseClient
    .channel(`todo-completion-goals:${userId}`, { config: { private: true } })
    .on('broadcast', { event: 'INSERT' }, message => onChange('INSERT', message))
    .on('broadcast', { event: 'UPDATE' }, message => onChange('UPDATE', message))
    .on('broadcast', { event: 'DELETE' }, message => onChange('DELETE', message))
    .subscribe();
}

async function subscribeCompletionReviewChanges(userId, onChange) {
  if (!userId || userId !== currentUserId) {
    throw new Error('无法为未登录用户订阅完成评价');
  }

  await supabaseClient.realtime.setAuth();
  return supabaseClient
    .channel(`todo-completion-reviews:${userId}`, { config: { private: true } })
    .on('broadcast', { event: 'INSERT' }, message => onChange('INSERT', message))
    .on('broadcast', { event: 'UPDATE' }, message => onChange('UPDATE', message))
    .on('broadcast', { event: 'DELETE' }, message => onChange('DELETE', message))
    .subscribe();
}

function unsubscribeTodoChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}

function unsubscribeCategoryChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}

function unsubscribeCompletionGoalChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}

function unsubscribeCompletionReviewChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}
