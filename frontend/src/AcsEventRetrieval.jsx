import React, { useCallback, useEffect, useState } from 'react';
import { List, RefreshCw } from 'lucide-react';

import { apiFetch } from './apiClient';
import { API } from './apiConfig';
import AcsUiSelect from './AcsUiSelect';

const EMPTY_FILTERS = {
  query: '',
  device_id: '',
  door_no: '',
  event_type: '',
  verify_mode: '',
  date_from: '',
  date_to: '',
};

function badgeClass(type) {
  if (!type) return 'acs-badge-gray';
  if (type.includes('denied') || type === 'alarm') return 'acs-badge-red';
  if (type.includes('unlock') || type.includes('granted')) return 'acs-badge-green';
  if (type.includes('door')) return 'acs-badge-blue';
  return 'acs-badge-gray';
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function filterDateLabel(value) {
  return value ? value.replace('T', ' ') : 'Select date and time';
}

export default function AcsEventRetrieval() {
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [eventResponse, deviceResponse] = await Promise.all([
        apiFetch(`${API}/api/acs/events/search?${params}`),
        devices.length ? Promise.resolve(null) : apiFetch(`${API}/api/acs`),
      ]);
      if (eventResponse.ok) {
        const data = await eventResponse.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
      if (deviceResponse?.ok) setDevices(await deviceResponse.json());
    } finally {
      setLoading(false);
    }
  }, [devices.length, filters, offset]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters(current => ({ ...current, [key]: value }));
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title">
          <List size={18} />
          <div><strong>Access Control Retrieval</strong><small>{total} matching record(s)</small></div>
        </div>
        <button className="ghost-btn" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="acs-retrieval-filters">
        <label className="acs-retrieval-filter-query"><span>Person / Card / Employee ID</span><input value={filters.query} onChange={event => setFilter('query', event.target.value)} placeholder="Search access records" /></label>
        <label className="acs-retrieval-filter-controller"><span>Controller</span><AcsUiSelect
            className="acs-retrieval-ui-select acs-retrieval-controller-select"
            label="Controller"
            value={filters.device_id}
            onChange={value => setFilter('device_id', value)}
            minWidth="128px"
            options={[{ value: '', label: 'All' }, ...devices.map(device => ({ value: String(device.id), label: device.name }))]}
          /></label>
        <label className="acs-retrieval-filter-door"><span>Door</span><input type="number" min="1" value={filters.door_no} onChange={event => setFilter('door_no', event.target.value)} placeholder="All" /></label>
        <label className="acs-retrieval-filter-event"><span>Event</span><AcsUiSelect
            className="acs-retrieval-ui-select acs-retrieval-event-select"
            label="Event"
            value={filters.event_type}
            onChange={value => setFilter('event_type', value)}
            minWidth="188px"
            options={[
              { value: '', label: 'All events' },
              { value: 'access_granted', label: 'Access granted' },
              { value: 'access_denied', label: 'Access denied' },
              { value: 'alarm', label: 'Alarm' },
              { value: 'manual_unlock', label: 'Manual unlock' },
            ]}
          /></label>
        <label className="acs-retrieval-filter-credential"><span>Credential</span><AcsUiSelect
            className="acs-retrieval-ui-select acs-retrieval-credential-select"
            label="Credential"
            value={filters.verify_mode}
            onChange={value => setFilter('verify_mode', value)}
            minWidth="128px"
            options={[
              { value: '', label: 'All' },
              { value: 'face', label: 'Face' },
              { value: 'card', label: 'Card' },
              { value: 'fingerprint', label: 'Fingerprint' },
              { value: 'card_and_face', label: 'Card + face' },
              { value: 'manual', label: 'Manual' },
            ]}
          /></label>
        <label className="acs-retrieval-filter-date acs-retrieval-filter-from"><span>From</span><div className="acs-retrieval-date-field">
          <input type="datetime-local" value={filters.date_from} onChange={event => setFilter('date_from', event.target.value)} aria-label="From" style={{ color: 'transparent', caretColor: 'transparent', position: 'relative', zIndex: 1, width: '100%' }} />
          <span aria-hidden="true" style={{ position: 'absolute', left: 12, right: 36, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: filters.date_from ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 2 }}>{filterDateLabel(filters.date_from)}</span>
        </div></label>
        <label className="acs-retrieval-filter-date acs-retrieval-filter-to"><span>To</span><div className="acs-retrieval-date-field">
          <input type="datetime-local" value={filters.date_to} onChange={event => setFilter('date_to', event.target.value)} aria-label="To" style={{ color: 'transparent', caretColor: 'transparent', position: 'relative', zIndex: 1, width: '100%' }} />
          <span aria-hidden="true" style={{ position: 'absolute', left: 12, right: 36, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: filters.date_to ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 2 }}>{filterDateLabel(filters.date_to)}</span>
        </div></label>
        <button className="ghost-btn" onClick={() => { setOffset(0); setFilters(EMPTY_FILTERS); }}>Clear</button>
      </div>

      {loading ? (
        <div className="acs-loading-main">Loading...</div>
      ) : events.length === 0 ? (
        <div className="acs-empty-pro" style={{ margin: 0 }}>
          <List size={36} />
          <h3>No matching access events</h3>
          <p>Change the retrieval filters or wait for controller activity.</p>
        </div>
      ) : (
        <div className="acs-table-wrap">
          <table className="acs-table">
            <thead>
              <tr><th>#</th><th>Time</th><th>Device</th><th>Door</th><th>Type</th><th>Credential</th><th>Person / Card</th></tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={event.id}>
                  <td>{offset + index + 1}</td>
                  <td className="acs-td-time">{formatDate(event.created_at)}</td>
                  <td>{event.device_name || '-'}</td>
                  <td>Door {event.door_no ?? '-'}</td>
                  <td><span className={`acs-badge ${badgeClass(event.event_type)}`}>{event.event_type?.replaceAll('_', ' ')}</span></td>
                  <td>{event.verify_mode || '-'}</td>
                  <td>{event.person_name || event.card_number || '-'}<small>{event.employee_no || event.denial_reason || ''}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="acs-retrieval-pagination">
        <span>Showing {total ? offset + 1 : 0}-{Math.min(offset + events.length, total)} of {total}</span>
        <div>
          <button className="ghost-btn" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - limit))}>Previous</button>
          <button className="ghost-btn" disabled={offset + events.length >= total || loading} onClick={() => setOffset(value => value + limit)}>Next</button>
        </div>
      </div>
    </div>
  );
}
