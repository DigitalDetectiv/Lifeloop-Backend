import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { matchesDate, todayDateString } from '../services/recurrence.js';

function toPublic(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    folderNodeId: row.folder_node_id,
    title: row.title,
    time: row.scheduled_time,
    dueDate: row.due_date,
    isRecurring: row.is_recurring,
    recurrenceRule: row.recurrence_rule,
    done: row.done,
    sortOrder: row.sort_order
  };
}

// Shared by listToday and listByDate (and used internally by the chat
// feature to pull a "tomorrow" snapshot) - one-time tasks due on the
// given date, plus recurring tasks whose rule matches that date, each
// with `done` resolved against that specific date.
export async function getTasksForDate(userId, dateString) {
  const { rows: oneTime } = await query(
    `SELECT * FROM tasks
     WHERE user_id = $1 AND is_recurring = FALSE AND due_date = $2
     ORDER BY scheduled_time ASC NULLS LAST, sort_order ASC`,
    [userId, dateString]
  );

  const { rows: recurring } = await query(
    `SELECT t.*, (tc.id IS NOT NULL) AS completed_that_day
     FROM tasks t
     LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.completed_date = $2
     WHERE t.user_id = $1 AND t.is_recurring = TRUE
     ORDER BY t.scheduled_time ASC NULLS LAST, t.sort_order ASC`,
    [userId, dateString]
  );

  const targetDate = new Date(`${dateString}T00:00:00`);
  const recurringOnDate = recurring
    .filter((t) => matchesDate(t.recurrence_rule, targetDate))
    .map((t) => ({ ...toPublic(t), done: t.completed_that_day }));

  return [...oneTime.map(toPublic), ...recurringOnDate].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

// GET /api/tasks/today
export const listToday = asyncHandler(async (req, res) => {
  const tasks = await getTasksForDate(req.userId, todayDateString());
  res.json({ tasks });
});

// GET /api/tasks/by-date?date=YYYY-MM-DD
export const listByDate = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new ApiError(400, 'date query param must be YYYY-MM-DD.');
  const tasks = await getTasksForDate(req.userId, date);
  res.json({ tasks });
});

// GET /api/tasks/range?start=YYYY-MM-DD&end=YYYY-MM-DD
// Powers the Calendar's week view - returns { "2026-09-28": [...tasks], ... }
// for every date in the (inclusive) range. Capped at 31 days so a typo in
// the query params can't trigger an unbounded number of queries.
export const listRange = asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    throw new ApiError(400, 'start and end query params must be YYYY-MM-DD.');
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const days = Math.round((endDate - startDate) / 86400000) + 1;
  if (days < 1 || days > 31) throw new ApiError(400, 'Range must be between 1 and 31 days.');

  const result = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    result[dateStr] = await getTasksForDate(req.userId, dateStr);
  }

  res.json({ tasksByDate: result });
});

// GET /api/tasks?folderNodeId=xxx
// All tasks inside a given list-type folder node (Finance/Health/Todos/
// Idea vault context). Recurring tasks resolve `done` against today too.
export const listByFolderNode = asyncHandler(async (req, res) => {
  const { folderNodeId } = req.query;
  if (!folderNodeId) throw new ApiError(400, 'folderNodeId query param is required.');

  const today = todayDateString();
  const { rows } = await query(
    `SELECT t.*, (tc.id IS NOT NULL) AS completed_today
     FROM tasks t
     LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.completed_date = $2
     WHERE t.user_id = $1 AND t.folder_node_id = $3
     ORDER BY t.sort_order ASC`,
    [req.userId, today, folderNodeId]
  );

  const tasks = rows.map((t) => (t.is_recurring ? { ...toPublic(t), done: t.completed_today } : toPublic(t)));
  res.json({ tasks });
});

export const createTask = asyncHandler(async (req, res) => {
  const { categoryId, folderNodeId, title, time, dueDate, isRecurring, recurrenceRule } = req.body;
  if (!categoryId || !title) throw new ApiError(400, 'categoryId and title are required.');
  if (isRecurring && !recurrenceRule) throw new ApiError(400, 'recurrenceRule is required for recurring tasks.');

  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE user_id = $1 AND folder_node_id IS NOT DISTINCT FROM $2',
    [req.userId, folderNodeId || null]
  );

  const { rows } = await query(
    `INSERT INTO tasks (user_id, category_id, folder_node_id, title, scheduled_time, due_date, is_recurring, recurrence_rule, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      req.userId,
      categoryId,
      folderNodeId || null,
      title.trim(),
      time || null,
      isRecurring ? null : dueDate || null,
      Boolean(isRecurring),
      isRecurring ? recurrenceRule : null,
      maxRows[0].next
    ]
  );
  res.status(201).json({ task: toPublic(rows[0]) });
});

export const updateTask = asyncHandler(async (req, res) => {
  const { title, time, dueDate, sortOrder } = req.body;
  const { rows } = await query(
    `UPDATE tasks
     SET title = COALESCE($1, title),
         scheduled_time = COALESCE($2, scheduled_time),
         due_date = COALESCE($3, due_date),
         sort_order = COALESCE($4, sort_order)
     WHERE id = $5 AND user_id = $6
     RETURNING *`,
    [title, time, dueDate, sortOrder, req.params.id, req.userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'Task not found.');
  res.json({ task: toPublic(rows[0]) });
});

// POST /api/tasks/:id/toggle
// One-time tasks flip their `done` column. Recurring tasks toggle *today's*
// completion row instead, so the task definition itself never gets marked
// "done" forever - see task_completions in schema.sql for why.
export const toggleTask = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) throw new ApiError(404, 'Task not found.');
  const task = rows[0];
  const today = todayDateString();

  if (!task.is_recurring) {
    const updated = await query('UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING *', [task.id]);
    return res.json({ task: toPublic(updated.rows[0]) });
  }

  const { rows: existing } = await query(
    'SELECT id FROM task_completions WHERE task_id = $1 AND completed_date = $2',
    [task.id, today]
  );

  if (existing.length > 0) {
    await query('DELETE FROM task_completions WHERE id = $1', [existing[0].id]);
    return res.json({ task: { ...toPublic(task), done: false } });
  }

  await query('INSERT INTO task_completions (task_id, completed_date) VALUES ($1, $2)', [task.id, today]);
  res.json({ task: { ...toPublic(task), done: true } });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) throw new ApiError(404, 'Task not found.');
  res.status(204).end();
});
