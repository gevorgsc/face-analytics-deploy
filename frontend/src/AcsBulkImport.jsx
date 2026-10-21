import { apiFetch } from './apiClient';
import React, { useState, useCallback, useRef } from 'react';
import { Upload, Download, Eye, Play, CheckCircle, AlertTriangle } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

const ACTION_BADGE = { create: 'acs-badge-green', update: 'acs-badge-blue' };

export default function AcsBulkImport({ token, isAdmin }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [result, setResult]     = useState(null);
  const [devices, setDevices]   = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [updateExisting, setUpdateExisting] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [stage, setStage]       = useState('upload');
  const fileInputRef = useRef(null);

  React.useEffect(() => {
    apiFetch(`${API}/api/acs`, { headers: H(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setDevices);
  }, [token]);

  const doPreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (deviceId) fd.append('device_id', deviceId);
      const res = await apiFetch(`${API}/api/acs/bulk-import/preview`, { method: 'POST', headers: H(token), body: fd });
      if (res.ok) { setPreview(await res.json()); setStage('preview'); }
    } finally { setLoading(false); }
  }, [file, deviceId, token]);

  const doExecute = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (deviceId) fd.append('device_id', deviceId);
      fd.append('update_existing', updateExisting ? '1' : '0');
      const res = await apiFetch(`${API}/api/acs/bulk-import/execute`, { method: 'POST', headers: H(token), body: fd });
      if (res.ok) { setResult(await res.json()); setStage('done'); }
    } finally { setLoading(false); }
  }, [file, deviceId, updateExisting, token]);

  const downloadTemplate = async () => {
    const res = await apiFetch(`${API}/api/acs/bulk-import/template/csv`, { headers: H(token) });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'acs_bulk_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setStage('upload'); };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Upload size={18} /> Bulk Import</div>
        <button className="ghost-btn" onClick={downloadTemplate}><Download size={13} /> Template CSV</button>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Import persons and optionally issue cards from a CSV or Excel file. Download the template to see the required columns.
      </p>

      {stage === 'upload' && (
        <div className="acs-form-card">
          <h4><Upload size={14} /> Select File</h4>
          <div className="acs-form-grid">
            <label>File (CSV or Excel)
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => setFile(e.target.files[0] || null)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 42 }}>
                <button type="button" className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={13} /> Choose File
                </button>
                <span style={{ color: file ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file?.name || 'No file selected'}
                </span>
              </div>
            </label>
            <label>Issue cards to device (optional)
              <select value={deviceId} onChange={e => setDeviceId(e.target.value)}>
                <option value="">— no card issuance —</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} />
              Update existing persons (match by employee_no)
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="save-btn" onClick={doPreview} disabled={!file || loading}>
              <Eye size={13} /> {loading ? 'Parsing…' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {stage === 'preview' && preview && (
        <>
          <div className="acs-form-card" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <span>Total rows: <strong>{preview.total_rows}</strong></span>
              <span>To create: <span className="acs-badge acs-badge-green">{preview.preview.filter(r => r.action === 'create').length}</span></span>
              <span>To update: <span className="acs-badge acs-badge-blue">{preview.preview.filter(r => r.action === 'update').length}</span></span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              Columns found: {preview.columns_found.join(', ')}
            </div>
          </div>

          <div className="acs-table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="acs-table">
              <thead><tr><th>Row</th><th>Name</th><th>Emp #</th><th>Department</th><th>Card</th><th>Action</th></tr></thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{row.row}</td>
                    <td>{row.full_name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.employee_no || '—'}</td>
                    <td>{row.department || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.card_number || '—'}</td>
                    <td>
                      <span className={`acs-badge ${ACTION_BADGE[row.action] || 'acs-badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                        {row.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={reset}>Cancel</button>
            <button className="save-btn" onClick={doExecute} disabled={loading}>
              <Play size={13} /> {loading ? 'Importing…' : 'Execute Import'}
            </button>
          </div>
        </>
      )}

      {stage === 'done' && result && (
        <div className="acs-form-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {result.errors === 0
              ? <CheckCircle size={22} style={{ color: 'var(--success, #16a34a)' }} />
              : <AlertTriangle size={22} style={{ color: '#f59e0b' }} />}
            <strong style={{ fontSize: 15 }}>Import Complete</strong>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="acs-badge acs-badge-green">Created: {result.created}</span>
            <span className="acs-badge acs-badge-blue">Updated: {result.updated}</span>
            <span className="acs-badge acs-badge-gray">Skipped: {result.skipped}</span>
            {result.errors > 0 && <span className="acs-badge acs-badge-red">Errors: {result.errors}</span>}
          </div>
          {result.error_rows?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Error details:</div>
              {result.error_rows.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--danger, #ef4444)' }}>Row {e.row}: {e.error}</div>
              ))}
            </div>
          )}
          <div className="acs-form-actions" style={{ marginTop: 12 }}>
            <button className="save-btn" onClick={reset}>Import Another File</button>
          </div>
        </div>
      )}
    </div>
  );
}
