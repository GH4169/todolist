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
let currentUserId = null;

function setCurrentUser(user) {
  currentUserId = user?.id || null;
  todos = [];
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
    text: row.text,
    done: row.is_completed,
    subtasks: [],
    collapsed: row.is_collapsed,
    descriptionOpen: row.is_description_open,
    position: row.position,
    createdAt: parseTime(row.created_at),
    completedAt: parseTime(row.completed_at),
    description: row.description || '',
  };
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
  const { data, error } = await supabaseClient
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const items = data.map(mapRow);
  const parents = items.filter(item => !item.parentId);
  const parentById = new Map(parents.map(item => [item.id, item]));

  for (const item of items) {
    if (item.parentId && parentById.has(item.parentId)) {
      parentById.get(item.parentId).subtasks.push(item);
    }
  }

  todos = parents;
  return todos;
}

/** 新增父任务或子任务，并返回服务器生成 ID 后的完整记录。 */
async function createTodoRecord({ text, parentId = null, position = 0 }) {
  const userId = requireCurrentUserId();
  const { data, error } = await supabaseClient
    .from('todos')
    .insert({
      text,
      user_id: userId,
      parent_id: parentId,
      position,
    })
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
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

function unsubscribeTodoChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}
