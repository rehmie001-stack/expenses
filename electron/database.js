const Database = require('better-sqlite3');

const ALLOWED_ROLES = ['super_admin', 'manager', 'accountant'];

const seededUsers = [
  { _id: 'u1', name: 'Admin User', email: 'admin@rhemie.com', password: 'admin123', role: 'super_admin' },
  { _id: 'u2', name: 'Manager One', email: 'manager@rhemie.com', password: 'manager123', role: 'manager' },
  { _id: 'u3', name: 'Accountant One', email: 'accountant@rhemie.com', password: 'accountant123', role: 'accountant' },
];

const seededExpenses = [
  { _id: 'e1', title: 'Security lights', category: 'Utilities', amount: 35000, status: 'pending' },
  { _id: 'e2', title: 'Cleaning supplies', category: 'Operations', amount: 22000, status: 'approved' },
  { _id: 'e3', title: 'Marketing banner', category: 'Marketing', amount: 48000, status: 'rejected' },
];

const seededTasks = [
  { _id: 't1', title: 'Review vendor invoices', assigned_to_id: 'u2', assigned_to_name: 'Manager One', due_date: '2026-10-02T00:00:00.000Z', status: 'open' },
  { _id: 't2', title: 'Audit petty cash', assigned_to_id: 'u3', assigned_to_name: 'Accountant One', due_date: '2026-10-05T00:00:00.000Z', status: 'in_progress' },
  { _id: 't3', title: 'Finalize monthly budget', assigned_to_id: 'u1', assigned_to_name: 'Admin User', due_date: '2026-10-07T00:00:00.000Z', status: 'done' },
];

function seedDatabase(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)');
    for (const user of seededUsers) {
      insertUser.run(user._id, user.name, user.email, user.password, user.role);
    }
  }

  const expenseCount = db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count;
  if (expenseCount === 0) {
    const insertExpense = db.prepare('INSERT INTO expenses (id, title, category, amount, status) VALUES (?, ?, ?, ?, ?)');
    for (const expense of seededExpenses) {
      insertExpense.run(expense._id, expense.title, expense.category, expense.amount, expense.status);
    }
  }

  const taskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
  if (taskCount === 0) {
    const insertTask = db.prepare('INSERT INTO tasks (id, title, assigned_to_id, assigned_to_name, due_date, status) VALUES (?, ?, ?, ?, ?, ?)');
    for (const task of seededTasks) {
      insertTask.run(task._id, task.title, task.assigned_to_id, task.assigned_to_name, task.due_date, task.status);
    }
  }
}

