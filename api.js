const STORAGE = {
  users: 'mall_expenses_users',
  expenses: 'mall_expenses_expenses',
  tasks: 'mall_expenses_tasks',
  token: 'mall_expenses_token',
};

const seededUsers = [
  { _id: 'u1', name: 'Admin User', email: 'admin@rhemie.com', password: 'admin123', role: 'super_admin' },
  { _id: 'u2', name: 'Manager One', email: 'manager@rhemie.com', password: 'manager123', role: 'manager' },
  { _id: 'u3', name: 'Accountant One', email: 'accountant@rhemie.com', password: 'accountant123', role: 'accountant' },
];

const ALLOWED_ROLES = ['super_admin', 'manager', 'accountant'];

const seededExpenses = [
  { _id: 'e1', title: 'Security lights', category: 'Utilities', amount: 35000, status: 'pending', createdAt: new Date().toISOString() },
  { _id: 'e2', title: 'Cleaning supplies', category: 'Operations', amount: 22000, status: 'approved', createdAt: new Date().toISOString() },
  { _id: 'e3', title: 'Marketing banner', category: 'Marketing', amount: 48000, status: 'rejected', createdAt: new Date().toISOString() },
];

const seededTasks = [
  { _id: 't1', title: 'Review vendor invoices', assignedTo: { name: 'Manager One' }, dueDate: '2026-10-02T00:00:00.000Z', status: 'open' },
  { _id: 't2', title: 'Audit petty cash', assignedTo: { name: 'Accountant One' }, dueDate: '2026-10-05T00:00:00.000Z', status: 'in_progress' },
  { _id: 't3', title: 'Finalize monthly budget', assignedTo: { name: 'Admin User' }, dueDate: '2026-10-07T00:00:00.000Z', status: 'done' },
];

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeedData() {
  const existingUsers = readStorage(STORAGE.users, null);
  if (!existingUsers) {
    writeStorage(STORAGE.users, seededUsers);
  } else {
    const migratedUsers = existingUsers.map(user => seededUsers.find(seed => seed._id === user._id && user.email.endsWith('@mall.com')) ? { ...user, email: user.email.replace('@mall.com', '@rhemie.com') } : user);
    writeStorage(STORAGE.users, migratedUsers);
  }
  if (!readStorage(STORAGE.expenses, null)) {
    writeStorage(STORAGE.expenses, seededExpenses);
  }
  if (!readStorage(STORAGE.tasks, null)) {
    writeStorage(STORAGE.tasks, seededTasks);
  }
}

export function setToken(token) {
  if (!token) {
    localStorage.removeItem(STORAGE.token);
    return;
  }
  localStorage.setItem(STORAGE.token, JSON.stringify(token));
}

export function getToken() {
  const token = localStorage.getItem(STORAGE.token);
  return token ? JSON.parse(token) : null;
}

function removeToken() {
  localStorage.removeItem(STORAGE.token);
}

function getExpenses() {
  ensureSeedData();
  return readStorage(STORAGE.expenses, []);
}

function getTasks() {
  ensureSeedData();
  return readStorage(STORAGE.tasks, []);
}

function getUsers() {
  ensureSeedData();
  return readStorage(STORAGE.users, []);
}

function getCurrentUser() {
  const token = getToken();
  if (!token || !token.startsWith('demo-token-')) return null;
  const userId = token.replace('demo-token-', '');
  return getUsers().find((user) => user._id === userId) || null;
}

function getSummary() {
  const expenses = getExpenses();
  const grouped = expenses.reduce((acc, item) => {
    const key = item.category || 'Uncategorised';
    acc[key] = (acc[key] || 0) + Number(item.amount || 0);
    return acc;
  }, {});

  return {
    byCategory: Object.entries(grouped).map(([name, total]) => ({ _id: name, total })),
  };
}

