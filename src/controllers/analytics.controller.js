import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { matchesDate, todayDateString } from '../services/recurrence.js';

export const todayStats = asyncHandler(async (req, res) => {
  const today = todayDateString();

  const { rows: oneTime } = await query(
    'SELECT done FROM tasks WHERE user_id = $1 AND is_recurring = FALSE AND due_date = $2',
    [req.userId, today]
  );

  const { rows: recurring } = await query(
    `SELECT t.id, t.recurrence_rule, (tc.id IS NOT NULL) AS completed_today
     FROM tasks t
     LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.completed_date = $2
     WHERE t.user_id = $1 AND t.is_recurring = TRUE`,
    [req.userId, today]
  );

  const todayDate = new Date();
  const recurringToday = recurring.filter((t) => matchesDate(t.recurrence_rule, todayDate));

  const total = oneTime.length + recurringToday.length;
  const completed =
    oneTime.filter((t) => t.done).length + recurringToday.filter((t) => t.completed_today).length;

  res.json({
    total,
    completed,
    remaining: total - completed,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100)
  });
});

// Current streak: count back from today how many consecutive days had at
// least one completed recurring task. Simple and honest about what it
// measures - a fuller "streak per habit" view can build on top of
// task_completions later without a schema change.
export const currentStreak = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT tc.completed_date
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     WHERE t.user_id = $1
     ORDER BY tc.completed_date DESC`,
    [req.userId]
  );

  const completedDates = new Set(rows.map((r) => r.completed_date.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();

  while (completedDates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  res.json({ streakDays: streak });
});
