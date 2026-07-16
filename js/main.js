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

async function addTodo() {
  const text = input.value.trim();
  if (!text) return;
  try {
    const todo = await createTodoRecord({ text, position: todos.length });
    todos.push(todo);
    input.value = '';
    input.focus();
    render();
  } catch (error) {
    showCloudError(error);
  }
}

async function toggleTodo(id) {
  const t = todos.find(t => t.id === id);
  if (t) {
    const done = !t.done;
    const completedAt = done ? Date.now() : null;
    try {
      await updateTodoRecord(id, { done, completedAt });
      t.done = done;
      t.completedAt = completedAt;
      render();
    } catch (error) {
      await restoreCloudState(error);
    }
  }
}

async function toggleSubtask(todoId, subId) {
  const t = todos.find(t => t.id === todoId);
  if (!t) return;
  const sub = t.subtasks.find(s => s.id === subId);
  if (sub) {
    const done = !sub.done;
    const completedAt = done ? Date.now() : null;
    const siblingStates = t.subtasks.map(item => item.id === subId ? done : item.done);
    const parentDone = siblingStates.every(Boolean);
    const parentCompletedAt = parentDone ? (t.completedAt || Date.now()) : null;

    // 双向同步：所有子任务完成 → 父任务完成；有子任务取消 → 父任务取消
    try {
      await Promise.all([
        updateTodoRecord(subId, { done, completedAt }),
        updateTodoRecord(todoId, { done: parentDone, completedAt: parentCompletedAt }),
      ]);
      sub.done = done;
      sub.completedAt = completedAt;
      t.done = parentDone;
      t.completedAt = parentCompletedAt;
      render();
    } catch (error) {
      await restoreCloudState(error);
    }
  }
}

async function addSubtask(todoId, text) {
  const t = todos.find(t => t.id === todoId);
  if (t && text.trim()) {
    try {
      const operations = [createTodoRecord({
        text: text.trim(),
        parentId: todoId,
        position: t.subtasks.length,
      })];
      if (t.done) {
        operations.push(updateTodoRecord(todoId, { done: false, completedAt: null }));
      }
      const [subtask] = await Promise.all(operations);
      t.subtasks.push(subtask);
      if (t.done) {
        t.done = false;
        t.completedAt = null;
      }
      render();
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
    await deleteTodoRecord(subId);
    const t = todos.find(t => t.id === todoId);
    if (t) t.subtasks = t.subtasks.filter(s => s.id !== subId);
    openDescriptions.delete(`${todoId}:${subId}`);
    render();
  } catch (error) {
    await restoreCloudState(error);
  }
}

async function deleteTodo(id) {
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (!item) return;
  item.classList.add('removing');
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    await deleteTodoRecord(id);
    todos = todos.filter(t => t.id !== id);
    for (const key of openDescriptions) {
      if (key === id || key.startsWith(`${id}:`)) openDescriptions.delete(key);
    }
    render();
  } catch (error) {
    await restoreCloudState(error);
  }
}

async function clearCompleted() {
  const doneIds = new Set(todos.filter(t => t.done).map(t => t.id));
  try {
    await deleteTodoRecords([...doneIds]);
    todos = todos.filter(t => !t.done);
    // 清理已删除任务的描述展开状态
    for (const key of openDescriptions) {
      const id = key.split(':')[0];
      if (doneIds.has(id)) openDescriptions.delete(key);
    }
    render();
  } catch (error) {
    await restoreCloudState(error);
  }
}

// ============================================================
// 任务详情描述
// ============================================================

