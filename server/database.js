require('dotenv').config();
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'mall-expenses.sqlite');

const seededUsers = [
  { _id: 'u1', name: 'Admin User', email: 'admin@rhemie.com', password: 'admin123', role: 'super_admin' },
  { _id: 'u2', name: 'Manager One', email: 'manager@rhemie.com', password: 'manager123', role: 'manager' },
  { _id: 'u3', name: 'Accountant One', email: 'accountant@rhemie.com', password: 'accountant123', role: 'accountant' },
];

const seededExpenses = [
  { _id: 'e1', title: 'Security lights', category: 'Utilities', amount: 35000, status: 'pending', createdAt: new Date().toISOString() },
  { _id: 'e2', title: 'Cleaning supplies', category: 'Operations', amount: 22000, status: 'approved', createdAt: new Date().toISOString() },
  { _id: 'e3', title: 'Marketing banner', category: 'Marketing', amount: 48000, status: 'rejected', createdAt: new Date().toISOString() },
];

const seededTasks = [
  { _id: 't1', title: 'Review vendor invoices', assignedTo: { _id: 'u2', name: 'Manager One' }, dueDate: '2026-10-02T00:00:00.000Z', status: 'open' },
  { _id: 't2', title: 'Audit petty cash', assignedTo: { _id: 'u3', name: 'Accountant One' }, dueDate: '2026-10-05T00:00:00.000Z', status: 'in_progress' },
  { _id: 't3', title: 'Finalize monthly budget', assignedTo: { _id: 'u1', name: 'Admin User' }, dueDate: '2026-10-07T00:00:00.000Z', status: 'done' },
];

let dbInstance = null;
let pgPool = null;

function normalizeAssignedTo(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

function serializeTask(row) {
  const assigned = normalizeAssignedTo(row.assigned_to ?? row.assignedTo ?? null);
  return {
    _id: row.id ?? row._id,
    title: row.title,
    dueDate: row.due_date ?? row.dueDate,
    status: row.status,
    assignedTo: assigned,
  };
}

function serializeExpense(row) {
  return {
    _id: row.id ?? row._id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at ?? row.createdAt,
    createdBy: row.created_by ?? row.createdBy ?? null,
  };
}

function serializeUser(row) {
  return {
    _id: row.id ?? row._id,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}

function subtractMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function summarizeExpenses(expenses, range = '1m') {
  const now = new Date();
  const isDaily = range === 'daily';
  const isWeekly = range === 'weekly';
  const monthCount = isDaily || isWeekly
    ? 0
    : range === 'monthly'
      ? 1
      : Number(/^([0-9]+)m$/.exec(range)?.[1]) || 1;
  const periodStart = new Date(now);

  if (isDaily) periodStart.setDate(periodStart.getDate() - 7);
  else if (isWeekly) periodStart.setDate(periodStart.getDate() - 56);
  else periodStart.setTime(subtractMonths(now, monthCount).getTime());

  const filtered = expenses.filter(expense => !expense.createdAt || new Date(expense.createdAt) >= periodStart);
  const grouped = filtered.reduce((result, expense) => {
    const name = expense.category || 'Uncategorised';
    result[name] = (result[name] || 0) + Number(expense.amount || 0);
    return result;
  }, {});
  const isOneMonth = !isDaily && !isWeekly && monthCount === 1;
  const trendSize = isDaily ? 7 : isWeekly ? 8 : isOneMonth ? Math.ceil((now - periodStart) / (7 * 86400000)) : monthCount;
  const trend = Array.from({ length: trendSize }, (_, index) => {
    const startOffset = trendSize - index;
    const endOffset = startOffset - 1;
    const bucketStart = isDaily || isWeekly
      ? new Date(now.getTime() - startOffset * (isDaily ? 1 : 7) * 86400000)
      : isOneMonth
        ? new Date(periodStart.getTime() + index * 7 * 86400000)
        : subtractMonths(now, startOffset);
    const bucketEnd = isDaily || isWeekly
      ? new Date(now.getTime() - endOffset * (isDaily ? 1 : 7) * 86400000)
      : isOneMonth
        ? new Date(Math.min(bucketStart.getTime() + 7 * 86400000, now.getTime()))
        : subtractMonths(now, endOffset);
    const items = filtered.filter(expense => {
      const date = new Date(expense.createdAt || now);
      return date >= bucketStart && date < bucketEnd;
    });
    const statusTotal = status => items.filter(expense => expense.status === status)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const label = isDaily
      ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
      : isWeekly
        ? `W${index + 1}`
        : isOneMonth
          ? bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : bucketStart.toLocaleDateString(undefined, bucketStart.getFullYear() === now.getFullYear()
          ? { month: 'short' }
          : { month: 'short', year: '2-digit' });

    return {
      label,
      total: items.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
      approved: statusTotal('approved'),
      pending: statusTotal('pending'),
      rejected: statusTotal('rejected'),
    };
  });

  return {
    byCategory: Object.entries(grouped).map(([name, total]) => ({ _id: name, total })),
    approved: filtered.filter(expense => expense.status === 'approved').reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    rejected: filtered.filter(expense => expense.status === 'rejected').reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    pending: filtered.filter(expense => expense.status === 'pending').reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    total: filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    trend,
  };
}

function collectRows(statement, mapper) {
  const rows = [];
  while (statement.step()) {
    rows.push(mapper(statement.getAsObject()));
  }
  statement.free();
  return rows;
}

function getSingleRow(statement, mapper) {
  const hasRow = statement.step();
  if (!hasRow) {
    statement.free();
    return null;
  }

  const row = statement.getAsObject();
  statement.free();
  return mapper(row);
}

function saveDatabase(db) {
  const binary = db.export();
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(binary));
}

async function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();
  const fileExists = fs.existsSync(DB_PATH);
  const db = fileExists ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();

  db.run(`
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    );
  `);

  try {
    db.run('ALTER TABLE expenses ADD COLUMN created_by TEXT');
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error;
  }

  if (!fileExists) {
    const insertUser = db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)');
    for (const user of seededUsers) {
      insertUser.run([user._id, user.name, user.email, user.password, user.role]);
    }

    const insertExpense = db.prepare('INSERT INTO expenses (id, title, category, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const expense of seededExpenses) {
      insertExpense.run([expense._id, expense.title, expense.category, expense.amount, expense.status, expense.createdAt]);
    }

    const insertTask = db.prepare('INSERT INTO tasks (id, title, assigned_to, due_date, status) VALUES (?, ?, ?, ?, ?)');
    for (const task of seededTasks) {
      insertTask.run([task._id, task.title, JSON.stringify({ _id: task.assignedTo._id, name: task.assignedTo.name }), task.dueDate, task.status]);
    }

    saveDatabase(db);
  }

  dbInstance = db;
  return db;
}