function createService(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      assigned_to_id TEXT NOT NULL,
      assigned_to_name TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    );
  `);

  db.prepare("UPDATE users SET email = REPLACE(email, '@mall.com', '@rhemie.com') WHERE id IN ('u1', 'u2', 'u3')").run();

  try {
    db.exec('ALTER TABLE expenses ADD COLUMN created_at TEXT');
    db.exec("UPDATE expenses SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error;
  }

  seedDatabase(db);

  const normalizeUser = (row) => ({ _id: row.id, name: row.name, email: row.email, password: row.password, role: row.role });
  const normalizeExpense = (row) => ({ _id: row.id, title: row.title, category: row.category, amount: Number(row.amount), status: row.status, createdAt: row.created_at });
  const normalizeTask = (row) => ({
    _id: row.id,
    title: row.title,
    dueDate: row.due_date,
    status: row.status,
    assignedTo: { _id: row.assigned_to_id, name: row.assigned_to_name },
  });

  const getUsers = () => db.prepare('SELECT * FROM users ORDER BY name ASC').all().map(normalizeUser);
  const getUserByEmailAndPassword = (email, password) => {
    const row = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
    return row ? normalizeUser(row) : null;
  };
  const getUserById = (id) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? normalizeUser(row) : null;
  };

  const createUser = ({ name, email, password, role }) => {
    if (!name || !email || !password || !role || !ALLOWED_ROLES.includes(role) || !String(email).toLowerCase().endsWith('@rhemie.com')) {
      throw new Error('Please provide a valid name, @rhemie.com email, password, and access role.');
    }

    const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (existing) {
      throw new Error('A user with that email already exists.');
    }

    const id = `u${Date.now()}`;
    db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, String(name).trim(), String(email).trim(), String(password).trim(), role);
    return getUserById(id);
  };

  const getExpenses = () => db.prepare('SELECT * FROM expenses ORDER BY rowid DESC').all().map(normalizeExpense);
  const getExpenseById = (id) => {
    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    return row ? normalizeExpense(row) : null;
  };
  const createExpense = ({ title, category, amount }) => {
    const id = `e${Date.now()}`;
    db.prepare('INSERT INTO expenses (id, title, category, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, String(title).trim(), String(category).trim(), Number(amount), 'pending', new Date().toISOString());
    return getExpenseById(id);
  };
  const deleteExpense = (id) => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return { success: true };
  };
  const updateExpenseDecision = (id, approve) => {
    const result = db.prepare('UPDATE expenses SET status = ? WHERE id = ?').run(approve ? 'approved' : 'rejected', id);
    return result.changes > 0 ? getExpenseById(id) : null;
  };

  const getTasks = () => db.prepare('SELECT * FROM tasks ORDER BY rowid DESC').all().map(normalizeTask);
  const getTaskById = (id) => {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? normalizeTask(row) : null;
  };
  const createTask = ({ title, assignedTo, dueDate }) => {
    const assignedUser = getUserById(assignedTo);
    if (!assignedUser) throw new Error('Selected assignee is invalid.');

    const id = `t${Date.now()}`;
    db.prepare('INSERT INTO tasks (id, title, assigned_to_id, assigned_to_name, due_date, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, String(title).trim(), assignedUser._id, assignedUser.name, new Date(dueDate).toISOString(), 'open');
    return getTaskById(id);
  };
  const updateTaskStatus = (id, status) => {
    const result = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
    return result.changes > 0 ? getTaskById(id) : null;
  };

  const getSummary = (range = 'monthly') => {
    const expenses = getExpenses();
    const now = new Date();
    const periodDays = range === 'daily' ? 7 : range === 'weekly' ? 56 : 180;
    const start = new Date(now);
    start.setDate(start.getDate() - periodDays);
    const filtered = expenses.filter((expense) => !expense.createdAt || new Date(expense.createdAt) >= start);
    const grouped = filtered.reduce((result, expense) => {
      const key = expense.category || 'Uncategorised';
      result[key] = (result[key] || 0) + Number(expense.amount || 0);
      return result;
    }, {});
    const totals = (status) => filtered.filter((expense) => expense.status === status)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const trendSize = range === 'daily' ? 7 : range === 'weekly' ? 8 : 6;
    const trend = Array.from({ length: trendSize }, (_, index) => {
      const bucketStart = new Date(now);
      const bucketDays = range === 'daily' ? 1 : range === 'weekly' ? 7 : 30;
      bucketStart.setDate(bucketStart.getDate() - (trendSize - index) * bucketDays);
      const bucketEnd = new Date(now);
      bucketEnd.setDate(bucketEnd.getDate() - (trendSize - index - 1) * bucketDays);
      const bucketItems = filtered.filter((expense) => {
        const date = new Date(expense.createdAt || now);
        return date >= bucketStart && date < bucketEnd;
      });
      const statusTotal = (status) => bucketItems.filter((expense) => expense.status === status)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      return {
        label: range === 'daily' ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' }) : range === 'weekly' ? `W${index + 1}` : bucketStart.toLocaleDateString(undefined, { month: 'short' }),
        total: bucketItems.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        approved: statusTotal('approved'),
        pending: statusTotal('pending'),
        rejected: statusTotal('rejected'),
      };
    });

    return {
      byCategory: Object.entries(grouped).map(([category, total]) => ({ _id: category, total })),
      approved: totals('approved'),
      rejected: totals('rejected'),
      pending: totals('pending'),
      total: filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
      trend,
    };
  };

  return {
    getUsers,
    getUserByEmailAndPassword,
    getUserById,
    createUser,
    getExpenses,
    createExpense,
    deleteExpense,
    updateExpenseDecision,
    getTasks,
    createTask,
    updateTaskStatus,
    getSummary,
    close: () => db.close(),
  };
}

module.exports = { createService };
