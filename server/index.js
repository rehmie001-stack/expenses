const express = require('express');
const cors = require('cors');
const { createService } = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ROLES = ['super_admin', 'manager', 'accountant'];

let service;

function getCurrentUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !token.startsWith('demo-token-')) {
    throw new Error('Please sign in');
  }

  const userId = token.replace('demo-token-', '');
  const user = service.getUserById(userId);
  if (!user) {
    throw new Error('Please sign in');
  }
  return user;
}

function normalizeUser(user) {
  return { _id: user._id, name: user.name, email: user.email, role: user.role };
}

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Mall Expenses API is running' });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = service.getUserByEmailAndPassword(email, password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  return res.json({ token: `demo-token-${user._id}`, user: normalizeUser(user) });
});

app.post('/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/users', (req, res) => {
  try {
    const currentUser = getCurrentUser(req);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the admin can manage users.' });
    }
    return res.json(service.getUsers().map(normalizeUser));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/users', (req, res) => {
  try {
    const currentUser = getCurrentUser(req);
    const payload = req.body || {};

    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the admin can manage users.' });
    }

    const { name, email, password, role } = payload;
    if (!name || !email || !password || !role || !ALLOWED_ROLES.includes(role) || !String(email).toLowerCase().endsWith('@rhemie.com')) {
      return res.status(400).json({ message: 'Please provide a valid name, @rhemie.com email, password, and access role.' });
    }

    const newUser = service.createUser({ name, email, password, role });
    return res.status(201).json(normalizeUser(newUser));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create user' });
  }
});

app.get('/expenses', (req, res) => {
  try {
    getCurrentUser(req);
    return res.json(service.getExpenses());
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/expenses', (req, res) => {
  try {
    getCurrentUser(req);
    const { title, category, amount } = req.body || {};
    const created = service.createExpense({ title, category, amount });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create expense' });
  }
});

app.delete('/expenses/:id', (req, res) => {
  try {
    getCurrentUser(req);
    return res.json(service.deleteExpense(req.params.id));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/expenses/:id/decision', (req, res) => {
  try {
    getCurrentUser(req);
    return res.json(service.updateExpenseDecision(req.params.id, !!(req.body && req.body.approve)));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update expense' });
  }
});

app.get('/tasks', (req, res) => {
  try {
    getCurrentUser(req);
    return res.json(service.getTasks());
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/tasks', (req, res) => {
  try {
    getCurrentUser(req);
    const created = service.createTask(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create task' });
  }
});

app.patch('/tasks/:id/status', (req, res) => {
  try {
    getCurrentUser(req);
    const updated = service.updateTaskStatus(req.params.id, req.body?.status);
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update task' });
  }
});

app.get('/summary', (req, res) => {
  try {
    getCurrentUser(req);
    const range = req.query.range || 'monthly';
    return res.json(service.getSummary(range));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

async function startServer() {
  service = await createService();
  app.listen(PORT, () => {
    console.log(`Mall Expenses API listening on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start Mall Expenses API:', error);
  process.exit(1);
});
