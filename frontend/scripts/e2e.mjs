import { readFileSync } from 'node:fs';

const files = {
  app: readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  apiClient: readFileSync(new URL('../src/apiClient.js', import.meta.url), 'utf8'),
  acsApp: readFileSync(new URL('../src/AcsApp.jsx', import.meta.url), 'utf8'),
  attendance: readFileSync(new URL('../src/AttendanceDashboard.jsx', import.meta.url), 'utf8'),
  cameras: readFileSync(new URL('../src/CamerasManagementPro.jsx', import.meta.url), 'utf8'),
  confirm: readFileSync(new URL('../src/ConfirmModal.jsx', import.meta.url), 'utf8'),
  eventGrid: readFileSync(new URL('../src/EventGridPro.jsx', import.meta.url), 'utf8'),
  audit: readFileSync(new URL('../src/AuditLogs.jsx', import.meta.url), 'utf8'),
  enterprise: readFileSync(new URL('../src/EnterprisePanels.jsx', import.meta.url), 'utf8'),
  eventNotifications: readFileSync(new URL('../src/EventNotificationSettings.jsx', import.meta.url), 'utf8'),
  login: readFileSync(new URL('../src/LoginScreenPro.jsx', import.meta.url), 'utf8'),
  users: readFileSync(new URL('../src/UsersManagement.jsx', import.meta.url), 'utf8'),
};

const checks = [
  ['login screen submits credentials through onLogin', files.login.includes('onLogin(data)') && files.login.includes('/api/auth/login')],
  ['authenticated app stores access and refresh tokens', files.app.includes('access_token') && files.app.includes('refresh_token')],
  ['events flow requests server-side pages', files.app.includes('/api/events?limit=${EVENTS_PAGE_SIZE}&offset=${(eventsPage - 1) * EVENTS_PAGE_SIZE}')],
  ['events grid can change pages', files.eventGrid.includes('onPageChange') && files.eventGrid.includes('PaginationBar')],
  ['new websocket event does not force page one', !files.app.includes('setEventsPage(1);') && !files.app.includes('setEventsPage(1)')],
  ['logout flow requires confirmation', files.app.includes('requestLogout') && files.app.includes('logoutConfirm') && files.confirm.includes('onConfirm')],
  ['logout revokes the server refresh session', files.app.includes('/api/auth/logout') && files.app.includes("refresh_token: refreshToken || ''")],
  ['refresh requests are deduplicated', files.apiClient.includes('if (refreshPromise) return refreshPromise')],
  ['main app orchestrators use the shared API client', !files.app.includes('fetch(') && !files.acsApp.includes('fetch(') && !files.attendance.includes('fetch(')],
  ['camera management can create cameras', files.app.includes("authFetch(API + '/api/cameras'") && files.app.includes("method: 'POST'")],
  ['camera management can update cameras', files.app.includes('authFetch(API + `/api/cameras/${id}`') && files.app.includes("method: 'PATCH'")],
  ['camera management can delete cameras with confirmation', files.app.includes("showConfirm(t('deleteCamera')") && files.app.includes("method: 'DELETE'")],
  ['camera form avoids resending masked passwords', files.cameras.includes('password:') && files.cameras.includes("if (!payload.password) delete payload.password")],
  ['camera streams use signed URLs instead of JWT query params', files.app.includes('/api/ws-url') && files.cameras.includes('/stream-url') && !files.cameras.includes('/stream?token=')],
  ['camera cards can request authenticated live snapshots', files.cameras.includes('/api/cameras/${camera.id}/snapshot') && files.cameras.includes('authFetch')],
  ['live grid page is removed from navigation', !files.app.includes("setTab('camera-grid')") && !files.app.includes("tab === 'camera-grid'")],
  ['sessions are nested inside audit logs view', !files.app.includes("setTab('sessions')") && files.audit.includes('audit-subtabs') && files.audit.includes('SessionsPanel')],
  ['reports are nested inside attendance view', !files.app.includes("setTab('reports')") && !files.app.includes("tab === 'reports'") && files.app.includes('attendance-subtabs') && files.app.includes('ReportsPanel')],
  ['report previews use signed URLs instead of JWT query params', files.enterprise.includes('/preview-url') && !files.enterprise.includes('/preview?token=')],
  ['event notifications have a separate event page', !files.app.includes("tab === 'alerts'") && !files.app.includes("setTab('alerts')") && files.app.includes("tab === 'event-admin'") && files.app.includes('eventAdminView')],
  ['user creation uses permission checkboxes instead of role dropdown', files.users.includes('USER_PERMISSION_OPTIONS') && files.users.includes('PermissionChecklist') && !files.users.includes('<option value="admin">Admin</option>')],
  ['alerts support telegram notification channel', files.enterprise.includes("type: 'telegram'") && files.enterprise.includes('bot_token') && files.enterprise.includes('chat_id')],
  ['event sounds are configurable by event type', files.app.includes('eventSoundSettings') && files.eventNotifications.includes('SOUND_OPTION_KEYS') && files.eventNotifications.includes('playEventSound')],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}

console.log(`Frontend e2e smoke checks passed (${checks.length})`);