async function toggleDescription(todoId, subId) {
  const key = subId ? `${todoId}:${subId}` : todoId;
  const todo = todos.find(item => item.id === todoId);
  const target = subId ? todo?.subtasks.find(item => item.id === subId) : todo;
  if (!target) return;

  const descriptionOpen = !openDescriptions.has(key);
  try {
    await updateTodoRecord(target.id, { descriptionOpen });
    target.descriptionOpen = descriptionOpen;
    if (descriptionOpen) openDescriptions.add(key);
    else openDescriptions.delete(key);
    render();
  } catch (error) {
    await restoreCloudState(error);
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

  const save = async () => {
    if (saved) return;
    saved = true;
    const newDesc = textarea.value.trim();
    const key = subId ? `${todoId}:${subId}` : todoId;
    const target = subId ? t.subtasks.find(s => s.id === subId) : t;
    if (!target) return;

    try {
      const changes = { description: newDesc };
      // 清空描述时同时收起，避免渲染空框
      if (!newDesc) changes.descriptionOpen = false;
      await updateTodoRecord(target.id, changes);
      target.description = newDesc;
      if (!newDesc) {
        target.descriptionOpen = false;
        openDescriptions.delete(key);
      }
      render();
    } catch (error) {
      await restoreCloudState(error);
    }
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      saved = true; // 阻止 blur 保存
      render(); // 重新渲染恢复原始内容
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
      save();
    }
  });
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));

  displayEl.replaceWith(textarea);
  textarea.focus();
  requestAnimationFrame(() => autoResizeTextarea(textarea));

  // 阻止描述按钮在 textarea 打开时 stealing focus（避免 blur→save→render→click 重新展开的竞态）
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

