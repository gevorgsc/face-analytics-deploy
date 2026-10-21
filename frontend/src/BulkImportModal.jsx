// BulkImportModal.jsx - CSV bulk person import

import React, { useRef, useState } from 'react';
import { Upload, Download, X, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const CSV_TEMPLATE = `full_name,person_type,department,phone,notes
Armen Petrosyan,employee,IT,,
Anna Hakobyan,vip,Management,,VIP client
Varduhi Sargsyan,employee,HR,+374-91-123456,`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'persons_import_template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function BulkImportModal({ authFetch, API, onClose, onDone }) {
  const fileRef              = useRef();
  const [file, setFile]      = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState('');

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
    setError('');
    // Show first 5 lines as preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split('\n').slice(0, 6);
      setPreview(lines.join('\n'));
    };
    reader.onerror = () => setError('Failed to read file. Please try again.');
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch(API + '/api/persons/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Import failed'); return; }
      setResult(data);
      if (data.created > 0) onDone?.();
    } catch (e) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box bulk-import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Upload size={15} /> Bulk Import Persons</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="bulk-import-body">
          <div className="bulk-import-actions">
            <button className="btn-sm" onClick={downloadTemplate}>
              <Download size={12} /> Download CSV Template
            </button>
          </div>

          <div
            className={`bulk-drop-zone ${file ? 'has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt"
              onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
              style={{ display: 'none' }} />
            {file ? (
              <><CheckCircle2 size={20} color="#22c55e" /><span>{file.name}</span></>
            ) : (
              <><Upload size={20} /><span>Click or drag CSV file here</span></>
            )}
          </div>

          {preview && (
            <pre className="bulk-preview">{preview}</pre>
          )}

          {error && (
            <div className="bulk-error"><XCircle size={13} /> {error}</div>
          )}

          {result && (
            <div className="bulk-result">
              <div className="bulk-result-row bulk-result-ok">
                <CheckCircle2 size={13} /> {result.created} persons created
              </div>
              {result.skipped > 0 && (
                <div className="bulk-result-row bulk-result-warn">
                  <AlertTriangle size={13} /> {result.skipped} rows skipped
                </div>
              )}
              {result.errors > 0 && (
                <div className="bulk-result-row bulk-result-err">
                  <XCircle size={13} /> {result.errors} errors
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="ghost-btn" onClick={onClose}>Close</button>
          <button className="save-btn" onClick={handleImport}
            disabled={!file || loading || !!result}>
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
