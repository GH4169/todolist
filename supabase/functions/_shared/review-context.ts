import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const MAX_EVIDENCE_ITEMS = 200;
const MAX_CONTEXT_CHARACTERS = 80000;

type BuildOptions = {
  userId: string;
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  locale: string;
};

function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateReviewRange(start: unknown, end: unknown) {
  if (typeof start !== 'string' || typeof end !== 'string' || !isDateKey(start) || !isDateKey(end)) {
    throw new HttpError(400, 'invalid_date_range', '分析日期范围无效');
  }
  const startTime = Date.parse(`${start}T12:00:00Z`);
  const endTime = Date.parse(`${end}T12:00:00Z`);
  const days = Math.floor((endTime - startTime) / 86400000) + 1;
  if (days < 1 || days > 31) {
    throw new HttpError(400, 'invalid_date_range', '分析范围必须在 1 到 31 天之间');
  }
  return { rangeStart: start, rangeEnd: end };
}

export function validateTimezone(value: unknown) {
  const timezone = typeof value === 'string' && value.length <= 80 ? value : 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new HttpError(400, 'invalid_timezone', '时区无效');
  }
}

export function dateKeyInTimezone(value: string, timezone: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function clip(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function throwQueryError(error: { message?: string } | null) {
  if (error) throw new HttpError(500, 'data_load_failed', '无法读取工作复盘数据');
}

export async function buildReviewContext(userClient: SupabaseClient, options: BuildOptions) {
  const { userId, rangeStart, rangeEnd, timezone, locale } = options;
  const upcomingEnd = addDays(rangeEnd, 7);
  const [todosResult, categoriesResult, goalsResult, reviewsResult, dailyResult, workResult] = await Promise.all([
    userClient.from('todos').select('*').eq('user_id', userId).order('position'),
    userClient.from('todo_categories').select('id,name').eq('user_id', userId),
    userClient.from('todo_completion_goals').select('*').eq('user_id', userId)
      .gte('target_date', rangeStart).lte('target_date', upcomingEnd),
    userClient.from('todo_completion_reviews').select('*').eq('user_id', userId)
      .gte('review_date', rangeStart).lte('review_date', rangeEnd)
      .order('review_date', { ascending: false }),
    userClient.from('daily_reviews').select('*').eq('user_id', userId)
      .gte('review_date', rangeStart).lte('review_date', rangeEnd)
      .order('review_date', { ascending: false }),
    userClient.from('work_reviews').select('*').eq('user_id', userId)
      .eq('range_start', rangeStart).eq('range_end', rangeEnd).maybeSingle(),
  ]);
  [todosResult, categoriesResult, goalsResult, reviewsResult, dailyResult, workResult]
    .forEach(result => throwQueryError(result.error));

  const todos = todosResult.data || [];
  const categories = new Map((categoriesResult.data || []).map(row => [row.id, row.name]));
  const goalsByTodo = new Map<string, Array<Record<string, unknown>>>();
  for (const row of goalsResult.data || []) {
    const values = goalsByTodo.get(row.todo_id) || [];
    values.push({
      id: row.id,
      target_date: row.target_date,
      content: clip(row.content, 500),
    });
    goalsByTodo.set(row.todo_id, values);
  }

  const todoById = new Map(todos.map(row => [row.id, row]));
  const getCategoryName = (row: Record<string, unknown>) => {
    const parent = row.parent_id ? todoById.get(row.parent_id) : null;
    const categoryId = parent?.category_id || row.category_id;
    return categoryId ? categories.get(categoryId) || null : null;
  };
  const taskSummary = (row: Record<string, unknown>) => ({
    id: row.id,
    parent_id: row.parent_id,
    title: clip(row.text, 500),
    description: clip(row.description, 600) || null,
    category: getCategoryName(row),
    planned_date: row.planned_date,
    is_completed: row.is_completed,
    updated_at: row.updated_at,
    completion_goals: goalsByTodo.get(String(row.id)) || [],
  });

  const allReviews = (reviewsResult.data || []).map(row => {
    const todo = todoById.get(row.todo_id);
    if (!todo) return null;
    return {
      evidence_ref: `completion_review:${row.id}`,
      id: row.id,
      review_date: row.review_date,
      result: row.result,
      content: clip(row.content, 500),
      goal_content_snapshot: clip(row.goal_content_snapshot, 500) || null,
      task: taskSummary(todo),
    };
  }).filter(Boolean) as Array<Record<string, unknown>>;

  const latestReviewByTodo = new Map<string, Record<string, unknown>>();
  for (const review of allReviews) {
    const task = review.task as Record<string, unknown>;
    if (!latestReviewByTodo.has(String(task.id))) latestReviewByTodo.set(String(task.id), review);
  }

  const openItems = todos
    .filter(row => {
      if (row.is_completed) return false;
      const latestReview = latestReviewByTodo.get(row.id);
      const unresolved = latestReview && ['partial', 'missed'].includes(String(latestReview.result));
      return (row.planned_date && row.planned_date <= rangeEnd) || unresolved;
    })
    .map(row => ({
      evidence_ref: `todo:${row.id}`,
      ...taskSummary(row),
      latest_review: latestReviewByTodo.get(row.id) || null,
    }))
    .sort((a, b) => String(a.planned_date || '').localeCompare(String(b.planned_date || '')));

  const completedItems = todos
    .filter(row => row.completed_at)
    .map(row => ({ row, completedDate: dateKeyInTimezone(row.completed_at, timezone) }))
    .filter(entry => entry.completedDate >= rangeStart && entry.completedDate <= rangeEnd)
    .map(entry => ({
      evidence_ref: `todo:${entry.row.id}`,
      completed_date: entry.completedDate,
      completed_at: entry.row.completed_at,
      task: taskSummary(entry.row),
    }))
    .sort((a, b) => b.completed_date.localeCompare(a.completed_date));

  const upcomingItems = todos
    .filter(row => !row.is_completed && row.planned_date > rangeEnd && row.planned_date <= upcomingEnd)
    .map(row => ({ evidence_ref: `todo:${row.id}`, ...taskSummary(row) }))
    .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)));

  const dailyReviews = (dailyResult.data || []).map(row => ({
    evidence_ref: `daily_review:${row.id}`,
    id: row.id,
    review_date: row.review_date,
    content: clip(row.content, 3000),
  }));

  const originalTaskEvidenceCount = allReviews.length + openItems.length
    + completedItems.length + upcomingItems.length;
  let remaining = MAX_EVIDENCE_ITEMS;
  const selectedReviews = allReviews.slice(0, remaining);
  remaining -= selectedReviews.length;
  const selectedOpen = openItems.slice(0, remaining);
  remaining -= selectedOpen.length;
  const selectedCompleted = completedItems.slice(0, remaining);
  remaining -= selectedCompleted.length;
  const selectedUpcoming = upcomingItems.slice(0, remaining);

  const limitations: string[] = [];
  let omittedItems = Math.max(0, originalTaskEvidenceCount - MAX_EVIDENCE_ITEMS);

  const assemble = () => {
    const dayByDate = new Map<string, Record<string, unknown>>();
    const ensureDay = (dateKey: string) => {
      if (!dayByDate.has(dateKey)) {
        dayByDate.set(dateKey, { date: dateKey, daily_review: null, completed: [], completion_reviews: [] });
      }
      return dayByDate.get(dateKey)!;
    };
    dailyReviews.forEach(review => { ensureDay(review.review_date).daily_review = review; });
    selectedCompleted.forEach(item => {
      (ensureDay(item.completed_date).completed as unknown[]).push(item);
    });
    selectedReviews.forEach(item => {
      (ensureDay(String(item.review_date)).completion_reviews as unknown[]).push(item);
    });
    const evidenceRefs = new Set<string>();
    const collectRef = (value: unknown) => {
      if (value && typeof value === 'object' && 'evidence_ref' in value) {
        evidenceRefs.add(String((value as Record<string, unknown>).evidence_ref));
      }
    };
    dailyReviews.forEach(collectRef);
    selectedReviews.forEach(collectRef);
    selectedOpen.forEach(collectRef);
    selectedCompleted.forEach(collectRef);
    selectedUpcoming.forEach(collectRef);
    const context = {
      schema_version: '1.0',
      generated_at: new Date().toISOString(),
      timezone,
      locale,
      range: { start_date: rangeStart, end_date: rangeEnd },
      summary_counts: {
        recorded_days: dayByDate.size,
        completed_records: completedItems.length,
        completion_reviews: allReviews.length,
        open_items: openItems.length,
        omitted_items: omittedItems,
      },
      days: [...dayByDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      open_items: selectedOpen,
      upcoming_items: selectedUpcoming,
      human_conclusion: workResult.data ? {
        evidence_ref: `work_review:${workResult.data.id}`,
        content: clip(workResult.data.content, 3000),
      } : null,
      limitations: [
        '任务当前安排日期是计划上下文，不代表该日期真实发生过工作。',
        '已删除或重新打开的任务可能缺少完整历史记录。',
        ...(omittedItems > 0 ? [`共有 ${omittedItems} 条任务证据因上下文限制未纳入分析。`] : []),
        ...limitations,
      ],
    };
    if (context.human_conclusion) collectRef(context.human_conclusion);
    return { context, evidenceRefs };
  };

  let assembled = assemble();
  let descriptionsRemoved = false;
  while (JSON.stringify(assembled.context).length > MAX_CONTEXT_CHARACTERS) {
    if (!descriptionsRemoved) {
      const removeDescriptions = (value: Record<string, unknown>) => {
        if ('description' in value) value.description = null;
        if (value.task && typeof value.task === 'object') {
          (value.task as Record<string, unknown>).description = null;
        }
      };
      [...selectedReviews, ...selectedOpen, ...selectedCompleted, ...selectedUpcoming].forEach(removeDescriptions);
      descriptionsRemoved = true;
      limitations.push('任务描述因上下文长度限制未纳入分析。');
    } else if (selectedUpcoming.length > 0) {
      selectedUpcoming.pop();
      omittedItems += 1;
    } else if (selectedCompleted.length > 0) {
      selectedCompleted.pop();
      omittedItems += 1;
    } else if (selectedOpen.length > 0) {
      selectedOpen.pop();
      omittedItems += 1;
    } else if (selectedReviews.length > 0) {
      selectedReviews.pop();
      omittedItems += 1;
    } else {
      break;
    }
    assembled = assemble();
  }

  return assembled;
}
