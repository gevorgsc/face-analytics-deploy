import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Plus, Trash2, RefreshCw, ArrowRight, CheckCircle, Tag, Shield } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsPolicyTemplates({ token, isAdmin }) {
  const [templates, setTemplates] = useState([]);
  const [levels, setLevels]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ name: '', description: '', tags: '' });
  const [showForm, setShowForm]   = useState(false);
  const [applyModal, setApplyModal] = useState(null);
  const [applyLevel, setApplyLevel] = useState('');
  const [applyMerge, setApplyMerge] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, lRes] = await Promise.all([
        apiFetch(`${API}/api/acs/policy-templates`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/levels`,           { headers: H(token) }),
      ]);
      if (tRes.ok) setTemplates(await tRes.json());
      if (lRes.ok) setLevels(await lRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const res = await apiFetch(`${API}/api/acs/policy-templates`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const remove = async (id) => {
    if (!confirm('Delete template?')) return;
    await apiFetch(`${API}/api/acs/policy-templates/${id}`, { method: 'DELETE', headers: H(token) });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const applyTemplate = async () => {
    if (!applyModal || !applyLevel) return;
    const res = await apiFetch(`${API}/api/acs/policy-templates/${applyModal.id}/apply/${applyLevel}`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge: applyMerge }),
    });
    if (res.ok) setApplyResult(await res.json());
  };

  const cloneFromLevel = async (tplId, levelId) => {
    await apiFetch(`${API}/api/acs/policy-templates/${tplId}/clone-from-level/${levelId}`, {
      method: 'POST', headers: H(token),
    });
    load();
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Copy size={18} /> Policy Templates</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> New Template</button>}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Create reusable door-rule templates. Apply them to access levels to clone the configuration instantly.
      </p>

      {showForm && (
        <div className="acs-form-card">
          <h4><Copy size={14} /> New Policy Template</h4>
          <div className="acs-form-grid">
            <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Office Hours" /></label>
            <label>Tags (comma-separated)<input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="office, standard" /></label>
            <label style={{ gridColumn: '1/-1' }}>Description<input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={create} disabled={!form.name}>Create</button>
          </div>
        </div>
      )}

      {applyModal && (
        <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && setApplyModal(null)}>
          <div className="pm-dialog">
            <div className="pm-dialog-header"><strong>Apply "{applyModal.name}"</strong></div>
            <div className="pm-dialog-body">
              {applyResult
                ? (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <CheckCircle size={32} style={{ color: 'var(--success, #16a34a)', marginBottom: 8 }} />
                    <p style={{ fontWeight: 700 }}>Applied to "{applyResult.level_name}"</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{applyResult.door_rules_applied?.length} door rules configured</p>
                  </div>
                )
                : (
                  <>
                    <div className="acs-form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
                      <label>Apply to Access Level
                        <select value={applyLevel} onChange={e => setApplyLevel(e.target.value)}>
                          <option value="">—</option>
                          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </label>
                      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={applyMerge} onChange={e => setApplyMerge(e.target.checked)} />
                        Merge with existing rules (instead of replace)
                      </label>
                    </div>
                  </>
                )}
            </div>
            <div className="pm-dialog-footer">
              <button className="ghost-btn" onClick={() => { setApplyModal(null); setApplyResult(null); setApplyLevel(''); }}>
                {applyResult ? 'Close' : 'Cancel'}
              </button>
              {!applyResult && (
                <button className="save-btn" onClick={applyTemplate} disabled={!applyLevel}>
                  <ArrowRight size={13} /> Apply
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Copy size={20} /></div>
          <div><div className="acs-stat-val">{templates.length}</div><div className="acs-stat-label">Templates</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{levels.length}</div><div className="acs-stat-label">Access Levels</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon purple"><Tag size={20} /></div>
          <div><div className="acs-stat-val">{templates.filter(t => t.tags && t.tags.length > 0).length}</div><div className="acs-stat-label">Tagged</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><ArrowRight size={20} /></div>
          <div><div className="acs-stat-val">{templates.filter(t => t.description).length}</div><div className="acs-stat-label">Documented</div></div>
        </div>
      </div>

      <div className="acs-split">
        <div className="acs-split-sidebar">
          <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', padding: '4px 4px 8px' }}>
            Templates ({templates.length})
          </div>
          {templates.length === 0
            ? <div className="acs-empty" style={{ padding: '20px 8px' }}>No templates yet.</div>
            : templates.map(t => (
              <button key={t.id} className={`acs-sidebar-item ${selected?.id === t.id ? 'active' : ''}`}
                onClick={() => setSelected(t)}>
                <Copy size={15} />
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.door_rules?.length || 0} rules{t.tags?.length ? ' · ' + t.tags.join(', ') : ''}</span>
                </div>
                <ArrowRight size={13} />
              </button>
            ))}
        </div>

        <div className="acs-split-main">
          {!selected
            ? (
              <div className="acs-empty-pro">
                <Copy size={40} />
                <h3>Select a template</h3>
                <p>Choose a policy template to view its rules or apply it to an access level.</p>
              </div>
            )
            : (
              <>
                <div className="acs-detail-hd">
                  <div>
                    <h3>{selected.name}</h3>
                    <p>{selected.description || 'No description'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isAdmin && (
                      <>
                        <button className="save-btn" style={{ fontSize: 12 }}
                          onClick={() => { setApplyModal(selected); setApplyResult(null); setApplyLevel(''); }}>
                          <ArrowRight size={12} /> Apply to Level
                        </button>
                        <button className="ghost-btn danger" style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                          onClick={() => remove(selected.id)}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {selected.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {selected.tags.map(tag => (
                      <span key={tag} className="acs-badge acs-badge-purple">{tag}</span>
                    ))}
                  </div>
                )}

                <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 8 }}>
                  Door Rules
                </div>

                {(selected.door_rules || []).length === 0
                  ? (
                    <div>
                      <div className="acs-empty">No door rules defined in this template.</div>
                      {isAdmin && levels.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Clone rules from an access level:</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {levels.map(l => (
                              <button key={l.id} className="ghost-btn" style={{ fontSize: 12 }}
                                onClick={() => cloneFromLevel(selected.id, l.id)}>
                                {l.name} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                  : (
                    <div style={{
                      fontFamily: 'monospace', fontSize: 12,
                      background: 'var(--bg-secondary, var(--bg))',
                      border: '1px solid var(--border)',
                      borderRadius: 10, padding: 14,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text)',
                    }}>
                      {JSON.stringify(selected.door_rules, null, 2)}
                    </div>
                  )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