async function ensurePostgres() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (pgPool) {
    return pgPool;
  }

  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pgPool.connect();
  try {
    await client.query(`
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
        amount NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        assigned_to JSONB NOT NULL,
        due_date TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'open'
      );
    `);
    await client.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by TEXT');

    const userCount = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (Number(userCount.rows[0].count) === 0) {
      for (const user of seededUsers) {
        await client.query(
          'INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)',
          [user._id, user.name, user.email, user.password, user.role]
        );
      }

      for (const expense of seededExpenses) {
        await client.query(
          'INSERT INTO expenses (id, title, category, amount, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [expense._id, expense.title, expense.category, expense.amount, expense.status, expense.createdAt]
        );
      }

      for (const task of seededTasks) {
        await client.query(
          'INSERT INTO tasks (id, title, assigned_to, due_date, status) VALUES ($1, $2, $3, $4, $5)',
          [task._id, task.title, { _id: task.assignedTo._id, name: task.assignedTo.name }, task.dueDate, task.status]
        );
      }
    }
  } finally {
    client.release();
  }

  return pgPool;
}

async function createPostgresService() {
  const pool = await ensurePostgres();
  if (!pool) {
    return null;
  }

  const getUsers = async () => {
    const result = await pool.query('SELECT * FROM users ORDER BY name ASC');
    return result.rows.map(serializeUser);
  };

  const getUserByEmailAndPassword = async (email, password) => {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
    return result.rows[0] ? serializeUser(result.rows[0]) : null;
  };

  const getUserById = async (id) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? serializeUser(result.rows[0]) : null;
  };

  const createUser = async ({ name, email, password, role }) => {
    const check = await pool.query('SELECT 1 FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    if (check.rowCount > 0) {
      throw new Error('A user with that email already exists.');
    }

    const id = `u${Date.now()}`;
    await pool.query('INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5)', [id, String(name).trim(), String(email).trim(), String(password).trim(), role]);
    return getUserById(id);
  };

  const getExpenses = async () => {
    const result = await pool.query('SELECT * FROM expenses ORDER BY created_at DESC');
    return result.rows.map(serializeExpense);
  };

  const getExpenseById = async (id) => {
    const result = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
    return result.rows[0] ? serializeExpense(result.rows[0]) : null;
  };

  const createExpense = async ({ title, category, amount, createdBy }) => {
    const id = `e${Date.now()}`;
    await pool.query('INSERT INTO expenses (id, title, category, amount, status, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, String(title).trim(), String(category).trim(), Number(amount), 'pending', new Date().toISOString(), createdBy]);
    return getExpenseById(id);
  };

  const deleteExpense = async (id) => {
    await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
    return { success: true };
  };

  const updateExpenseDecision = async (id, approve) => {
    await pool.query('UPDATE expenses SET status = $1 WHERE id = $2', [approve ? 'approved' : 'rejected', id]);
    return getExpenseById(id);
  };

  const getTasks = async () => {
    const result = await pool.query('SELECT * FROM tasks ORDER BY due_date DESC NULLS LAST');
    return result.rows.map(serializeTask);
  };

  const getTaskById = async (id) => {
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return result.rows[0] ? serializeTask(result.rows[0]) : null;
  };

  const createTask = async ({ title, assignedTo, dueDate }) => {
    const assignedUser = await getUserById(assignedTo);
    if (!assignedUser) {
      throw new Error('Selected assignee is invalid.');
    }

    const id = `t${Date.now()}`;
    const payload = { _id: assignedUser._id, name: assignedUser.name };
    await pool.query('INSERT INTO tasks (id, title, assigned_to, due_date, status) VALUES ($1, $2, $3, $4, $5)', [id, String(title).trim(), payload, new Date(dueDate).toISOString(), 'open']);
    return getTaskById(id);
  };

  const updateTaskStatus = async (id, status) => {
    await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [status, id]);
    return getTaskById(id);
  };

  const getSummary = async (range = '1m') => summarizeExpenses(await getExpenses(), range);

  return {
    getUsers,
    getUserByEmailAndPassword,
    getUserById,
    createUser,
    getExpenses,
    getExpenseById,
    createExpense,
    deleteExpense,
    updateExpenseDecision,
    getTasks,
    getTaskById,
    createTask,
    updateTaskStatus,
    getSummary,
  };
}