function render() {
  const filtered = todos.filter(t => {
    if (currentFilter === 'active') return !t.done;
    if (currentFilter === 'completed') return t.done;
    return true;
  });

  if (filtered.length === 0) {
    const icon = todos.length === 0 ? '🚀' : '🎉';
    const title = todos.length === 0 ? '准备好开始了吗？' : '全部搞定！';
    const desc = todos.length === 0 ? '添加你的第一个任务吧' : '你太棒了，继续保持！';
    list.innerHTML = `
      <li class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3>${title}</h3>
        <p>${desc}</p>
      </li>`;
  } else {
    list.innerHTML = filtered.map(t => {
      const subtaskCount = t.subtasks.length;
      const doneCount = t.subtasks.filter(s => s.done).length;
      const subProgress = subtaskCount > 0
        ? Math.round((doneCount / subtaskCount) * 100)
        : 0;

      const subAddRowHtml = `
          <div class="subtask-add-row" id="sub-add-${t.id}" style="display:none;">
            <input type="text" placeholder="输入子任务内容，回车确认" data-action="sub-input" data-todo-id="${t.id}" />
            <button class="sub-confirm" data-action="confirm-sub" data-todo-id="${t.id}">添加</button>
          </div>`;

      const subtasksHtml = subtaskCount > 0 ? `
        <div class="subtask-section ${t.collapsed ? 'collapsed' : ''}">
          <ul class="subtask-list">
            ${t.subtasks.map(s => `
              <li class="subtask-item ${s.done ? 'done' : ''}" data-todo-id="${t.id}" data-id="${s.id}" draggable="true">
                <div class="subtask-main">
                  <span class="subtask-drag-handle" title="拖拽排序">⋮⋮</span>
                  <div class="subtask-checkbox" data-action="toggle-sub" data-todo-id="${t.id}" data-sub-id="${s.id}">
                    <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
                  </div>
                  <span class="subtask-text">${escapeHtml(s.text)}</span>
                  <button class="subtask-desc-btn ${s.description ? 'has-desc' : ''}" data-action="toggle-desc" data-todo-id="${t.id}" data-sub-id="${s.id}" title="详情描述">
                    <svg class="desc-icon" viewBox="0 0 16 16" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
                      <path d="M5.5 6.5h5M5.5 9h3.5"/>
                    </svg>
                  </button>
                  <span class="subtask-time">${formatTime(s.createdAt)}${s.done && s.completedAt ? ' · ' + formatTime(s.completedAt) : ''}</span>
                  <button class="subtask-delete" data-action="delete-sub" data-todo-id="${t.id}" data-sub-id="${s.id}" title="删除">×</button>
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
            <span class="drag-handle" title="拖拽排序">⋮⋮</span>
            <div class="checkbox" data-action="toggle">
              <svg viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4" /></svg>
            </div>
            ${subtaskCount > 0 ? `<span class="collapse-toggle" data-action="toggle-collapse" data-id="${t.id}" title="${t.collapsed ? '展开子任务' : '折叠子任务'}">
              <svg class="collapse-chevron ${t.collapsed ? 'collapsed' : ''}" viewBox="0 0 12 12"><polyline points="2,3 6,8 10,3" /></svg>
            </span>` : ''}
            <div class="todo-body">
              <div class="todo-text">${t.collapsed && subtaskCount > 0 ? `<span class="progress-badge">${doneCount}/${subtaskCount}</span>` : ''}${escapeHtml(t.text)}</div>
              <div class="task-time">创建于 ${formatTime(t.createdAt)}${t.done && t.completedAt ? ' · 完成于 ' + formatTime(t.completedAt) : ''}</div>
              ${t.description || openDescriptions.has(t.id) ? `<div class="desc-section" data-id="${t.id}" style="display: ${openDescriptions.has(t.id) ? 'block' : 'none'};">
                <div class="desc-display">${t.description ? escapeHtml(t.description) : ''}</div>
              </div>` : ''}
              ${subtasksHtml}
            </div>
            <div class="todo-actions">
              <button class="action-btn sub-add-action" data-action="show-sub-add" data-todo-id="${t.id}" title="添加子任务">+</button>
              <button class="action-btn edit-btn" data-action="start-edit" data-id="${t.id}" title="编辑标题">✎</button>
              <button class="action-btn desc-btn ${t.description ? 'has-desc' : ''} ${openDescriptions.has(t.id) ? 'desc-open' : ''}" data-action="toggle-desc" data-id="${t.id}" title="详情描述">
                <svg class="desc-chevron" viewBox="0 0 12 12" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="2,3 6,8 10,3"/>
                </svg>
              </button>
              <button class="action-btn" data-action="delete" data-id="${t.id}" title="删除">✕</button>
            </div>
          </div>
        </li>
      `;
    }).join('');
  }

  const activeCount = todos.filter(t => !t.done).length;
  const total = todos.length;
  countText.textContent = total === 0 ? '暂无任务' : `待办 ${activeCount} · 共 ${total} 个`;
  clearBtn.style.display = todos.some(t => t.done) ? 'inline-block' : 'none';
  updateProgress();
  updateSideStats();
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
  const finish = async () => {
    const newText = textEl.textContent.trim();
    if (!cancelled && newText && newText !== originalText) {
      try {
        await updateTodoRecord(id, { text: newText });
        t.text = newText;
      } catch (error) {
        await restoreCloudState(error);
        return;
      }
    }
    textEl.contentEditable = 'false';
    textEl.classList.remove('editing');
    render();
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') {
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
  const finish = async () => {
    const newText = textEl.textContent.trim();
    if (!cancelled && newText && newText !== originalText) {
      try {
        await updateTodoRecord(subId, { text: newText });
        sub.text = newText;
      } catch (error) {
        await restoreCloudState(error);
        return;
      }
    }
    textEl.contentEditable = 'false';
    textEl.classList.remove('editing');
    render();
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') {
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
      await saveTodoPositions();
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
    await saveTodoPositions();
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
    toggleTodo(todoId);
  } else if (action === 'delete') {
    deleteTodo(actionEl.dataset.id);
  } else if (action === 'toggle-sub') {
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
      updateTodoRecord(t.id, { collapsed })
        .then(() => {
          t.collapsed = collapsed;
          render();
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
  if (e.target.dataset.action === 'sub-input' && e.key === 'Enter') {
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
  if (e.key === 'Enter') addTodo();
});

// 过滤按钮
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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

function scheduleRealtimeRefresh() {
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = setTimeout(async () => {
    try {
      await loadTodos();
      openDescriptions = loadOpenDescriptions(todos);
      render();
    } catch (error) {
      console.error('实时同步刷新失败:', error);
    }
  }, 150);
}

async function initApp() {
  createParticles();
  setDailyQuote();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  initTheme();

  list.innerHTML = '<li class="empty-state"><p>正在从云端加载...</p></li>';
  try {
    await loadTodos();
    openDescriptions = loadOpenDescriptions(todos);
    render();
    todoChannel = subscribeTodoChanges(scheduleRealtimeRefresh);
  } catch (error) {
    showCloudError(error);
    list.innerHTML = '<li class="empty-state"><p>云端数据加载失败，请检查建表语句与网络连接。</p></li>';
  }
}

window.addEventListener('beforeunload', () => unsubscribeTodoChanges(todoChannel));
initApp();
