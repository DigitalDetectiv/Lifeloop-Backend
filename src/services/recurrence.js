// Recurrence rules are stored as jsonb on the task row (see schema.sql).
// Supported shapes today:
//   { freq: 'daily' }
//   { freq: 'weekly', days: [0,1,2,3,4,5,6] }   // 0 = Sunday, matches Date#getDay()
//
// Add new shapes here as they come up (e.g. 'monthly', 'every_n_days') -
// this is the one place recurrence logic should live so the rest of the
// app never has to know how a rule is structured.
export function matchesDate(rule, date) {
  if (!rule || !rule.freq) return false;

  if (rule.freq === 'daily') return true;

  if (rule.freq === 'weekly') {
    const days = Array.isArray(rule.days) ? rule.days : [];
    return days.includes(date.getDay());
  }

  return false;
}

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}
