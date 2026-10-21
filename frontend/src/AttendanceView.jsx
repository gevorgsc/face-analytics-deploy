import React, { Suspense, lazy } from 'react';
import { ArrowUpDown, BarChart3, Clock, FileText } from 'lucide-react';
import ReportsCenterPanel from './ReportsCenterPanel';
import { API } from './apiConfig';

const AttendanceTimelinePro = lazy(() => import('./AttendanceTimelinePro'));
const AttendanceRulesPanel = lazy(() => import('./AttendanceRulesPanel'));
const InOutWidget = lazy(() => import('./InOutWidget'));

export default function AttendanceView({
  attendance,
  attendanceGroup,
  attendancePerson,
  attendanceView,
  authFetch,
  currentUser,
  downloadExport,
  inoutFilter,
  inoutRefreshAt,
  isAdmin,
  openPersonHistory,
  setAttendanceGroup,
  setAttendancePerson,
  setAttendanceView,
  setPreviewImage,
  setShowExportMenu,
  showExportMenu,
  t,
  token,
  visiblePersons,
  Card,
}) {
  return (
    <>
      <div className="attendance-subtabs" role="tablist" aria-label="Attendance views">
        <button
          className={attendanceView === 'timeline' ? 'active' : ''}
          onClick={() => setAttendanceView('timeline')}
          role="tab"
          aria-selected={attendanceView === 'timeline'}
        >
          <BarChart3 size={14} /> {t('attendance')}
        </button>
        {isAdmin && (
          <button
            className={attendanceView === 'reports' ? 'active' : ''}
            onClick={() => setAttendanceView('reports')}
            role="tab"
            aria-selected={attendanceView === 'reports'}
          >
            <FileText size={14} /> {t('reports')}
          </button>
        )}
        <button
          className={attendanceView === 'rules' ? 'active' : ''}
          onClick={() => setAttendanceView('rules')}
          role="tab"
          aria-selected={attendanceView === 'rules'}
        >
          <Clock size={14} /> Work Rules
        </button>
        <button
          className={attendanceView === 'inout' ? 'active' : ''}
          onClick={() => setAttendanceView('inout')}
          role="tab"
          aria-selected={attendanceView === 'inout'}
        >
          <ArrowUpDown size={14} /> IN / OUT
        </button>
      </div>

      {attendanceView === 'inout' ? (
        <Suspense fallback={<div className="loading-placeholder">Loading...</div>}>
          <InOutWidget
            authFetch={authFetch}
            API={API}
            setPreviewImage={setPreviewImage}
            openPersonHistory={openPersonHistory}
            fullPage
            defaultFilter={inoutFilter}
            refreshTrigger={inoutRefreshAt}
          />
        </Suspense>
      ) : attendanceView === 'reports' && isAdmin ? (
        <ReportsCenterPanel token={token} />
      ) : attendanceView === 'rules' ? (
        <Suspense fallback={<div className="loading-placeholder">Loading...</div>}>
          <AttendanceRulesPanel authFetch={authFetch} API={API} isAdmin={isAdmin} />
        </Suspense>
      ) : (
        <>
          <Card className="filters">
            <select value={attendanceGroup} onChange={event => setAttendanceGroup(event.target.value)}>
              <option value="all">{t('allGroups')}</option>
              <option value="employee">{t('employees')}</option>
              <option value="vip">{t('vipClients')}</option>
              <option value="blacklist">{t('blacklist')}</option>
              <option value="unknown">{t('unknown')}</option>
            </select>

            <select value={attendancePerson} onChange={event => setAttendancePerson(event.target.value)}>
              <option value="all">{t('allPersons')}</option>
              {visiblePersons.map(person => (
                <option key={person.id} value={person.id}>
                  {person.full_name} - {person.person_type}
                </option>
              ))}
            </select>

            {isAdmin && (
              <div className="export-menu-wrap">
                <button
                  className="save-btn"
                  type="button"
                  onClick={() => setShowExportMenu(value => !value)}
                >
                  {t('exportMenu')}
                </button>

                {showExportMenu && (
                  <div className="export-menu">
                    <button onClick={() => downloadExport('/api/export/attendance', 'attendance_export.xlsx')}>
                      {t('exportAttendanceExcel')}
                    </button>
                    <button onClick={() => downloadExport('/api/export/attendance/pdf', 'attendance_report.pdf')}>
                      {t('exportAttendancePdf')}
                    </button>
                    <button onClick={() => downloadExport('/api/export/events', 'events_export.xlsx')}>
                      {t('exportEventsExcel')}
                    </button>
                    <button onClick={() => downloadExport('/api/export/persons', 'persons_export.xlsx')}>
                      {t('exportPersonsExcel')}
                    </button>
                    <button onClick={() => downloadExport('/api/export/audit-logs', 'audit_logs_export.xlsx')}>
                      {t('exportAuditExcel')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          <AttendanceTimelinePro
            attendance={attendance}
            setPreviewImage={setPreviewImage}
            openPersonHistory={openPersonHistory}
            t={t}
            API={API}
          />
        </>
      )}
    </>
  );
}
