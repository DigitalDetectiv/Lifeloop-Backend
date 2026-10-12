import { query } from '../db/pool.js';

// Seeds realistic example data for a brand-new account - or after the
// user explicitly resets their data in Settings. This exists so a new
// account (or an interviewer demo) isn't a completely blank slate; the
// person is guided in Settings to "flush" this back to defaults or clear
// it entirely whenever they want their own clean start.
//
// Structure mirrors the original product spec: Finance/Health/Todos each
// get a couple of folders/lists with a few tasks (mixed recurring +
// specific-date), Idea Vault gets one example project.
export async function seedDemoData(userId, categoriesBySlug) {
  const finance = categoriesBySlug.finance;
  const health = categoriesBySlug.health;
  const todos = categoriesBySlug.lists;
  const ideas = categoriesBySlug.ideas;

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  async function makeNode(categoryId, parentId, type, name) {
    const { rows } = await query(
      `INSERT INTO folder_nodes (user_id, category_id, parent_id, type, name, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, categoryId, parentId, type, name, type === 'notepad' ? '' : null]
    );
    return rows[0].id;
  }

  async function makeTask(categoryId, folderNodeId, title, opts = {}) {
    await query(
      `INSERT INTO tasks (user_id, category_id, folder_node_id, title, scheduled_time, due_date, is_recurring, recurrence_rule)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        categoryId,
        folderNodeId,
        title,
        opts.time || null,
        opts.isRecurring ? null : (opts.dueDate || today),
        Boolean(opts.isRecurring),
        opts.isRecurring ? opts.recurrenceRule : null
      ]
    );
  }

  if (finance) {
    const billsId = await makeNode(finance.id, null, 'list', 'Bills');
    await makeTask(finance.id, billsId, 'Pay electricity bill', { time: '09:00', dueDate: today });
    await makeTask(finance.id, billsId, 'Pay internet bill', { dueDate: tomorrow });

    const budgetId = await makeNode(finance.id, null, 'list', 'Budgeting');
    await makeTask(finance.id, budgetId, 'Review monthly budget', { isRecurring: true, recurrenceRule: { freq: 'weekly', days: [1] } });
  }

  if (health) {
    const habitsId = await makeNode(health.id, null, 'list', 'Daily habits');
    await makeTask(health.id, habitsId, 'Glass of water', { isRecurring: true, recurrenceRule: { freq: 'daily' } });
    await makeTask(health.id, habitsId, 'Morning stretch', { time: '07:30', isRecurring: true, recurrenceRule: { freq: 'daily' } });
  }

  if (todos) {
    const generalId = await makeNode(todos.id, null, 'list', 'General');
    await makeTask(todos.id, generalId, 'Meet teacher', { time: '16:00', dueDate: today });
    await makeTask(todos.id, generalId, 'Team sync notes', { time: '14:00', dueDate: today });

    const wishlistFolderId = await makeNode(todos.id, null, 'folder', 'Wishlist');
    const wishlistListId = await makeNode(todos.id, wishlistFolderId, 'list', 'Wishlist items');
    await makeTask(todos.id, wishlistListId, 'Books to read', { dueDate: tomorrow });
    await makeTask(todos.id, wishlistListId, 'Movies to watch', { dueDate: tomorrow });
  }

  if (ideas) {
    const projectId = await makeNode(ideas.id, null, 'folder', 'App side-project');
    const tasksListId = await makeNode(ideas.id, projectId, 'list', 'Tasks');
    await makeTask(ideas.id, tasksListId, 'Sketch onboarding flow', { dueDate: tomorrow });
    await makeNode(ideas.id, projectId, 'notepad', 'Notes');
  }
}

// Wipes every piece of user-owned content (but not the account itself or
// its categories) so a fresh seed can be applied - used by the Settings
// "Reset to demo data" and "Clear everything" actions.
export async function clearUserData(userId) {
  await query('DELETE FROM tasks WHERE user_id = $1', [userId]);
  await query('DELETE FROM folder_nodes WHERE user_id = $1', [userId]);
  await query('DELETE FROM journal_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM vault_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM ledger_entries WHERE user_id = $1', [userId]);
}
