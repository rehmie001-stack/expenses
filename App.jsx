import React, { useEffect, useState } from 'react';
import { api, getApiBaseUrl, setApiBaseUrl, setToken } from './api';
import { ThemeSwitcher, ThemeProvider } from './theme.jsx';
import './theme.css';

const PRIV = ['super_admin', 'manager', 'accountant'];
const EXPENSE_CATEGORIES = ['Utilities', 'Operations', 'Marketing', 'Supplies', 'Transport', 'Payroll', 'Other'];
const fmt = (n) => '₦' + Number(n || 0).toLocaleString();

function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const isElectron = Boolean(window.mallExpensesAPI);
    if (isInstalled || isElectron) return undefined;

    const showPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    const markInstalled = () => {
      setInstallEvent(null);
      setVisible(false);
    };
    const timer = window.setTimeout(() => setVisible(true), 1200);

    window.addEventListener('beforeinstallprompt', showPrompt);
    window.addEventListener('appinstalled', markInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', showPrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!installEvent) {
      setShowInstructions(true);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'accepted') setVisible(false);
  };

  return (
    <>
      <aside className="pwa-install-banner" role="status">
        <div className="pwa-install-copy">
          <strong>Install Mall Expenses</strong>
          <span>Add it to your device for quick access.</span>
        </div>
        <button className="btn pwa-install-action" onClick={install}>Install</button>
        <button className="pwa-install-dismiss" onClick={() => setVisible(false)}>Not now</button>
      </aside>
      {showInstructions && (
        <div className="pwa-install-backdrop" role="presentation" onClick={() => setShowInstructions(false)}>
          <section className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" onClick={event => event.stopPropagation()}>
            <strong id="pwa-install-title">Install Mall Expenses</strong>
            <p>{/iPhone|iPad|iPod/i.test(navigator.userAgent)
              ? 'In Safari, tap Share, then choose Add to Home Screen.'
              : 'Open your browser menu and choose Install app or Add to home screen.'}</p>
            <button className="btn" onClick={() => setShowInstructions(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  );
}

function Login({ onLogin }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());

  const go = async () => {
    try {
      setApiBaseUrl(apiUrl);
      const r = await api('/auth/login', { method: 'POST', body: f });
      setToken(r.token);
      onLogin(r.user);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="login"><div className="card">
      <div className="logo">Mall<span>Expenses</span></div>
      <input placeholder="Email" onChange={e => setF({ ...f, email: e.target.value })} />
      <input type="password" placeholder="Password" onChange={e => setF({ ...f, password: e.target.value })} onKeyDown={e => e.key === 'Enter' && go()} />
      <input
        placeholder="API server URL"
        value={apiUrl}
        onChange={e => setApiUrl(e.target.value)}
        onBlur={() => setApiBaseUrl(apiUrl)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setApiBaseUrl(apiUrl);
            go();
          }
        }}
      />
      {err && <div className="muted" style={{ color: '#f43f5e' }}>{err}</div>}
      <button className="btn" onClick={go}>Sign in</button>
      <ThemeSwitcher />
    </div></div>
  );
}

function Expenses({ user }) {
  const [rows, setRows] = useState([]); const [f, setF] = useState({ title: '', amount: '', category: '' }); const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const priv = PRIV.includes(user.role);
  const load = () => api('/expenses').then(setRows);
  useEffect(() => { load(); }, []);
  const totalEntered = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visibleRows = statusFilter === 'all' ? rows : rows.filter(row => row.status === statusFilter);
  const add = async () => {
    const title = f.title.trim();
    const category = f.category.trim();
    const amount = Number(f.amount);

    if (!title || !category || !amount || Number.isNaN(amount) || amount <= 0) {
      setErr('Please enter a title, category, and valid amount greater than 0.');
      return;
    }

    setErr('');
    await api('/expenses', { method: 'POST', body: { title, category, amount } });
    setF({ title: '', amount: '', category: '' });
    load();
  };
  const decide = async (id, approve) => { await api(`/expenses/${id}/decision`, { method: 'POST', body: { approve } }); load(); };
  const del = async (id) => { await api(`/expenses/${id}`, { method: 'DELETE' }); load(); };
  return (<>
    {priv && <div className="card" style={{ marginBottom: '18px' }}>
      <div className="muted">Total entered expenses</div>
      <div className="stat">{fmt(totalEntered)}</div>
    </div>}
    <div className="card form" style={{ display: 'grid' }}>
      <input placeholder="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <input placeholder="Amount" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
      <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
        <option value="">Select category</option>
        {EXPENSE_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
      </select>
      {err && <div className="muted" style={{ color: '#f43f5e' }}>{err}</div>}
      <button className="btn" onClick={add}>Add expense</button>
    </div>
    <div className="card">
      <div className="table-toolbar">
        <div className="mini-header">Expense entries</div>
        <select className="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter expenses by status">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <table>
      <thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Status</th>{priv && <th />}</tr></thead>
      <tbody>{visibleRows.map(r => <tr key={r._id}>
        <td>{r.title}</td><td>{r.category}</td><td>{fmt(r.amount)}</td><td><span className="pill">{r.status}</span></td>
        {priv && <td style={{ whiteSpace: 'nowrap' }}>
          <button className="pill" onClick={() => decide(r._id, true)}>Approve</button>{' '}
          <button className="pill" onClick={() => decide(r._id, false)}>Reject</button>{' '}
          <button className="pill" onClick={() => del(r._id)}>Delete</button></td>}
      </tr>)}{visibleRows.length === 0 && <tr><td colSpan={priv ? 5 : 4} className="muted">No expenses match this status.</td></tr>}</tbody></table></div>
  </>);
}

function Tasks({ user }) {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ title: '', assignedTo: '', dueDate: '' });
  const [err, setErr] = useState('');

  const load = async () => {
    const [taskList, userList] = await Promise.all([api('/tasks'), api('/users')]);
    setRows(taskList);
    setUsers(userList);
  };

  useEffect(() => { load(); }, []);

  const set = async (id, status) => { await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status } }); load(); };

  const add = async () => {
    if (!f.title.trim() || !f.assignedTo || !f.dueDate) {
      setErr('Please enter a task title, assignee, and due date.');
      return;
    }

    try {
      setErr('');
      await api('/tasks', { method: 'POST', body: { ...f, title: f.title.trim() } });
      setF({ title: '', assignedTo: '', dueDate: '' });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (<>
    <div className="card form" style={{ display: 'grid' }}>
      <input placeholder="Task title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <select value={f.assignedTo} onChange={e => setF({ ...f, assignedTo: e.target.value })}>
        <option value="">Assign to</option>
        {users.filter(u => u._id !== user._id).map(u => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
      </select>
      <input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} />
      {err && <div className="muted" style={{ color: '#f43f5e' }}>{err}</div>}
      <button className="btn" onClick={add}>Create task</button>
    </div>
    <div className="card"><table>
      <thead><tr><th>Task</th><th>Assigned</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{rows.map(t => <tr key={t._id}><td>{t.title}</td><td>{t.assignedTo?.name}</td>
        <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}</td>
        <td><select value={t.status} onChange={e => set(t._id, e.target.value)}>
          {['open', 'in_progress', 'blocked', 'done'].map(s => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>
  </>);
}

function Users() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'manager' });
  const [err, setErr] = useState('');

  const load = () => api('/users').then(setRows);
  useEffect(() => { load(); }, []);

  const add = async () => {
    const name = f.name.trim();
    const email = f.email.trim();
    const password = f.password.trim();
    const role = f.role;

    if (!name || !email || !password || !role) {
      setErr('Please complete all user fields.');
      return;
    }

    try {
      setErr('');
      await api('/users', { method: 'POST', body: { name, email, password, role } });
      setF({ name: '', email: '', password: '', role: 'manager' });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (<>
    <div className="card form" style={{ display: 'grid' }}>
      <input placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <input type="password" placeholder="Password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
      <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
        <option value="manager">Manager</option>
        <option value="accountant">Accountant</option>
        <option value="super_admin">Super Admin</option>
      </select>
      {err && <div className="muted" style={{ color: '#f43f5e' }}>{err}</div>}
      <button className="btn" onClick={add}>Create user</button>
    </div>
    <div className="card"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Access</th></tr></thead>
      <tbody>{rows.map(u => <tr key={u._id}><td>{u.name}</td><td>{u.email}</td><td><span className="pill">{u.role.replace('_', ' ')}</span></td></tr>)}</tbody>
    </table></div>
  </>);
}

function Dashboard({ user }) {
  const [s, setS] = useState(null);
  const [range, setRange] = useState('monthly');
  useEffect(() => { PRIV.includes(user.role) && api(`/summary?range=${range}`).then(setS); }, [range, user.role]);
  const total = s?.byCategory.reduce((a, c) => a + c.total, 0) || 0;
  const approved = Number(s?.approved || 0);
  const rejected = Number(s?.rejected || 0);
  const pending = Number(s?.pending || 0);
  const trend = s?.trend || [];
  const series = [
    { key: 'total', label: 'Total', color: 'var(--accent)' },
    { key: 'approved', label: 'Approved', color: '#2dd4bf' },
    { key: 'pending', label: 'Pending', color: '#fbbf24' },
    { key: 'rejected', label: 'Rejected', color: '#f87171' },
  ];
  const maxTrend = Math.max(...trend.flatMap(item => series.map(itemSeries => Number(item[itemSeries.key] || 0))), 1);
  const getPoints = key => trend.map((item, index) => `${(index / Math.max(trend.length - 1, 1)) * 100},${100 - (Number(item[key] || 0) / maxTrend) * 82}`).join(' ');
  const currentTrend = trend.at(-1)?.total || 0;
  const previousTrend = trend.at(-2)?.total || 0;
  const trendChange = previousTrend ? ((currentTrend - previousTrend) / previousTrend) * 100 : 0;
  const donut = [
    { name: 'Utilities', value: s?.byCategory.find(c => c._id === 'Utilities')?.total || 35000, color: '#f87171' },
    { name: 'Operations', value: s?.byCategory.find(c => c._id === 'Operations')?.total || 22000, color: '#2dd4bf' },
    { name: 'Marketing', value: s?.byCategory.find(c => c._id === 'Marketing')?.total || 48000, color: '#fbbf24' },
  ];
  const donutTotal = donut.reduce((sum, item) => sum + item.value, 0);

  return <div className="dashboard-shell">
    <div className="welcome-banner">
      <div>
        <div className="mini-header">Welcome back</div>
        <h2>{user.name}</h2>
      </div>
      <div className="trend-chip">Live expense overview</div>
    </div>

    <div className="dashboard-grid">
      <div className="metric-card">
        <div className="metric-title">Total spend</div>
        <div className="metric-value">{fmt(total)}</div>
        <div className="metric-sub">All entered expenses</div>
      </div>
      <div className="metric-card">
        <div className="metric-title">Approved</div>
        <div className="metric-value">{fmt(approved)}</div>
        <div className="metric-sub">Validated spend</div>
      </div>
      <div className="metric-card">
        <div className="metric-title">Pending</div>
        <div className="metric-value">{fmt(pending)}</div>
        <div className="metric-sub">Awaiting decision</div>
      </div>
      <div className="metric-card">
        <div className="metric-title">Rejected</div>
        <div className="metric-value">{fmt(rejected)}</div>
        <div className="metric-sub">Declined entries</div>
      </div>
    </div>

    <div className="insight-panel">
      <div className="panel-chart">
        <div className="panel-header">
          <div className="mini-header">Expense trend</div>
          <div className="range-switcher">
            {['daily', 'weekly', 'monthly'].map(option => <button key={option} className={range === option ? 'selected' : ''} onClick={() => setRange(option)}>{option}</button>)}
          </div>
        </div>
        <div className="trend-summary"><strong>{trendChange >= 0 ? '+' : ''}{trendChange.toFixed(1)}%</strong> change from the previous period</div>
        <div className="svg-chart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Expense trend chart">
            <path className="chart-area" d={`M 0 100 L ${getPoints('total') || '0,100'} L 100 100 Z`} />
            {series.map(itemSeries => <polyline key={itemSeries.key} className="chart-line" style={{ stroke: itemSeries.color }} points={getPoints(itemSeries.key) || '0,100 100,100'} />)}
            {trend.map((item, index) => <circle key={item.label + index} cx={(index / Math.max(trend.length - 1, 1)) * 100} cy={100 - (Number(item.total || 0) / maxTrend) * 82} r="1.5" className="chart-point" />)}
          </svg>
          <div className="chart-labels" style={{ gridTemplateColumns: `repeat(${Math.max(trend.length, 1)}, minmax(0, 1fr))` }}>{trend.map((item, index) => <small key={item.label + index}>{item.label}</small>)}</div>
        </div>
        <div className="chart-legend">{series.map(itemSeries => <span key={itemSeries.key}><i style={{ background: itemSeries.color }} />{itemSeries.label}</span>)}</div>
      </div>
      <div className="panel-chart">
        <div className="panel-header">
          <div className="mini-header">Category split</div>
          <span className="panel-label">Live</span>
        </div>
        <div className="donut-wrap">
          <div className="donut-chart">
            <div className="donut-inner">{fmt(donutTotal)}</div>
          </div>
          <div className="legend">
            {donut.map(item => <div key={item.name} className="legend-item"><span className="legend-dot" style={{ background: item.color }} />{item.name}</div>)}
          </div>
        </div>
      </div>
    </div>

    <div className="dashboard-table-wrap">
      <div className="panel-header">
        <div className="mini-header">Category totals</div>
        <span className="panel-label">Updated daily</span>
      </div>
      <table className="mini-table">
        <thead><tr><th>Category</th><th>Amount</th></tr></thead>
        <tbody>{(s?.byCategory || []).map(c => <tr key={c._id}><td>{c._id || 'Uncategorised'}</td><td>{fmt(c.total)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
      <PwaInstallPrompt />
    </ThemeProvider>
  );
}

function AppShell() {
  const [user, setUser] = useState(null); const [tab, setTab] = useState('Dashboard');
  if (!user) return <Login onLogin={setUser} />;

  const tabs = ['Dashboard', 'Expenses', 'Tasks'];
  if (user.role === 'super_admin') tabs.push('Users');

  const Page = { Dashboard, Expenses, Tasks, Users }[tab];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Mall<span>Expenses</span></div>
        {tabs.map(t => <button key={t} className={'nav' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>)}
        <div style={{ flex: 1 }} />
        <button className="nav" onClick={() => { setToken(null); setUser(null); }}>Sign out</button>
      </aside>
      <main className="main">
        <div className="top"><div><h1>{tab}</h1><div className="muted">{user.role.replace('_', ' ')}</div></div><ThemeSwitcher /></div>
        <Page user={user} />
      </main>
    </div>
  );
}
