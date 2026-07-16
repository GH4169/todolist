// ============================================================
// storage.js - Supabase 数据访问层
// ============================================================

const SUPABASE_URL = 'https://zfxvwlddhxhjumwedsjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CvJ8Fw0wcuvx_ND7BG6H7A_yVqG9xoc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// main.js 使用的内存视图；Supabase 是唯一的任务持久化数据源。
let todos = [];

function parseTime(value) {
  return value ? new Date(value).getTime() : null;
}

function mapRow(row) {
  return {
    id: row.id,
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
  const { data, error } = await supabaseClient
    .from('todos')
    .select('*')
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
  const { data, error } = await supabaseClient
    .from('todos')
    .insert({
      text,
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
  const { data, error } = await supabaseClient
    .from('todos')
    .update(toDatabaseChanges(changes))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** 删除一条记录；删除父任务时，数据库外键会级联删除其子任务。 */
async function deleteTodoRecord(id) {
  const { error } = await supabaseClient
    .from('todos')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** 批量删除已完成的父任务。 */
async function deleteTodoRecords(ids) {
  if (ids.length === 0) return;

  const { error } = await supabaseClient
    .from('todos')
    .delete()
    .in('id', ids);

  if (error) throw error;
}

/** 持久化当前父任务及子任务的拖拽顺序。 */
async function saveTodoPositions() {
  const updates = [];

  todos.forEach((todo, position) => {
    updates.push(updateTodoRecord(todo.id, { position }));
    todo.subtasks.forEach((subtask, subPosition) => {
      updates.push(updateTodoRecord(subtask.id, { position: subPosition }));
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

/** 监听其他设备的增删改，并由 main.js 重新拉取最新数据。 */
function subscribeTodoChanges(onChange) {
  return supabaseClient
    .channel('todos-cloud-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'todos' },
      onChange,
    )
    .subscribe();
}

function unsubscribeTodoChanges(channel) {
  if (channel) supabaseClient.removeChannel(channel);
}