async function fallbackApi(path, options = {}) {
  ensureSeedData();

  const { method = 'GET', body } = options;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const [routePath, query = ''] = normalizedPath.split('?');

  if (normalizedPath === 'auth/login') {
    const payload = body || {};
    const user = readStorage(STORAGE.users, []).find(
      (item) => item.email === payload.email && item.password === payload.password
    );

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const token = `demo-token-${user._id}`;
    setToken(token);
    return { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } };
  }

  if (!getToken()) {
    throw new Error('Please sign in');
  }

  if (normalizedPath === 'users') {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'super_admin') {
      throw new Error('Only the admin can manage users.');
    }

    if (method === 'GET') return getUsers();
    if (method === 'POST') {
      const { name, email, password, role } = body || {};
      if (!name || !email || !password || !role || !ALLOWED_ROLES.includes(role) || !String(email).toLowerCase().endsWith('@rhemie.com')) {
        throw new Error('Please provide a valid name, @rhemie.com email, password, and access role.');
      }

      const users = getUsers();
      if (users.some((user) => user.email.toLowerCase() === String(email).toLowerCase())) {
        throw new Error('A user with that email already exists.');
      }

      const newUser = {
        _id: `u${Date.now()}`,
        name: String(name).trim(),
        email: String(email).trim(),
        password: String(password).trim(),
        role,
      };

      users.unshift(newUser);
      writeStorage(STORAGE.users, users);
      return newUser;
    }
  }

  if (routePath === 'expenses') {
    if (method === 'GET') return getExpenses();
    if (method === 'POST') {
      const nextExpense = {
        _id: `e${Date.now()}`,
        title: body.title,
        category: body.category,
        amount: Number(body.amount) || 0,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const expenses = getExpenses();
      expenses.unshift(nextExpense);
      writeStorage(STORAGE.expenses, expenses);
      return nextExpense;
    }
  }

  if (normalizedPath.startsWith('expenses/')) {
    const [, id, action] = normalizedPath.split('/');
    const expenses = getExpenses();

    if (method === 'DELETE') {
      const updated = expenses.filter((item) => item._id !== id);
      writeStorage(STORAGE.expenses, updated);
      return { success: true };
    }

    if (method === 'POST' && action === 'decision') {
      const updated = expenses.map((item) => {
        if (item._id === id) {
          return { ...item, status: body.approve ? 'approved' : 'rejected' };
        }
        return item;
      });
      writeStorage(STORAGE.expenses, updated);
      return updated.find((item) => item._id === id);
    }
  }

  if (normalizedPath === 'tasks') {
    if (method === 'GET') return getTasks();
    if (method === 'POST') {
      const { title, assignedTo, dueDate } = body || {};
      if (!title || !assignedTo || !dueDate) {
        throw new Error('Please provide a task title, assignee, and due date.');
      }

      const users = getUsers();
      const assignedUser = users.find((user) => user._id === assignedTo);
      if (!assignedUser) {
        throw new Error('Selected assignee is invalid.');
      }

      const tasks = getTasks();
      const newTask = {
        _id: `t${Date.now()}`,
        title: String(title).trim(),
        assignedTo: { _id: assignedUser._id, name: assignedUser.name },
        dueDate: new Date(dueDate).toISOString(),
        status: 'open',
      };

      tasks.unshift(newTask);
      writeStorage(STORAGE.tasks, tasks);
      return newTask;
    }
  }

  if (normalizedPath.startsWith('tasks/')) {
    const [, id, subPath] = normalizedPath.split('/');
    const tasks = getTasks();

    if (method === 'PATCH' && subPath === 'status') {
      const updated = tasks.map((task) => {
        if (task._id === id) {
          return { ...task, status: body.status };
        }
        return task;
      });
      writeStorage(STORAGE.tasks, updated);
      return updated.find((task) => task._id === id);
    }
  }

  if (routePath === 'summary') {
    const range = new URLSearchParams(query).get('range') || 'monthly';
    const expenses = getExpenses();
    const now = new Date();
    const days = range === 'daily' ? 7 : range === 'weekly' ? 56 : 180;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    const filtered = expenses.filter(expense => !expense.createdAt || new Date(expense.createdAt) >= start);
    const grouped = filtered.reduce((result, expense) => { result[expense.category || 'Uncategorised'] = (result[expense.category || 'Uncategorised'] || 0) + Number(expense.amount || 0); return result; }, {});
    const trendSize = range === 'daily' ? 7 : range === 'weekly' ? 8 : 6;
    const bucketDays = range === 'daily' ? 1 : range === 'weekly' ? 7 : 30;
    const trend = Array.from({ length: trendSize }, (_, index) => {
      const bucketStart = new Date(now);
      bucketStart.setDate(bucketStart.getDate() - (trendSize - index) * bucketDays);
      const bucketEnd = new Date(now);
      bucketEnd.setDate(bucketEnd.getDate() - (trendSize - index - 1) * bucketDays);
      const items = filtered.filter(expense => {
        const date = new Date(expense.createdAt || now);
        return date >= bucketStart && date < bucketEnd;
      });
      const statusTotal = status => items.filter(expense => expense.status === status)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      return {
        label: range === 'daily' ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' }) : range === 'weekly' ? `W${index + 1}` : bucketStart.toLocaleDateString(undefined, { month: 'short' }),
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
      trend,
    };
  }

  if (normalizedPath === 'auth/logout') {
    removeToken();
    return { success: true };
  }

  throw new Error(`Unhandled API route: ${normalizedPath}`);
}

export function getApiBaseUrl() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
    ? import.meta.env.VITE_API_URL
    : '';

  const savedUrl = localStorage.getItem('mall_expenses_api_url');
  return (savedUrl && savedUrl.trim()) || envUrl || 'http://localhost:4000';
}

export function setApiBaseUrl(url) {
  const nextUrl = (url || '').trim();

  if (!nextUrl) {
    localStorage.removeItem('mall_expenses_api_url');
    return;
  }

  localStorage.setItem('mall_expenses_api_url', nextUrl);
}

export async function api(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const baseUrl = getApiBaseUrl();

  try {
    const headers = { Accept: 'application/json' };
    const body = options.body;

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${normalizedPath}`, {
      ...options,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(data?.message || 'Request failed');
    }

    return data;
  } catch (error) {
    return fallbackApi(path, options);
  }
}
