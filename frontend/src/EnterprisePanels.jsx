import { apiFetch } from './apiClient';
/**
 * EnterprisePanels.jsx - GSC Face Analytics Pro
 * Alerts - Webhooks - Zones - Reports
 * Fully integrated with the app's design system (.card, CSS vars, etc.)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTr } from './i18n';
import {
  Bell, Link2, Map, FileText, Plus, Trash2, Play, CheckCircle,
  XCircle, Download, Mail, Clock, Activity, Shield,
  AlertTriangle, ToggleLeft, ToggleRight, X, Camera,
  MessageCircle, Edit3
} from 'lucide-react';
import { API } from './apiConfig';

// -- Shared hook ---------------------------------------------------------------

function useApi(token) {
  const headers = useCallback((extra = {}) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  }), [token]);

  const get  = useCallback(async (p) => { const r = await apiFetch(`${API}${p}`, { headers: headers() }); if (!r.ok) throw new Error(await r.text()); return r.json(); }, [headers]);
  const post = useCallback(async (p, b) => { const r = await apiFetch(`${API}${p}`, { method: 'POST',   headers: headers(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }, [headers]);
  const pat  = useCallback(async (p, b) => { const r = await apiFetch(`${API}${p}`, { method: 'PATCH',  headers: headers(), body: JSON.stringify(b) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }, [headers]);
  const del  = useCallback(async (p)    => { const r = await apiFetch(`${API}${p}`, { method: 'DELETE', headers: headers() });                          if (!r.ok) throw new Error(await r.text()); return r.json(); }, [headers]);
  return { get, post, pat, del };
}

// -- Shared UI primitives ------------------------------------------------------

function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="ep-page-header">
      <div className="ep-page-header-left">
        <div className="ep-page-icon"><Icon size={20} /></div>
        <div>
          <div className="page-eyebrow">GSC LLC - ENTERPRISE</div>
          <h2 className="ep-page-title">{title}</h2>
          {subtitle && <p className="ep-page-sub">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="ep-page-action">{action}</div>}
    </div>
  );
}

function Btn({ onClick, icon: Icon, label, variant = 'ghost', disabled, title }) {
  return (
    <button
      className={`ep-btn ep-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={14} />}
      {label}
    </button>
  );
}

function Toast({ msg, type = 'info', onClose }) {
  if (!msg) return null;
  return (
    <div className={`ep-toast ep-toast-${type}`}>
      {type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
      <span>{msg}</span>
      <button onClick={onClose}><X size={13} /></button>
    </div>
  );
}

function StatusPill({ active }) {
  return active
    ? <span className="ep-pill ep-pill-active"><span className="ep-pill-dot" />Active</span>
    : <span className="ep-pill ep-pill-off"><span className="ep-pill-dot" />Inactive</span>;
}

function TypeBadge({ type }) {
  const MAP = { blacklist: 'danger', vip: 'warn', employee: 'ok', unknown: 'muted', any: 'info' };
  return <span className={`ep-badge ep-badge-${MAP[type] || 'muted'}`}>{type}</span>;
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="ep-empty">
      <div className="ep-empty-icon"><Icon size={36} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function FormRow({ label, hint, children }) {
  return (
    <div className="ep-form-row">
      <label className="ep-label">{label}{hint && <span className="ep-label-hint">{hint}</span>}</label>
      {children}
    </div>
  );
}

function Input(props) { return <input className="ep-input" {...props} />; }
function Select({ children, ...props }) { return <select className="ep-select" {...props}>{children}</select>; }

// -- Admin guard ---------------------------------------------------------------

function AdminOnly({ userRole, children }) {
  const t = useTr();
  if (userRole !== 'admin') {
    return (
      <EmptyState
        icon={Shield}
        title={t('securityTitle')}
        body={t('viewerNote')}
      />
    );
  }
  return children;
}

// ============================================================
// ALERTS PANEL
// ============================================================

const TRIGGER_KEYS = [
  { value: 'blacklist', labelKey: 'blacklistTrigger' },
  { value: 'vip',       labelKey: 'vipTrigger' },
  { value: 'employee',  labelKey: 'employeeTrigger' },
  { value: 'unknown',   labelKey: 'unknownTrigger' },
  { value: 'any',       labelKey: 'anyTrigger' },
];

export function AlertsPanel({ token, userRole }) {
  const t = useTr();
  const { get, post, pat, del } = useApi(token);
  const [configs, setConfigs]     = useState([]);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [editForm, setEditForm]   = useState(null);
  const [editNewCh, setEditNewCh] = useState({ bot_token: '', chat_id: '' });
  const [msg, setMsg]             = useState(null);
  const [msgType, setMsgType]     = useState('info');
  const [form, setForm]           = useState({
    name: '', trigger_person_type: 'blacklist',
    min_confidence: 0, cooldown_seconds: 300, channels: [],
  });
  const [newCh, setNewCh] = useState({ bot_token: '', chat_id: '' });

  const notify = (text, type = 'info') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([get('/api/alerts/configs'), get('/api/alerts/history')]);
      setConfigs(c); setHistory(h);
    } catch (e) { notify(t('loadError') + ': ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ name: '', trigger_person_type: 'blacklist', min_confidence: 0, cooldown_seconds: 300, channels: [] });
    setNewCh({ bot_token: '', chat_id: '' });
  };

  const addChannel = () => {
    if (!newCh.bot_token) return notify(t('botTokenRequired'), 'error');
    if (!newCh.chat_id)   return notify(t('chatIdRequired'), 'error');
    const ch = { type: 'telegram', config: { bot_token: newCh.bot_token, chat_id: newCh.chat_id, send_photo: true } };
    setForm(f => ({ ...f, channels: [...f.channels, ch] }));
    setNewCh({ bot_token: '', chat_id: '' });
  };

  const save = async () => {
    if (!form.name) return notify(t('alertName') + ' ' + t('botTokenRequired').split(' ')[1], 'error');
    try { await post('/api/alerts/configs', form); resetForm(); setShowForm(false); notify(t('alertCreated')); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const toggle = async (c) => {
    try { await pat(`/api/alerts/configs/${c.id}`, { is_active: !c.is_active }); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const test = async (id) => {
    try { await post(`/api/alerts/configs/${id}/test`, {}); notify(t('testAlertSent')); }
    catch (e) { notify(e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm(t('deleteAlertConfirm'))) return;
    try { await del(`/api/alerts/configs/${id}`); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const startEditConfig = (c) => {
    setEditingConfig(c.id);
    setEditForm({ name: c.name, trigger_person_type: c.trigger_person_type, min_confidence: c.min_confidence, cooldown_seconds: c.cooldown_seconds, channels: [...c.channels] });
    setEditNewCh({ bot_token: '', chat_id: '' });
    setShowForm(false);
  };

  const addEditChannel = () => {
    if (!editNewCh.bot_token) return notify(t('botTokenRequired'), 'error');
    if (!editNewCh.chat_id)   return notify(t('chatIdRequired'), 'error');
    const ch = { type: 'telegram', config: { bot_token: editNewCh.bot_token, chat_id: editNewCh.chat_id, send_photo: true } };
    setEditForm(f => ({ ...f, channels: [...f.channels, ch] }));
    setEditNewCh({ bot_token: '', chat_id: '' });
  };

  const saveEditConfig = async () => {
    if (!editForm.name) return notify(t('alertName') + ' is required', 'error');
    try { await pat(`/api/alerts/configs/${editingConfig}`, editForm); setEditingConfig(null); setEditForm(null); notify('Alarm rule updated'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  return (
    <AdminOnly userRole={userRole}>
      <div className="ep-root">
        <PageHeader
          icon={Bell}
          title={t('alarmRules')}
          subtitle={t('notifications') + ' - Telegram'}
          action={!showForm && <Btn icon={Plus} label={t('newAlarmRule')} variant="primary" onClick={() => setShowForm(true)} />}
        />

        <Toast msg={msg} type={msgType} onClose={() => setMsg(null)} />

        {/* Create form */}
        {showForm && (
          <div className="card ep-form-card ep-alarm-form-card">
            <div className="ep-form-card-head">
              <Bell size={16} />
              <strong>{t('newAlarmRule')}</strong>
              <button className="ep-close-btn" onClick={() => { setShowForm(false); resetForm(); }}><X size={15} /></button>
            </div>

            <div className="ep-form-body">
              <div className="ep-form-grid ep-alarm-form-grid">
                <FormRow label={t('alertName')}>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('alertNamePlaceholder')} />
                </FormRow>
                <FormRow label={t('triggerWhen')}>
                  <Select value={form.trigger_person_type} onChange={e => setForm(f => ({ ...f, trigger_person_type: e.target.value }))}>
                    {TRIGGER_KEYS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                  </Select>
                </FormRow>
                <FormRow label={t('cooldownLabel')} hint={t('cooldownHint')}>
                  <Input type="number" value={form.cooldown_seconds} min={30} onChange={e => setForm(f => ({ ...f, cooldown_seconds: +e.target.value }))} />
                </FormRow>
                <FormRow label={t('minConfidence')} hint={t('minConfidenceHint')}>
                  <Input type="number" step="0.05" min="0" max="1" value={form.min_confidence} onChange={e => setForm(f => ({ ...f, min_confidence: +e.target.value }))} />
                </FormRow>
              </div>

              {/* Telegram channel builder */}
              <div className="ep-channels-section ep-alarm-channel-box">
                <div className="ep-channels-label">
                  <MessageCircle size={13} /> {t('telegramChannel')}
                </div>
                <div className="ep-channel-add ep-tg-channel-add">
                  <Input
                    value={newCh.bot_token}
                    onChange={e => setNewCh(c => ({ ...c, bot_token: e.target.value }))}
                    placeholder="Bot token  (e.g. 123456:ABC-DEF...)"
                  />
                  <Input
                    value={newCh.chat_id}
                    onChange={e => setNewCh(c => ({ ...c, chat_id: e.target.value }))}
                    placeholder="Chat ID  (e.g. -100123456789)"
                  />
                  <Btn icon={Plus} label={t('create')} variant="secondary" onClick={addChannel} />
                </div>
                <p className="ep-tg-hint">{t('telegramHint')}</p>
                {form.channels.length > 0 && (
                  <div className="ep-channel-list">
                    {form.channels.map((ch, i) => (
                      <div key={i} className="ep-channel-item">
                        <MessageCircle size={13} />
                        <span className="ep-channel-type">Telegram</span>
                        <span className="ep-channel-addr">chat: {ch.config?.chat_id || '-'}</span>
                        <button onClick={() => setForm(f => ({ ...f, channels: f.channels.filter((_, j) => j !== i) }))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ep-form-actions">
                <Btn icon={Bell} label={t('saveAlarmRule')} variant="primary" onClick={save} />
                <Btn label={t('cancel')} variant="ghost" onClick={() => { setShowForm(false); resetForm(); }} />
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? <div className="ep-loading"><Activity size={18} className="ep-spin" /> {t('loadingLabel')}</div>
          : configs.length === 0 && !showForm
            ? <EmptyState icon={Bell} title={t('noAlarmRulesTitle')} body={t('noAlarmRulesBody')} />
            : (
              <div className="ep-cards-list">
                {configs.map(c => {
                  const triggerKey = TRIGGER_KEYS.find(o => o.value === c.trigger_person_type);
                  return (
                    <div key={c.id} className={`card ep-item-card ${c.is_active ? '' : 'ep-item-inactive'}`}>
                      {editingConfig === c.id && editForm ? (
                        <div className="ep-form-body">
                          <div className="ep-form-card-head">
                            <Edit3 size={16} /><strong>Edit Alarm Rule</strong>
                            <button className="ep-close-btn" onClick={() => setEditingConfig(null)}><X size={15} /></button>
                          </div>
                          <div className="ep-form-grid ep-alarm-form-grid">
                            <FormRow label={t('alertName')}>
                              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </FormRow>
                            <FormRow label={t('triggerWhen')}>
                              <Select value={editForm.trigger_person_type} onChange={e => setEditForm(f => ({ ...f, trigger_person_type: e.target.value }))}>
                                {TRIGGER_KEYS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                              </Select>
                            </FormRow>
                            <FormRow label={t('cooldownLabel')} hint={t('cooldownHint')}>
                              <Input type="number" value={editForm.cooldown_seconds} min={30} onChange={e => setEditForm(f => ({ ...f, cooldown_seconds: +e.target.value }))} />
                            </FormRow>
                            <FormRow label={t('minConfidence')} hint={t('minConfidenceHint')}>
                              <Input type="number" step="0.05" min="0" max="1" value={editForm.min_confidence} onChange={e => setEditForm(f => ({ ...f, min_confidence: +e.target.value }))} />
                            </FormRow>
                          </div>
                          <div className="ep-channels-section ep-alarm-channel-box">
                            <div className="ep-channels-label"><MessageCircle size={13} /> {t('telegramChannel')}</div>
                            <div className="ep-channel-add ep-tg-channel-add">
                              <Input value={editNewCh.bot_token} onChange={e => setEditNewCh(ch => ({ ...ch, bot_token: e.target.value }))} placeholder="Bot token" />
                              <Input value={editNewCh.chat_id} onChange={e => setEditNewCh(ch => ({ ...ch, chat_id: e.target.value }))} placeholder="Chat ID" />
                              <Btn icon={Plus} label={t('create')} variant="secondary" onClick={addEditChannel} />
                            </div>
                            {editForm.channels.length > 0 && (
                              <div className="ep-channel-list">
                                {editForm.channels.map((ch, i) => (
                                  <div key={i} className="ep-channel-item">
                                    <MessageCircle size={13} />
                                    <span className="ep-channel-type">Telegram</span>
                                    <span className="ep-channel-addr">chat: {ch.config?.chat_id || '-'}</span>
                                    <button onClick={() => setEditForm(f => ({ ...f, channels: f.channels.filter((_, j) => j !== i) }))}><X size={12} /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="ep-form-actions">
                            <Btn icon={Bell} label="Save Changes" variant="primary" onClick={saveEditConfig} />
                            <Btn label={t('cancel')} variant="ghost" onClick={() => setEditingConfig(null)} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="ep-item-head">
                            <div className="ep-item-icon ep-item-icon-bell"><Bell size={15} /></div>
                            <div className="ep-item-title">
                              <strong>{c.name}</strong>
                              <TypeBadge type={c.trigger_person_type} />
                              <StatusPill active={c.is_active} />
                            </div>
                            <div className="ep-item-controls">
                              <Btn icon={Play}  title="Send test alert" variant="ghost"        onClick={() => test(c.id)} />
                              <Btn icon={Edit3} title="Edit"            variant="ghost"        onClick={() => startEditConfig(c)} />
                              <button className="ep-toggle-btn" onClick={() => toggle(c)} title={c.is_active ? 'Disable' : 'Enable'}>
                                {c.is_active ? <ToggleRight size={20} className="ep-toggle-on" /> : <ToggleLeft size={20} className="ep-toggle-off" />}
                              </button>
                              <Btn icon={Trash2} variant="ghost-danger" onClick={() => remove(c.id)} />
                            </div>
                          </div>
                          <div className="ep-item-meta">
                            <span><Clock size={11} /> {t('cooldownLabel')}: {c.cooldown_seconds}s</span>
                            <span><MessageCircle size={11} /> {c.channels.length} ch.</span>
                            {c.min_confidence > 0 && <span><Activity size={11} /> {t('minConfidence')}: {Math.round(c.min_confidence * 100)}%</span>}
                            <span className="ep-meta-trigger">{triggerKey ? t(triggerKey.labelKey) : c.trigger_person_type}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        }

        {/* History */}
        {history.length > 0 && (
          <div className="card ep-history-card">
            <div className="ep-history-head"><Clock size={14} /> {t('recentHistory')}</div>
            <div className="ep-history-rows">
              {history.slice(0, 15).map(h => (
                <div key={h.id} className="ep-history-row">
                  <span className="ep-history-time">{new Date(h.created_at).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  <TypeBadge type={h.person_type || 'unknown'} />
                  <span className="ep-history-ch"><MessageCircle size={11} /> Telegram</span>
                  {h.status === 'sent'
                    ? <span className="ep-history-ok"><CheckCircle size={12} /> {t('activeStatus')}</span>
                    : <span className="ep-history-fail"><XCircle size={12} /> {t('inactive')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminOnly>
  );
}

// ============================================================
// WEBHOOKS PANEL
// ============================================================

const EVENT_TYPE_OPTS = [
  { value: 'blacklist_detected', label: 'Blacklist Detected' },
  { value: 'vip_detected',       label: 'VIP Detected' },
  { value: 'employee_detected',  label: 'Employee Detected' },
  { value: 'unknown_detected',   label: 'Unknown Detected' },
  { value: 'all',                label: 'All Events' },
];

export function WebhooksPanel({ token, userRole }) {
  const { get, post, pat, del } = useApi(token);
  const [webhooks, setWebhooks]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [editForm, setEditForm]       = useState(null);
  const [msg, setMsg]                 = useState(null);
  const [msgType, setMsgType]         = useState('info');
  const [form, setForm]               = useState({ name: '', url: '', event_types: ['blacklist_detected'], method: 'POST', secret: '' });

  const notify = (text, type = 'info') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try { setWebhooks(await get('/api/webhooks')); }
    catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const toggleEventType = (et) => {
    setForm(f => ({
      ...f,
      event_types: f.event_types.includes(et)
        ? f.event_types.filter(x => x !== et)
        : [...f.event_types, et],
    }));
  };

  const save = async () => {
    if (!form.name || !form.url) return notify('Name and URL are required', 'error');
    if (!form.url.startsWith('http')) return notify('URL must start with http:// or https://', 'error');
    try { await post('/api/webhooks', form); setShowForm(false); setForm({ name: '', url: '', event_types: ['blacklist_detected'], method: 'POST', secret: '' }); notify('Webhook created'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const test = async (id) => {
    try { const r = await post(`/api/webhooks/${id}/test`, {}); notify(`Test: ${r.message} (HTTP ${r.status_code || '?'})`); }
    catch (e) { notify(e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this webhook?')) return;
    try { await del(`/api/webhooks/${id}`); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const startEditWebhook = (w) => {
    setEditingWebhook(w.id);
    setEditForm({ name: w.name, url: w.url, event_types: [...w.event_types], method: w.method, secret: '' });
    setShowForm(false);
  };

  const toggleEditEventType = (et) => {
    setEditForm(f => ({
      ...f,
      event_types: f.event_types.includes(et)
        ? f.event_types.filter(x => x !== et)
        : [...f.event_types, et],
    }));
  };

  const saveEditWebhook = async () => {
    if (!editForm.name || !editForm.url) return notify('Name and URL are required', 'error');
    if (!editForm.url.startsWith('http')) return notify('URL must start with http:// or https://', 'error');
    try { await pat(`/api/webhooks/${editingWebhook}`, editForm); setEditingWebhook(null); setEditForm(null); notify('Webhook updated'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  return (
    <AdminOnly userRole={userRole}>
      <div className="ep-root">
        <PageHeader
          icon={Link2}
          title="Webhook Integrations"
          subtitle="Push real-time face events to external systems (CRM, SIEM, Slack)"
          action={!showForm && <Btn icon={Plus} label="New Webhook" variant="primary" onClick={() => setShowForm(true)} />}
        />

        <Toast msg={msg} type={msgType} onClose={() => setMsg(null)} />

        {showForm && (
          <div className="card ep-form-card">
            <div className="ep-form-card-head">
              <Link2 size={16} />
              <strong>New Webhook Endpoint</strong>
              <button className="ep-close-btn" onClick={() => setShowForm(false)}><X size={15} /></button>
            </div>
            <div className="ep-form-body">
              <div className="ep-form-grid">
                <FormRow label="Name">
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Slack Alerts" />
                </FormRow>
                <FormRow label="Endpoint URL">
                  <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/webhook" />
                </FormRow>
                <FormRow label="HTTP Method">
                  <Select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                    <option>POST</option><option>PUT</option><option>PATCH</option>
                  </Select>
                </FormRow>
                <FormRow label="Secret" hint="HMAC-SHA256 signing (optional)">
                  <Input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="your-secret-key" type="password" />
                </FormRow>
              </div>

              <div className="ep-event-types">
                <div className="ep-channels-label"><Activity size={13} /> Subscribe to Events</div>
                <div className="ep-event-chips">
                  {EVENT_TYPE_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      className={`ep-event-chip ${form.event_types.includes(opt.value) ? 'active' : ''}`}
                      onClick={() => toggleEventType(opt.value)}
                    >
                      {form.event_types.includes(opt.value) ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ep-form-actions">
                <Btn icon={Link2} label="Save Webhook" variant="primary" onClick={save} />
                <Btn label="Cancel" variant="ghost" onClick={() => setShowForm(false)} />
              </div>
            </div>
          </div>
        )}

        {loading ? <div className="ep-loading"><Activity size={18} className="ep-spin" /> Loading...</div>
          : webhooks.length === 0 && !showForm
            ? <EmptyState icon={Link2} title="No webhooks yet" body="Connect Face Analytics to Slack, your CRM, or any REST endpoint." />
            : (
              <div className="ep-cards-list">
                {webhooks.map(w => (
                  <div key={w.id} className={`card ep-item-card ${w.is_active ? '' : 'ep-item-inactive'}`}>
                    {editingWebhook === w.id && editForm ? (
                      <div className="ep-form-body">
                        <div className="ep-form-card-head">
                          <Edit3 size={16} /><strong>Edit Webhook</strong>
                          <button className="ep-close-btn" onClick={() => setEditingWebhook(null)}><X size={15} /></button>
                        </div>
                        <div className="ep-form-grid">
                          <FormRow label="Name">
                            <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Slack Alerts" />
                          </FormRow>
                          <FormRow label="Endpoint URL">
                            <Input value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/webhook" />
                          </FormRow>
                          <FormRow label="HTTP Method">
                            <Select value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))}>
                              <option>POST</option><option>PUT</option><option>PATCH</option>
                            </Select>
                          </FormRow>
                          <FormRow label="Secret" hint="Leave blank to keep existing">
                            <Input value={editForm.secret} onChange={e => setEditForm(f => ({ ...f, secret: e.target.value }))} placeholder="new-secret (optional)" type="password" />
                          </FormRow>
                        </div>
                        <div className="ep-event-types">
                          <div className="ep-channels-label"><Activity size={13} /> Subscribe to Events</div>
                          <div className="ep-event-chips">
                            {EVENT_TYPE_OPTS.map(opt => (
                              <button
                                key={opt.value}
                                className={`ep-event-chip ${editForm.event_types.includes(opt.value) ? 'active' : ''}`}
                                onClick={() => toggleEditEventType(opt.value)}
                              >
                                {editForm.event_types.includes(opt.value) ? <CheckCircle size={11} /> : <XCircle size={11} />}
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="ep-form-actions">
                          <Btn icon={Link2} label="Save Changes" variant="primary" onClick={saveEditWebhook} />
                          <Btn label="Cancel" variant="ghost" onClick={() => setEditingWebhook(null)} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="ep-item-head">
                          <div className="ep-item-icon ep-item-icon-link"><Link2 size={15} /></div>
                          <div className="ep-item-title">
                            <strong>{w.name}</strong>
                            <StatusPill active={w.is_active} />
                            {w.last_status_code && (
                              <span className={`ep-http-code ${w.last_status_code < 400 ? 'ok' : 'fail'}`}>
                                HTTP {w.last_status_code}
                              </span>
                            )}
                          </div>
                          <div className="ep-item-controls">
                            <Btn icon={Play}   title="Send test payload" variant="ghost"       onClick={() => test(w.id)} />
                            <Btn icon={Edit3}  title="Edit"              variant="ghost"       onClick={() => startEditWebhook(w)} />
                            <Btn icon={Trash2}                           variant="ghost-danger" onClick={() => remove(w.id)} />
                          </div>
                        </div>
                        <div className="ep-webhook-url">
                          <code>{w.url.length > 70 ? w.url.slice(0, 70) + '...' : w.url}</code>
                        </div>
                        <div className="ep-item-meta">
                          <span>{w.method}</span>
                          <span>{w.event_types.join(' - ')}</span>
                          {w.last_triggered_at && <span><Clock size={11} /> {new Date(w.last_triggered_at).toLocaleString()}</span>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )
        }
      </div>
    </AdminOnly>
  );
}

// ============================================================
// ZONES PANEL
// ============================================================

const ZONE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export function ZonesPanel({ token, userRole }) {
  const { get, post, pat, del } = useApi(token);
  const [zones, setZones]         = useState([]);
  const [allCams, setAllCams]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [editForm, setEditForm]   = useState({ name: '', description: '', color: '#3B82F6', camera_ids: [] });
  const [msg, setMsg]             = useState(null);
  const [msgType, setMsgType]     = useState('info');
  const [form, setForm]           = useState({ name: '', description: '', color: '#3B82F6', camera_ids: [] });

  const notify = (text, type = 'info') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try { const [z, c] = await Promise.all([get('/api/zones'), get('/api/cameras')]); setZones(z); setAllCams(c); }
    catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const toggleCam = (id) => setForm(f => ({
    ...f,
    camera_ids: f.camera_ids.includes(id) ? f.camera_ids.filter(x => x !== id) : [...f.camera_ids, id],
  }));

  const save = async () => {
    if (!form.name) return notify('Zone name is required', 'error');
    try { await post('/api/zones', form); setShowForm(false); setForm({ name: '', description: '', color: '#3B82F6', camera_ids: [] }); notify('Zone created'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this zone?')) return;
    try { await del(`/api/zones/${id}`); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const startEdit = (z) => {
    setEditingZone(z.id);
    setEditForm({ name: z.name, description: z.description || '', color: z.color, camera_ids: z.cameras.map(c => c.id) });
    setShowForm(false);
  };

  const saveEdit = async () => {
    if (!editForm.name) return notify('Zone name is required', 'error');
    try { await pat(`/api/zones/${editingZone}`, editForm); setEditingZone(null); notify('Zone updated'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const toggleEditCam = (id) => setEditForm(f => ({
    ...f,
    camera_ids: f.camera_ids.includes(id) ? f.camera_ids.filter(x => x !== id) : [...f.camera_ids, id],
  }));

  return (
    <div className="ep-root">
      <PageHeader
        icon={Map}
        title="Camera Zones"
        subtitle="Group cameras into logical areas - floors, entrances, parking"
        action={userRole === 'admin' && !showForm && <Btn icon={Plus} label="New Zone" variant="primary" onClick={() => setShowForm(true)} />}
      />

      <Toast msg={msg} type={msgType} onClose={() => setMsg(null)} />

      {showForm && userRole === 'admin' && (
        <div className="card ep-form-card">
          <div className="ep-form-card-head">
            <Map size={16} />
            <strong>New Zone</strong>
            <button className="ep-close-btn" onClick={() => setShowForm(false)}><X size={15} /></button>
          </div>
          <div className="ep-form-body">
            <div className="ep-form-grid">
              <FormRow label="Zone Name">
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Entrance" />
              </FormRow>
              <FormRow label="Description">
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Floor 1 - Building A" />
              </FormRow>
            </div>

            <FormRow label="Zone Color">
              <div className="ep-color-row">
                {ZONE_COLORS.map(c => (
                  <button
                    key={c}
                    className={`ep-color-swatch ${form.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </FormRow>

            <FormRow label="Assign Cameras">
              <div className="ep-cam-grid">
                {allCams.map(cam => (
                  <label key={cam.id} className={`ep-cam-checkbox ${form.camera_ids.includes(cam.id) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={form.camera_ids.includes(cam.id)} onChange={() => toggleCam(cam.id)} />
                    <Camera size={12} />
                    <span>{cam.name}</span>
                    {cam.location && <small>{cam.location}</small>}
                  </label>
                ))}
                {allCams.length === 0 && <p className="ep-no-cams">No cameras configured yet</p>}
              </div>
            </FormRow>

            <div className="ep-form-actions">
              <Btn icon={Map} label="Save Zone" variant="primary" onClick={save} />
              <Btn label="Cancel" variant="ghost" onClick={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="ep-loading"><Activity size={18} className="ep-spin" /> Loading...</div>
        : zones.length === 0 && !showForm
          ? <EmptyState icon={Map} title="No zones defined" body="Zones help you organize cameras by area and view zone-level analytics." />
          : (
            <div className="ep-zones-grid">
              {zones.map(z => (
                <div key={z.id} className="card ep-zone-card" style={{ '--zone-color': z.color }}>
                  {editingZone === z.id ? (
                    <div className="ep-form-body">
                      <div className="ep-form-card-head">
                        <Edit3 size={16} />
                        <strong>Edit Zone</strong>
                        <button className="ep-close-btn" onClick={() => setEditingZone(null)}><X size={15} /></button>
                      </div>
                      <div className="ep-form-grid">
                        <FormRow label="Zone Name">
                          <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Entrance" />
                        </FormRow>
                        <FormRow label="Description">
                          <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Floor 1 - Building A" />
                        </FormRow>
                      </div>
                      <FormRow label="Zone Color">
                        <div className="ep-color-row">
                          {ZONE_COLORS.map(c => (
                            <button key={c} className={`ep-color-swatch ${editForm.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setEditForm(f => ({ ...f, color: c }))} />
                          ))}
                        </div>
                      </FormRow>
                      <FormRow label="Assign Cameras">
                        <div className="ep-cam-grid">
                          {allCams.map(cam => (
                            <label key={cam.id} className={`ep-cam-checkbox ${editForm.camera_ids.includes(cam.id) ? 'checked' : ''}`}>
                              <input type="checkbox" checked={editForm.camera_ids.includes(cam.id)} onChange={() => toggleEditCam(cam.id)} />
                              <Camera size={12} />
                              <span>{cam.name}</span>
                              {cam.location && <small>{cam.location}</small>}
                            </label>
                          ))}
                        </div>
                      </FormRow>
                      <div className="ep-form-actions">
                        <Btn icon={Map} label="Save Changes" variant="primary" onClick={saveEdit} />
                        <Btn label="Cancel" variant="ghost" onClick={() => setEditingZone(null)} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="ep-zone-top">
                        <span className="ep-zone-bullet" style={{ background: z.color }} />
                        <strong>{z.name}</strong>
                        {userRole === 'admin' && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <Btn icon={Edit3} variant="ghost" onClick={() => startEdit(z)} />
                            <Btn icon={Trash2} variant="ghost-danger" onClick={() => remove(z.id)} />
                          </div>
                        )}
                      </div>
                      {z.description && <p className="ep-zone-desc">{z.description}</p>}
                      <div className="ep-zone-cams">
                        {z.cameras.length === 0
                          ? <span className="ep-zone-no-cams">No cameras assigned</span>
                          : z.cameras.map(c => (
                              <span key={c.id} className="ep-zone-cam-chip">
                                <Camera size={10} /> {c.name}
                              </span>
                            ))
                        }
                      </div>
                      <div className="ep-zone-footer">
                        <span>{z.cameras.length} camera{z.cameras.length !== 1 ? 's' : ''}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )
      }
    </div>
  );
}

// ============================================================
// REPORTS PANEL
// ============================================================

const CRON_PRESETS = [
  { label: 'Every Monday 08:00', cron: '0 8 * * 1' },
  { label: 'Daily at 07:00',     cron: '0 7 * * *' },
  { label: '1st of month 09:00', cron: '0 9 1 * *' },
  { label: 'Every Friday 17:00', cron: '0 17 * * 5' },
];

const REPORT_TYPE_LABELS = { attendance: 'Attendance', events: 'Face Events', persons: 'Persons', audit: 'Audit Logs' };
const REPORT_TYPE_ICONS  = { attendance: Activity, events: Camera, persons: Shield, audit: FileText };

export function ReportsPanel({ token, userRole }) {
  const { get, post, pat, del } = useApi(token);
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [msg, setMsg]           = useState(null);
  const [msgType, setMsgType]   = useState('info');
  const [form, setForm]         = useState({
    name: '', report_type: 'attendance', format: 'excel',
    schedule_cron: '0 8 * * 1', recipients: [''],
  });

  const notify = (text, type = 'info') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try { setReports(await get('/api/reports')); }
    catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) return notify('Report name is required', 'error');
    const recipients = form.recipients.filter(r => r.trim());
    if (!recipients.length) return notify('At least one recipient email is required', 'error');
    try { await post('/api/reports', { ...form, recipients }); setShowForm(false); setForm({ name: '', report_type: 'attendance', format: 'excel', schedule_cron: '0 8 * * 1', recipients: [''] }); notify('Report scheduled'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this report schedule?')) return;
    try { await del(`/api/reports/${id}`); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  const runNow = async (id, name) => {
    try { await post(`/api/reports/${id}/run`, {}); notify(`"${name}" queued for delivery`); }
    catch (e) { notify(e.message, 'error'); }
  };

  const preview = async (id) => {
    try {
      const data = await get(`/api/reports/${id}/preview-url`);
      window.open(data.url?.startsWith('http') ? data.url : `${API}${data.url}`, '_blank');
    } catch (e) {
      notify(t('loadError') + ': ' + e.message, 'error');
    }
  };

  const startEditReport = (r) => {
    setEditingReport(r.id);
    setEditForm({ name: r.name, report_type: r.report_type, format: r.format, schedule_cron: r.schedule_cron, recipients: [...r.recipients] });
    setShowForm(false);
  };

  const saveEditReport = async () => {
    if (!editForm.name) return notify('Report name is required', 'error');
    const recipients = editForm.recipients.filter(x => x.trim());
    if (!recipients.length) return notify('At least one recipient email is required', 'error');
    try { await pat(`/api/reports/${editingReport}`, { ...editForm, recipients }); setEditingReport(null); setEditForm(null); notify('Report updated'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  return (
    <AdminOnly userRole={userRole}>
      <div className="ep-root">
        <PageHeader
          icon={FileText}
          title="Scheduled Reports"
          subtitle="Auto-generate and deliver Excel reports on a cron schedule"
          action={!showForm && <Btn icon={Plus} label="New Report" variant="primary" onClick={() => setShowForm(true)} />}
        />

        <Toast msg={msg} type={msgType} onClose={() => setMsg(null)} />

        {showForm && (
          <div className="card ep-form-card">
            <div className="ep-form-card-head">
              <FileText size={16} />
              <strong>New Scheduled Report</strong>
              <button className="ep-close-btn" onClick={() => setShowForm(false)}><X size={15} /></button>
            </div>
            <div className="ep-form-body">
              <div className="ep-form-grid">
                <FormRow label="Report Name">
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Attendance" />
                </FormRow>
                <FormRow label="Report Type">
                  <Select value={form.report_type} onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}>
                    <option value="attendance">Attendance</option>
                    <option value="events">Face Events</option>
                    <option value="persons">Persons</option>
                    <option value="audit">Audit Logs</option>
                  </Select>
                </FormRow>
                <FormRow label="Format">
                  <Select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                    <option value="excel">Excel (.xlsx)</option>
                  </Select>
                </FormRow>
                <FormRow label="Schedule">
                  <Select value={form.schedule_cron} onChange={e => setForm(f => ({ ...f, schedule_cron: e.target.value }))}>
                    {CRON_PRESETS.map(p => <option key={p.cron} value={p.cron}>{p.label}</option>)}
                  </Select>
                  <Input value={form.schedule_cron} onChange={e => setForm(f => ({ ...f, schedule_cron: e.target.value }))} placeholder="cron expression" style={{ marginTop: 6 }} />
                </FormRow>
              </div>

              <div className="ep-recipients">
                <div className="ep-channels-label"><Mail size={13} /> Email Recipients</div>
                {form.recipients.map((r, i) => (
                  <div key={i} className="ep-recipient-row">
                    <Input value={r} placeholder="team@company.com" onChange={e => setForm(f => ({ ...f, recipients: f.recipients.map((x, j) => j === i ? e.target.value : x) }))} />
                    {form.recipients.length > 1 && (
                      <button className="ep-remove-recipient" onClick={() => setForm(f => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))}><X size={13} /></button>
                    )}
                  </div>
                ))}
                <button className="ep-add-recipient" onClick={() => setForm(f => ({ ...f, recipients: [...f.recipients, ''] }))}>
                  <Plus size={13} /> Add recipient
                </button>
              </div>

              <div className="ep-form-actions">
                <Btn icon={FileText} label="Save Schedule" variant="primary" onClick={save} />
                <Btn label="Cancel" variant="ghost" onClick={() => setShowForm(false)} />
              </div>
            </div>
          </div>
        )}

        {loading ? <div className="ep-loading"><Activity size={18} className="ep-spin" /> Loading...</div>
          : reports.length === 0 && !showForm
            ? <EmptyState icon={FileText} title="No scheduled reports" body="Schedule automatic Excel reports delivered to your team by email." />
            : (
              <div className="ep-cards-list">
                {reports.map(r => {
                  const TypeIcon = REPORT_TYPE_ICONS[r.report_type] || FileText;
                  return (
                    <div key={r.id} className={`card ep-item-card ${r.is_active ? '' : 'ep-item-inactive'}`}>
                      {editingReport === r.id && editForm ? (
                        <div className="ep-form-body">
                          <div className="ep-form-card-head">
                            <Edit3 size={16} /><strong>Edit Report</strong>
                            <button className="ep-close-btn" onClick={() => setEditingReport(null)}><X size={15} /></button>
                          </div>
                          <div className="ep-form-grid">
                            <FormRow label="Report Name">
                              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </FormRow>
                            <FormRow label="Report Type">
                              <Select value={editForm.report_type} onChange={e => setEditForm(f => ({ ...f, report_type: e.target.value }))}>
                                <option value="attendance">Attendance</option>
                                <option value="events">Face Events</option>
                                <option value="persons">Persons</option>
                                <option value="audit">Audit Logs</option>
                              </Select>
                            </FormRow>
                            <FormRow label="Schedule">
                              <Select value={editForm.schedule_cron} onChange={e => setEditForm(f => ({ ...f, schedule_cron: e.target.value }))}>
                                {CRON_PRESETS.map(p => <option key={p.cron} value={p.cron}>{p.label}</option>)}
                              </Select>
                              <Input value={editForm.schedule_cron} onChange={e => setEditForm(f => ({ ...f, schedule_cron: e.target.value }))} placeholder="cron expression" style={{ marginTop: 6 }} />
                            </FormRow>
                          </div>
                          <div className="ep-recipients">
                            <div className="ep-channels-label"><Mail size={13} /> Email Recipients</div>
                            {editForm.recipients.map((rec, i) => (
                              <div key={i} className="ep-recipient-row">
                                <Input value={rec} placeholder="team@company.com" onChange={e => setEditForm(f => ({ ...f, recipients: f.recipients.map((x, j) => j === i ? e.target.value : x) }))} />
                                {editForm.recipients.length > 1 && (
                                  <button className="ep-remove-recipient" onClick={() => setEditForm(f => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))}><X size={13} /></button>
                                )}
                              </div>
                            ))}
                            <button className="ep-add-recipient" onClick={() => setEditForm(f => ({ ...f, recipients: [...f.recipients, ''] }))}><Plus size={13} /> Add recipient</button>
                          </div>
                          <div className="ep-form-actions">
                            <Btn icon={FileText} label="Save Changes" variant="primary" onClick={saveEditReport} />
                            <Btn label="Cancel" variant="ghost" onClick={() => setEditingReport(null)} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="ep-item-head">
                            <div className="ep-item-icon ep-item-icon-report"><TypeIcon size={15} /></div>
                            <div className="ep-item-title">
                              <strong>{r.name}</strong>
                              <span className="ep-badge ep-badge-muted">{REPORT_TYPE_LABELS[r.report_type] || r.report_type}</span>
                              <span className="ep-badge ep-badge-muted">.xlsx</span>
                              <StatusPill active={r.is_active} />
                            </div>
                            <div className="ep-item-controls">
                              <Btn icon={Play}     title="Send now"     variant="ghost"        onClick={() => runNow(r.id, r.name)} />
                              <Btn icon={Download} title="Preview file" variant="ghost"        onClick={() => preview(r.id)} />
                              <Btn icon={Edit3}    title="Edit"         variant="ghost"        onClick={() => startEditReport(r)} />
                              <Btn icon={Trash2}                        variant="ghost-danger"  onClick={() => remove(r.id)} />
                            </div>
                          </div>
                          <div className="ep-item-meta">
                            <span><Clock size={11} /> {r.schedule_cron}</span>
                            <span><Mail size={11} /> {r.recipients.length} recipient{r.recipients.length !== 1 ? 's' : ''}</span>
                            {r.last_sent_at
                              ? <span className="ep-last-sent">Last sent {new Date(r.last_sent_at).toLocaleDateString()}</span>
                              : <span className="ep-never-sent">Never sent</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        }
      </div>
    </AdminOnly>
  );
}
