import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { askGemini } from '../services/gemini.js';
import { getTasksForDate } from './tasks.controller.js';
import { todayDateString } from '../services/recurrence.js';

function tomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function summarizeTasks(tasks) {
  if (tasks.length === 0) return 'Nothing scheduled.';
  return tasks
    .map((t) => `- ${t.title}${t.time ? ` at ${t.time}` : ''}${t.done ? ' (done)' : ''}`)
    .join('\n');
}

// POST /api/chat
// { message: string, history?: [{role: 'user'|'assistant', text: string}] }
export const sendMessage = asyncHandler(async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) throw new ApiError(400, 'message is required.');

  const { rows } = await query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
  const displayName = rows[0]?.display_name || 'there';

  const [todayTasks, tomorrowTasks] = await Promise.all([
    getTasksForDate(req.userId, todayDateString()),
    getTasksForDate(req.userId, tomorrowDateString())
  ]);

  const systemPrompt = `You are "Loop buddy," a warm, encouraging assistant inside LifeLoop, a personal life-management app (todos, finance, health, journal, calendar). You're talking to ${displayName}.

Here is their real task data. Use it to answer questions, summarize their day, suggest what to prioritize, or just motivate them - don't invent tasks that aren't listed here.

TODAY'S TASKS:
${summarizeTasks(todayTasks)}

TOMORROW'S TASKS:
${summarizeTasks(tomorrowTasks)}

Keep replies short (2-4 sentences unless asked for a full plan), warm, and practical. If asked to "make a plan" or "what's next," suggest a sensible order based on the times/status above.`;

  const reply = await askGemini({
    systemPrompt,
    message: message.trim(),
    history: Array.isArray(history) ? history.slice(-10) : [] // cap context sent per request
  });

  res.json({ reply });
});
