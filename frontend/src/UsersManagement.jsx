import React, { useState } from 'react';
import { Trash2, ToggleLeft, ToggleRight, UserPlus } from 'lucide-react';
import { useTr } from './i18n';
import { toast } from './useToast';
import PasswordStrength from './PasswordStrength';
import { API } from './apiConfig';

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

const USER_PERMISSION_OPTIONS = [
  { key: 'view_dashboard', label: 'Dashboard', hint: 'Open overview and stats', group: 'Read access' },
  { key: 'view_events', label: 'Face Events', hint: 'View event history', group: 'Read access' },
  { key: 'view_persons', label: 'Persons', hint: 'View persons database', group: 'Read access' },
  { key: 'view_attendance', label: 'Attendance', hint: 'View attendance timeline', group: 'Read access' },
  { key: 'view_cameras', label: 'Cameras', hint: 'View camera list', group: 'Read access' },
  { key: 'view_live', label: 'Live Camera', hint: 'Open camera live preview', group: 'Read access' },
  { key: 'manage_persons', label: 'Manage Persons', hint: 'Create and edit persons', group: 'Operations' },
  { key: 'manage_events', label: 'Manage Events', hint: 'Delete events', group: 'Operations' },
  { key: 'manage_cameras', label: 'Manage Cameras', hint: 'Add, edit, delete cameras', group: 'Operations' },
  { key: 'manage_alerts', label: 'Manage Alerts', hint: 'Configure alert rules', group: 'Administration' },
  { key: 'export_reports', label: 'Reports / Export', hint: 'Download and schedule reports', group: 'Administration' },
  { key: 'manage_users', label: 'Users / Roles', hint: 'Create and control users', group: 'Administration' },
  { key: 'manage_settings', label: 'System Settings', hint: 'Audit, webhooks, settings', group: 'Administration' },
];

const DEFAULT_USER_PERMISSIONS = ['view_dashboard', 'view_events', 'view_persons', 'view_attendance'];
const OPERATOR_USER_PERMISSIONS = [...DEFAULT_USER_PERMISSIONS, 'view_cameras', 'view_live', 'manage_persons', 'manage_events'];
const ADMIN_USER_PERMISSIONS = USER_PERMISSION_OPTIONS.map(p => p.key);
const USER_PERMISSION_GROUPS = ['Read access', 'Operations', 'Administration'];

function normalizeUiPermissions(value) {
  const allowed = new Set(USER_PERMISSION_OPTIONS.map(p => p.key));
  const source = Array.isArray(value) && value.length ? value : DEFAULT_USER_PERMISSIONS;
  return source.filter((p, i) => allowed.has(p) && source.indexOf(p) === i);
}

function permissionSummary(value, t) {
  const permissions = normalizeUiPermissions(value);
  if (permissions.length === ADMIN_USER_PERMISSIONS.length) return t('fullAccess');
  if (permissions.some(p => ['manage_users', 'manage_settings', 'manage_alerts', 'export_reports'].includes(p))) return t('adminTools');
  if (permissions.some(p => p.startsWith('manage_'))) return t('operations');
  return t('readOnly');
}

