const express = require('express');
const cors = require('cors');
const { createService } = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ROLES = ['super_admin', 'manager', 'accountant'];

let service;

async function getCurrentUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !token.startsWith('demo-token-')) {
    throw new Error('Please sign in');
  }

  const userId = token.replace('demo-token-', '');
  const user = await service.getUserById(userId);
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

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const user = await service.getUserByEmailAndPassword(email, password);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({ token: `demo-token-${user._id}`, user: normalizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to sign in' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/users', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the admin can manage users.' });
    }
    return res.json((await service.getUsers()).map(normalizeUser));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const payload = req.body || {};

    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the admin can manage users.' });
    }

    const { name, email, password, role } = payload;
    if (!name || !email || !password || !role || !ALLOWED_ROLES.includes(role) || !String(email).toLowerCase().endsWith('@rhemie.com')) {
      return res.status(400).json({ message: 'Please provide a valid name, @rhemie.com email, password, and access role.' });
    }

    const newUser = await service.createUser({ name, email, password, role });
    return res.status(201).json(normalizeUser(newUser));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create user' });
  }
});

app.get('/expenses', async (req, res) => {
  try {
    await getCurrentUser(req);
    return res.json(await service.getExpenses());
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/expenses', async (req, res) => {
  try {
    await getCurrentUser(req);
    const { title, category, amount } = req.body || {};
    const created = await service.createExpense({ title, category, amount });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create expense' });
  }
});

app.delete('/expenses/:id', async (req, res) => {
  try {
    await getCurrentUser(req);
    return res.json(await service.deleteExpense(req.params.id));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/expenses/:id/decision', async (req, res) => {
  try {
    await getCurrentUser(req);
    return res.json(await service.updateExpenseDecision(req.params.id, !!(req.body && req.body.approve)));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update expense' });
  }
});

app.get('/tasks', async (req, res) => {
  try {
    await getCurrentUser(req);
    return res.json(await service.getTasks());
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

app.post('/tasks', async (req, res) => {
  try {
    await getCurrentUser(req);
    const created = await service.createTask(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to create task' });
  }
});

app.patch('/tasks/:id/status', async (req, res) => {
  try {
    await getCurrentUser(req);
    const updated = await service.updateTaskStatus(req.params.id, req.body?.status);
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update task' });
  }
});

app.get('/summary', async (req, res) => {
  try {
    await getCurrentUser(req);
    const range = req.query.range || 'monthly';
    return res.json(await service.getSummary(range));
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Please sign in' });
  }
});

async function startServer() {
  service = await createService();
  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`Mall Expenses API listening on http://localhost:${PORT}`);
      resolve();
    });
    server.once('error', reject);
  });
}

startServer().catch(async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      const health = await response.json();
      if (response.ok && health.ok) {
        console.log(`Mall Expenses API already running on http://localhost:${PORT}`);
        return;
      }
    } catch {
      // Report the port conflict below when no healthy API is available.
    }
    console.error(`Port ${PORT} is already in use by another service.`);
  } else {
    console.error('Failed to start Mall Expenses API:', error);
  }
  process.exitCode = 1;
});
