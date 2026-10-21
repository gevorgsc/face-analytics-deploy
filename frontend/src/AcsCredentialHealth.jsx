import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Contact, Fingerprint, IdCard,
  KeyRound, RefreshCw, Search, ShieldCheck, UserRoundCheck,
} from 'lucide-react';

import { apiFetch } from './apiClient';
import { API } from './apiConfig';
import AcsUiSelect from './AcsUiSelect';

const ISSUE_OPTIONS = [
  ['', 'All persons'],
  ['sync_failed', 'Sync failed'],
  ['sync_pending', 'Sync pending'],
  ['schedule_unmapped', 'Schedule not mapped'],
  ['schedule_conflict', 'Schedule conflict'],
  ['missing_access_level', 'No access level'],
  ['missing_face', 'Missing face'],
  ['missing_card', 'Missing card'],
  ['missing_fingerprint', 'Missing fingerprint'],
  ['missing_pin', 'Missing PIN'],
];

const CREDENTIALS = [
  ['face', 'Face', Contact],
  ['card', 'Card', IdCard],
  ['fingerprint', 'Fingerprint', Fingerprint],
  ['pin', 'PIN', KeyRound],
  ['access_level', 'Access Level', ShieldCheck],
];

function CredentialIssueSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef(null);
  const selected = ISSUE_OPTIONS.find(([optionValue]) => optionValue === value) || ISSUE_OPTIONS[0];

  const toggle = () => {
    setOpen(current => {
      const next = !current;
      if (next && rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        setDropUp(window.innerHeight - rect.bottom < 360 && rect.top > 360);
      }
      return next;
    });
  };

  return (
    <div
      ref={rootRef}
      className={`credential-issue-select ${dropUp ? 'drop-up' : ''}`}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={open ? 'open' : ''}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span>{selected[1]}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="credential-issue-menu" role="listbox">
          {ISSUE_OPTIONS.map(([optionValue, label]) => {
            const active = optionValue === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'active' : ''}
                key={optionValue || 'all'}
                onClick={() => {
                  onChange(optionValue);
                  setOpen(false);
                }}
              >
                <span>{label}</span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SyncBadge({ status }) {
  return <span className={`pm-sync ${status || 'local'}`}>{status || 'local'}</span>;
}

function errorText(raw) {
  if (!raw) return '';
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) {
      return value.map(item => item.message || item.device_name || 'Provisioning failed').join('; ');
    }
  } catch (_) {}
  return String(raw);
}

export default function AcsCredentialHealth() {
  const [data, setData] = useState({ summary: {}, credentials: {}, persons: [] });
  const [issue, setIssue] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(new Set());
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (issue) params.set('issue', issue);
      if (search.trim()) params.set('search', search.trim());
      const response = await apiFetch(`${API}/api/acs/credential-health?${params}`);
      if (!response.ok) throw new Error('Credential health could not be loaded');
      setData(await response.json());
    } catch (error) {
      setMessage(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }, [issue, search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const retry = async personIds => {
    const ids = personIds || [];
    setRetrying(new Set(ids.length ? ids : data.persons.map(person => person.id)));
    setMessage('');
    try {
      const response = await apiFetch(`${API}/api/acs/credential-health/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length ? { person_ids: ids } : { all_failed: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Retry failed');
      setMessage(`Queued ${result.queued_count || 0} person(s).${result.skipped?.length ? ` Skipped ${result.skipped.length}.` : ''}`);
      await load();
    } catch (error) {
      setMessage(error.message || String(error));
    } finally {
      setRetrying(new Set());
    }
  };

  const issueCount = useMemo(
    () => data.persons.filter(person => person.issues?.length).length,
    [data.persons],
  );

  return (
    <div className="acs-panel credential-health">
      <div className="acs-panel-header">
        <div className="acs-panel-title">
          <UserRoundCheck size={19} />
          <div>
            <strong>Credential & Apply Health</strong>
            <small>Person credentials, access assignment and controller provisioning</small>
          </div>
        </div>
        <div className="credential-health-actions">
          <button className="ghost-btn" onClick={() => retry()} disabled={retrying.size > 0}>
            <RefreshCw size={13} className={retrying.size ? 'spin' : ''} /> Retry Failed
          </button>
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {message && <div className="credential-health-message">{message}</div>}

      <div className="credential-health-summary">
        <div><Contact /><strong>{data.summary.total_persons || 0}</strong><span>Total Persons</span></div>
        <div className="ok"><CheckCircle2 /><strong>{data.summary.configured || 0}</strong><span>Applied</span></div>
        <div className="warn"><RefreshCw /><strong>{data.summary.pending || 0}</strong><span>Pending</span></div>
        <div className="danger"><AlertTriangle /><strong>{data.summary.failed || 0}</strong><span>Failed</span></div>
        <div className={issueCount ? 'warn' : 'ok'}><ShieldCheck /><strong>{issueCount}</strong><span>Need Attention</span></div>
      </div>

      <div className="credential-coverage-grid">
        {CREDENTIALS.map(([key, label, Icon]) => {
          const item = data.credentials[key] || {};
          const total = (item.configured || 0) + (item.missing || 0);
          const percent = total ? Math.round((item.configured || 0) / total * 100) : 0;
          return (
            <button key={key} onClick={() => setIssue(`missing_${key}`)}>
              <span className="credential-coverage-icon"><Icon size={18} /></span>
              <span><strong>{label}</strong><small>{item.configured || 0} configured / {item.missing || 0} missing</small></span>
              <b>{percent}%</b>
              <i><span style={{ width: `${percent}%` }} /></i>
            </button>
          );
        })}
      </div>

      <div className="acs-filter-bar credential-health-filters">
        <label>
          <span>Search</span>
          <div className="credential-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ID, name or department" /></div>
        </label>
        <label>
          <span>Issue</span>
          <AcsUiSelect
              className="credential-issue-ui-select"
              label="Issue"
              value={issue}
              onChange={setIssue}
              minWidth="220px"
              options={ISSUE_OPTIONS.map(([value, label]) => ({ value, label }))}
            />
        </label>
      </div>

      <div className="acs-table-wrap">
        <table className="acs-table credential-health-table">
          <thead>
            <tr>
              <th>Person</th><th>Credentials</th><th>Access</th><th>Apply Status</th><th>Issues</th><th />
            </tr>
          </thead>
          <tbody>
            {!loading && data.persons.length === 0 && (
              <tr><td colSpan="6" className="credential-health-empty">No matching persons.</td></tr>
            )}
            {data.persons.map(person => (
              <tr key={person.id}>
                <td>
                  <strong>{person.full_name || 'Unnamed person'}</strong>
                  <small>{person.employee_no || '-'}{person.department ? ` / ${person.department}` : ''}</small>
                </td>
                <td>
                  <div className="credential-mini-list">
                    <span className={person.has_face ? 'ok' : ''}>Face</span>
                    <span className={person.card_count ? 'ok' : ''}>Card {person.card_count || ''}</span>
                    <span className={person.fingerprint_count ? 'ok' : ''}>Finger {person.fingerprint_count || ''}</span>
                    <span className={person.has_pin ? 'ok' : ''}>PIN</span>
                  </div>
                </td>
                <td><strong>{person.access_level_count}</strong> level(s)<small>{person.device_count} controller(s)</small></td>
                <td><SyncBadge status={person.sync_status} /><small title={errorText(person.sync_error)}>{errorText(person.sync_error)}</small></td>
                <td>
                  <div className="credential-issues">
                    {person.issues.length
                      ? person.issues.map(value => <span key={value}>{value.replaceAll('_', ' ')}</span>)
                      : <span className="healthy">Healthy</span>}
                  </div>
                </td>
                <td>
                  {person.acs_active && ['error', 'failed', 'pending'].includes(person.sync_status) && (
                    <button className="btn-ghost-sm" onClick={() => retry([person.id])} disabled={retrying.has(person.id)}>
                      <RefreshCw size={12} className={retrying.has(person.id) ? 'spin' : ''} /> Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