function PermissionChecklist({ value, onChange, compact = false }) {
  const selected = new Set(normalizeUiPermissions(value));

  const toggle = key => {
    const next = selected.has(key)
      ? [...selected].filter(p => p !== key)
      : [...selected, key];
    onChange(normalizeUiPermissions(next));
  };

  return (
    <div className={compact ? 'permission-grid compact' : 'permission-grid'}>
      {USER_PERMISSION_GROUPS.map(group => (
        <div key={group} className="permission-group">
          {!compact && <div className="permission-group-title">{group}</div>}
          {USER_PERMISSION_OPTIONS.filter(item => item.group === group).map(item => (
            <label key={item.key} className={selected.has(item.key) ? 'permission-check checked' : 'permission-check'}>
              <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
              <span>
                <b>{item.label}</b>
                {!compact && <small>{item.hint}</small>}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function Card({ children, className = '', onClick }) {
  return <div className={'card ' + className} onClick={onClick}>{children}</div>;
}

export default function UsersManagement({ usersList, loadUsers, authFetch, currentUser, showConfirm }) {
  const t = useTr();
  const [form, setForm] = useState({ username: '', password: '', permissions: DEFAULT_USER_PERMISSIONS });
  const [showCreatePermissions, setShowCreatePermissions] = useState(false);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState(null);

  const createUser = async () => {
    if (!form.username || !form.password) { toast.warn(t('usernamePasswordRequired')); return; }
    const res = await authFetch(API + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.detail || t('failedToUpdate')); return; }
    setForm({ username: '', password: '', permissions: DEFAULT_USER_PERMISSIONS });
    toast.success(t('userCreated'));
    loadUsers();
  };

  const updatePermissions = async (user, permissions) => {
    if (user.id === currentUser.id && !permissions.includes('manage_users')) {
      toast.warn(t('keepUsersRoles'));
      return;
    }
    const res = await authFetch(API + '/api/users/' + user.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    if (res.ok) { toast.success(t('permissionsUpdated')); loadUsers(); }
    else { const data = await res.json().catch(() => ({})); toast.error(data.detail || t('failedToUpdate')); }
  };

  const toggleUserStatus = async (user) => {
    if (user.id === currentUser.id) { toast.error(t('securityAlertOwn')); return; }
    const res = await authFetch(API + '/api/users/' + user.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    if (res.ok) { toast.success(t('userStatusUpdated')); loadUsers(); }
    else toast.error(t('failedToUpdate'));
  };

  const deleteUser = id => {
    if (id === currentUser.id) { toast.warn(t('cannotDeleteYourself')); return; }
    showConfirm(t('delete') + '?', async () => {
      const res = await authFetch(API + '/api/users/' + id, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json(); toast.error(data.detail || t('failedToDelete')); return; }
      loadUsers();
    });
  };

  return (
    <>
      <Card className="user-create">
        <h2>{t('createUser')}</h2>
        <p className="muted">{t('adminCreateUserNote')}</p>
        <div className="user-create-grid">
          <input placeholder={t('username')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input type="password" placeholder={t('password')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <PasswordStrength password={form.password} />
          </div>
          <button className="save-btn" onClick={createUser}><UserPlus size={18} />{t('create')}</button>
        </div>
        <div className="permission-presets">
          <button className="ghost-btn" onClick={() => setForm({ ...form, permissions: DEFAULT_USER_PERMISSIONS })}>{t('readOnly')}</button>
          <button className="ghost-btn" onClick={() => setForm({ ...form, permissions: OPERATOR_USER_PERMISSIONS })}>{t('operator')}</button>
          <button className="ghost-btn" onClick={() => setForm({ ...form, permissions: ADMIN_USER_PERMISSIONS })}>{t('fullAccess')}</button>
          <button className="ghost-btn permission-more-btn" onClick={() => setShowCreatePermissions(v => !v)}>
            {showCreatePermissions ? t('hideDetails') : t('seeMore')}
          </button>
          <span>{normalizeUiPermissions(form.permissions).length} {t('selected')}</span>
        </div>
        {showCreatePermissions && (
          <PermissionChecklist value={form.permissions} onChange={permissions => setForm({ ...form, permissions })} />
        )}
      </Card>

      <div className="users-table">
        {usersList.map(u => (
          <Card key={u.id} className="user-row-card">
            <div className="user-row-main">
              <div className="user-avatar">{(u.username || '?').slice(0, 1).toUpperCase()}</div>
              <div>
                <b>{u.username}</b>
                <p>
                  <span className={u.is_active ? 'user-status active' : 'user-status inactive'}>{u.is_active ? t('active') : t('inactive')}</span>
                  <span>{permissionSummary(u.permissions, t)}</span>
                  <span>{normalizeUiPermissions(u.permissions).length} {t('selected')}</span>
                </p>
                <small>{formatDateTime(u.created_at)}</small>
              </div>
            </div>
            <div className="user-row-actions">
              {u.role === 'admin' ? (
                <span className="admin-lock-badge">{t('fullAccessLocked')}</span>
              ) : (
                <button className="ghost-btn" onClick={() => setEditingPermissionsFor(editingPermissionsFor === u.id ? null : u.id)}>
                  {editingPermissionsFor === u.id ? t('close') : t('settings')}
                </button>
              )}
              <button
                className="ghost-btn"
                style={{ padding: '6px', opacity: u.id === currentUser.id ? 0.4 : 1, cursor: u.id === currentUser.id ? 'not-allowed' : 'pointer' }}
                onClick={() => toggleUserStatus(u)}
                title={u.id === currentUser.id ? t('cannotChangeOwnStatus') : (u.is_active ? t('inactive') : t('active'))}
              >
                {u.is_active ? <ToggleRight size={20} color="var(--success)" /> : <ToggleLeft size={20} color="var(--muted-2)" />}
              </button>
              <button className="danger" onClick={() => deleteUser(u.id)}><Trash2 size={16} /></button>
            </div>
            {editingPermissionsFor === u.id && u.role !== 'admin' && (
              <div className="user-permission-editor">
                <PermissionChecklist value={u.permissions} onChange={permissions => updatePermissions(u, permissions)} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
