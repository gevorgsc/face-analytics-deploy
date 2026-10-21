import React, { Suspense, lazy } from 'react';
import { BarChart2, ShieldAlert } from 'lucide-react';
import { API } from './apiConfig';

const AuditLogs = lazy(() => import('./AuditLogs'));
const QualityDashboard = lazy(() => import('./QualityDashboard'));

export default function AuditView({
  auditLogs,
  auditView,
  authFetch,
  isAdmin,
  loadAuditLogs,
  logout,
  setAuditView,
  t,
  token,
}) {
  if (!isAdmin) return null;

  return (
    <>
      <div className="attendance-subtabs" role="tablist" aria-label="Audit views">
        <button
          className={auditView === 'logs' ? 'active' : ''}
          onClick={() => setAuditView('logs')}
          role="tab"
          aria-selected={auditView === 'logs'}
        >
          <ShieldAlert size={14} /> {t('auditLogs')}
        </button>
        <button
          className={auditView === 'quality' ? 'active' : ''}
          onClick={() => setAuditView('quality')}
          role="tab"
          aria-selected={auditView === 'quality'}
        >
          <BarChart2 size={14} /> Face Quality
        </button>
      </div>

      {auditView === 'quality' ? (
        <Suspense fallback={<div className="loading-placeholder">Loading...</div>}>
          <QualityDashboard authFetch={authFetch} API={API} isAdmin={isAdmin} />
        </Suspense>
      ) : (
        <AuditLogs
          logs={auditLogs}
          loadAuditLogs={loadAuditLogs}
          token={token}
          onLogoutEverywhere={logout}
          t={t}
        />
      )}
    </>
  );
}