async function getDb() {
  if (process.env.DATABASE_URL) {
    return null;
  }

  return initializeDatabase();
}

function persist(db) {
  if (db) {
    saveDatabase(db);
  }
}

async function createService() {
  if (process.env.DATABASE_URL) {
    return createPostgresService();
  }

  const db = await getDb();

  const getUsers = () => {
    const stmt = db.prepare('SELECT * FROM users ORDER BY name ASC');
    return collectRows(stmt, serializeUser);
  };

  const getUserByEmailAndPassword = (email, password) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?');
    stmt.bind([email, password]);
    return getSingleRow(stmt, serializeUser);
  };

  const getUserById = (id) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    stmt.bind([id]);
    return getSingleRow(stmt, serializeUser);
  };

  const createUser = ({ name, email, password, role }) => {
    const stmt = db.prepare('SELECT 1 FROM users WHERE email = ?');
    stmt.bind([email.toLowerCase()]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (existing) {
      throw new Error('A user with that email already exists.');
    }

    const id = `u${Date.now()}`;
    db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)')
      .run([id, String(name).trim(), String(email).trim(), String(password).trim(), role]);
    persist(db);
    return getUserById(id);
  };

  const getExpenses = () => {
    const stmt = db.prepare('SELECT * FROM expenses ORDER BY rowid DESC');
    return collectRows(stmt, serializeExpense);
  };

  const getExpenseById = (id) => {
    const stmt = db.prepare('SELECT * FROM expenses WHERE id = ?');
    stmt.bind([id]);
    return getSingleRow(stmt, serializeExpense);
  };

  const createExpense = ({ title, category, amount, createdBy }) => {
    const id = `e${Date.now()}`;
    db.prepare('INSERT INTO expenses (id, title, category, amount, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run([id, String(title).trim(), String(category).trim(), Number(amount), 'pending', new Date().toISOString(), createdBy]);
    persist(db);
    return getExpenseById(id);
  };

  const deleteExpense = (id) => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run([id]);
    persist(db);
    return { success: true };
  };

  const updateExpenseDecision = (id, approve) => {
    db.prepare('UPDATE expenses SET status = ? WHERE id = ?').run([approve ? 'approved' : 'rejected', id]);
    persist(db);
    return getExpenseById(id);
  };

  const getTasks = () => {
    const stmt = db.prepare('SELECT * FROM tasks ORDER BY rowid DESC');
    return collectRows(stmt, serializeTask);
  };

  const getTaskById = (id) => {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    stmt.bind([id]);
    return getSingleRow(stmt, serializeTask);
  };

  const createTask = ({ title, assignedTo, dueDate }) => {
    const assignedUser = getUserById(assignedTo);
    if (!assignedUser) {
      throw new Error('Selected assignee is invalid.');
    }

    const id = `t${Date.now()}`;
    const payload = JSON.stringify({ _id: assignedUser._id, name: assignedUser.name });
    db.prepare('INSERT INTO tasks (id, title, assigned_to, due_date, status) VALUES (?, ?, ?, ?, ?)')
      .run([id, String(title).trim(), payload, new Date(dueDate).toISOString(), 'open']);
    persist(db);
    return getTaskById(id);
  };

  const updateTaskStatus = (id, status) => {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run([status, id]);
    persist(db);
    return getTaskById(id);
  };

  const getSummary = (range = '1m') => summarizeExpenses(getExpenses(), range);

  return {
    getUsers,
    getUserByEmailAndPassword,
    getUserById,
    createUser,
    getExpenses,
    getExpenseById,
    createExpense,
    deleteExpense,
    updateExpenseDecision,
    getTasks,
    getTaskById,
    createTask,
    updateTaskStatus,
    getSummary,
  };
}

module.exports = { createService };
