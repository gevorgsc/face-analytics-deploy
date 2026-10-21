import { apiFetch } from './apiClient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Camera, ChevronDown, ChevronRight,
  CreditCard, Download, Edit2, Fingerprint, Folder,
  IdCard, Image, KeyRound, LoaderCircle, Mail, MoreHorizontal, Plus, RefreshCw,
  Save, Search, Shield, Trash2, Upload, UserRound, X,
} from 'lucide-react';
import { API } from './apiConfig';
import { mediaUrl } from './mediaUrl';
import AcsUiSelect from './AcsUiSelect';

const EDITOR_TABS = [
  ['basic',   'Basic Information', UserRound],
  ['private', 'Private Information', IdCard],
  ['access',  'Access Level', Shield],
];

const generatePersonId = () => String(Math.floor(1000000000 + Math.random() * 9000000000));

const localDateTimeValue = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const emptyForm = () => ({
  employee_no: generatePersonId(),
  department_id: '',
  first_name: '',
  last_name: '',
  valid_from: localDateTimeValue(),
  valid_to: '2036-12-31T23:59',
  employment_date: localDateTimeValue(),
  gender: 'unknown',
  position: '',
  email: '',
  phone: '',
  notes: '',
  card_number: '',
  card_numbers: [],
  fingerprints: [],
  pin_code: '',
  max_access_times: '',
  access_times_used: 0,
  acs_active: true,
  super_access: false,
  extended_access: false,
  device_administrator: false,
  allow_mobile_door: true,
  access_level_ids: [],
});

function buildTree(rows, parentId = null) {
  return rows
    .filter(row => (row.parent_id || null) === parentId)
    .map(row => ({ ...row, children: buildTree(rows, row.id) }));
}

function InlineDeptInput({ editCtx, placeholder, style }) {
  return (
    <div className="pm-dept-node pm-dept-editing" style={style}>
      <span className="pm-tree-spacer" />
      <Folder size={14} />
      <input
        ref={editCtx.inputRef}
        className="pm-dept-name-input"
        value={editCtx.editValue}
        onChange={e => editCtx.onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); editCtx.onConfirm(); }
          if (e.key === 'Escape') { e.preventDefault(); editCtx.onCancel(); }
        }}
        onBlur={() => {
          editCtx.blurTimer.current = setTimeout(editCtx.onConfirm, 150);
        }}
        onFocus={() => clearTimeout(editCtx.blurTimer.current)}
        placeholder={placeholder || 'Department name'}
        autoFocus
      />
    </div>
  );
}

function DepartmentNode({ node, selected, onSelect, depth = 0, editCtx }) {
  const [open, setOpen] = useState(true);
  const isRenaming    = editCtx?.inlineEdit?.mode === 'rename' && editCtx?.inlineEdit?.id === node.id;
  const isAddingChild = editCtx?.inlineEdit?.mode === 'add'    && editCtx?.inlineEdit?.parentId === node.id;
  const hasChildren   = node.children.length > 0 || isAddingChild;

  const toggle = (
    <span
      className="pm-tree-toggle"
      onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
    >
      {hasChildren
        ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
        : <span className="pm-tree-spacer" />}
    </span>
  );

  return (
    <>
      {isRenaming ? (
        <div
          className={`pm-dept-node pm-dept-editing${selected === node.id ? ' active' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          {toggle}
          <Folder size={14} />
          <input
            ref={editCtx.inputRef}
            className="pm-dept-name-input"
            value={editCtx.editValue}
            onChange={e => editCtx.onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); editCtx.onConfirm(); }
              if (e.key === 'Escape') { e.preventDefault(); editCtx.onCancel(); }
            }}
            onBlur={() => { editCtx.blurTimer.current = setTimeout(editCtx.onConfirm, 150); }}
            onFocus={() => clearTimeout(editCtx.blurTimer.current)}
          />
        </div>
      ) : (
        <button
          className={`pm-dept-node${selected === node.id ? ' active' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => onSelect(node.id)}
          onDoubleClick={e => { e.preventDefault(); editCtx?.onStartRename(node.id, node.name); }}
        >
          {toggle}
          <Folder size={14} />
          <span>{node.name}</span>
        </button>
      )}
      {open && node.children.map(child => (
        <DepartmentNode
          key={child.id}
          node={child}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
          editCtx={editCtx}
        />
      ))}
      {open && isAddingChild && (
        <InlineDeptInput
          editCtx={editCtx}
          style={{ paddingLeft: 12 + (depth + 1) * 16 }}
        />
      )}
    </>
  );
}

function Field({ label, required, children, hint, className = '' }) {
  return (
    <label className={`pm-hc-field ${className}`}>
      <span>{required && <b>*</b>}{label}</span>
      <div>{children}</div>
      {hint && <small>{hint}</small>}
    </label>
  );
}


function PromptModal({ title, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const submit = () => { if (value.trim()) onConfirm(value.trim()); };
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{title}</strong>
          <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="pm-dialog-body">
          <input
            ref={inputRef}
            className="pm-dialog-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
            placeholder={title}
          />
        </div>
        <div className="pm-dialog-footer">
          <button className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button className="save-btn" onClick={submit} disabled={!value.trim()}>OK</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialogModal({ message, danger, onConfirm, onCancel }) {
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{danger ? 'Confirm' : 'Notice'}</strong>
          {onCancel && <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>}
        </div>
        <div className="pm-dialog-body">
          <p className="pm-dialog-msg">{message}</p>
        </div>
        <div className="pm-dialog-footer">
          {danger
            ? <>
                <button className="ghost-btn" onClick={onCancel}>Cancel</button>
                <button className="danger-btn" onClick={onConfirm}>Delete</button>
              </>
            : <button className="save-btn" onClick={onConfirm}>OK</button>
          }
        </div>
      </div>
    </div>
  );
}

function PersonEditor({ person, departments, devices, levels, token, onClose, onSaved }) {
  const [tab, setTab] = useState('basic');
  const [form, setForm] = useState(() => {
    if (!person) return emptyForm();
    const cardNumbers = person.card_numbers?.length
      ? person.card_numbers
      : (person.card_number ? [person.card_number] : []);
    return {
      ...emptyForm(),
      ...person,
      card_number: cardNumbers[0] || '',
      card_numbers: cardNumbers,
      department_id: person.department_id || '',
      access_level_ids: (person.access_levels || []).map(level => level.id),
    };
  });
  const [photo, setPhoto] = useState(null);
  const [credModal, setCredModal] = useState(false);
  const [preview, setPreview] = useState(() => mediaUrl(API, person?.preview_image));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoMenu, setPhotoMenu] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [usbIndex, setUsbIndex] = useState(0);
  const [cardEnrollment, setCardEnrollment] = useState({
    open: false,
    deviceId: '',
    sessionId: '',
    status: 'idle',
    seconds: 60,
    cardNumber: '',
    message: '',
  });
  const [fingerEnrollment, setFingerEnrollment] = useState({
    open: false,
    deviceId: '',
    status: 'idle',
    message: '',
  });
  const [pinModal, setPinModal] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const uploadRef = useRef(null);
  const cardPollRef = useRef(null);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => () => {
    if (cardPollRef.current) clearTimeout(cardPollRef.current);
  }, []);

  const toggleArray = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter(item => item !== value)
        : [...current[key], value],
    }));
  };

  const choosePhoto = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    usePhotoFile(file);
  };

  const usePhotoFile = file => {
    setPhoto(file);
    setPreview(current => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setPhotoMenu(null);
  };

  const fetchPhoto = async url => {
    setPhotoBusy(true);
    setError('');
    try {
      const response = await apiFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Image capture failed (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      usePhotoFile(new File([blob], `person-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' }));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const captureFromDevice = () => {
    if (!selectedCamera) return;
    fetchPhoto(`${API}/api/acs/${selectedCamera}/face-capture`);
  };

  const captureUsb = () => {
    fetchPhoto(`${API}/api/acs/person-management/capture-usb?device_index=${usbIndex}`);
  };

  const openCardEnrollment = () => {
    if (cardPollRef.current) clearTimeout(cardPollRef.current);
    setCredModal(false);
    setCardEnrollment({
      open: true,
      deviceId: String(selectedCamera || devices[0]?.id || ''),
      sessionId: '',
      status: 'idle',
      seconds: 60,
      cardNumber: '',
      message: '',
    });
  };

  const stopCardEnrollment = async (returnToCredentials = true) => {
    if (cardPollRef.current) clearTimeout(cardPollRef.current);
    cardPollRef.current = null;
    if (cardEnrollment.sessionId && cardEnrollment.status === 'collecting') {
      apiFetch(`${API}/api/acs/person-management/card-enrollment/${cardEnrollment.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setCardEnrollment(current => ({ ...current, open: false, sessionId: '', status: 'idle' }));
    if (returnToCredentials) setCredModal(true);
  };

  const pollCardEnrollment = async sessionId => {
    try {
      const response = await apiFetch(`${API}/api/acs/person-management/card-enrollment/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Card reader error (HTTP ${response.status})`);

      if (data.status === 'captured') {
        const cardNumbers = form.card_numbers || [];
        const enrollmentError = cardNumbers.includes(data.card_number)
          ? 'This card is already added to the person.'
          : (cardNumbers.length >= 5 ? 'A person can have up to 5 cards.' : '');
        if (!enrollmentError) {
          const nextCards = [...cardNumbers, data.card_number];
          setForm(current => ({
            ...current,
            card_number: nextCards[0] || '',
            card_numbers: nextCards,
          }));
        }
        setCardEnrollment(current => ({
          ...current,
          status: enrollmentError ? 'error' : 'captured',
          cardNumber: data.card_number,
          seconds: 0,
          message: enrollmentError,
        }));
        return;
      }
      if (data.status === 'expired') {
        setCardEnrollment(current => ({
          ...current,
          status: 'expired',
          seconds: 0,
          message: 'No card was detected. Start enrollment again.',
        }));
        return;
      }

      setCardEnrollment(current => ({ ...current, seconds: data.expires_in ?? current.seconds }));
      cardPollRef.current = setTimeout(() => pollCardEnrollment(sessionId), 1000);
    } catch (err) {
      setCardEnrollment(current => ({
        ...current,
        status: 'error',
        message: String(err.message || err),
      }));
    }
  };

  const startCardEnrollment = async () => {
    if (!cardEnrollment.deviceId) return;
    if (cardPollRef.current) clearTimeout(cardPollRef.current);
    setCardEnrollment(current => ({
      ...current,
      status: 'starting',
      message: '',
      cardNumber: '',
      seconds: 60,
    }));
    try {
      const response = await apiFetch(`${API}/api/acs/person-management/card-enrollment/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_id: Number(cardEnrollment.deviceId) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Unable to start enrollment (HTTP ${response.status})`);
      setCardEnrollment(current => ({
        ...current,
        sessionId: data.session_id,
        status: 'collecting',
        seconds: data.expires_in || 60,
      }));
      pollCardEnrollment(data.session_id);
    } catch (err) {
      setCardEnrollment(current => ({
        ...current,
        status: 'error',
        message: String(err.message || err),
      }));
    }
  };

  const openFingerprintEnrollment = () => {
    setCredModal(false);
    setFingerEnrollment({
      open: true,
      deviceId: String(selectedCamera || devices[0]?.id || ''),
      status: 'idle',
      message: '',
    });
  };

  const captureFingerprint = async () => {
    if (!fingerEnrollment.deviceId || form.fingerprints.length >= 10) return;
    const usedNumbers = new Set(form.fingerprints.map(item => Number(item.finger_no)));
    const fingerNo = Array.from({ length: 10 }, (_, index) => index + 1)
      .find(value => !usedNumbers.has(value));
    setFingerEnrollment(current => ({ ...current, status: 'collecting', message: '' }));
    try {
      const response = await apiFetch(`${API}/api/acs/person-management/fingerprint-capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: Number(fingerEnrollment.deviceId),
          finger_no: fingerNo,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Fingerprint capture failed (HTTP ${response.status})`);
      setForm(current => ({
        ...current,
        fingerprints: [...current.fingerprints, {
          finger_no: data.finger_no,
          quality: data.quality,
          template: data.template,
        }],
      }));
      setFingerEnrollment(current => ({
        ...current,
        status: 'captured',
        message: `Fingerprint ${data.finger_no} captured. Quality: ${data.quality}%`,
      }));
    } catch (err) {
      setFingerEnrollment(current => ({
        ...current,
        status: 'error',
        message: String(err.message || err),
      }));
    }
  };

  const openPinModal = () => {
    setPinDraft(form.pin_code || '');
    setCredModal(false);
    setPinModal(true);
  };

  const savePin = () => {
    if (!/^\d{4,8}$/.test(pinDraft)) return;
    set('pin_code', pinDraft);
    setPinModal(false);
    setCredModal(true);
  };

  const save = async (continueAdding = false) => {
    setSaving(true);
    setError('');
    try {
      if (!form.valid_from || !form.valid_to) {
        setError('Effective Period start and end are required');
        return;
      }
      if (new Date(form.valid_to).getTime() <= new Date(form.valid_from).getTime()) {
        setError('Effective Period end must be later than its start');
        return;
      }
      const body = new FormData();
      body.append('payload', JSON.stringify({
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
      }));
      if (photo) body.append('photo', photo);
      const response = await apiFetch(
        person
          ? `${API}/api/acs/person-management/persons/${person.id}`
          : `${API}/api/acs/person-management/persons`,
        {
          method: person ? 'PATCH' : 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body,
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Unable to save person');
        return;
      }
      onSaved(data, continueAdding);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-hc-editor">
      <div className="pm-hc-editor-title">
        <div>
          <strong>{person ? 'Edit Person' : 'Add Person'}</strong>
          <span>{person ? person.full_name : 'Create a person and assign controller credentials'}</span>
        </div>
        <button onClick={onClose} title="Close"><X size={18} /></button>
      </div>

      <div className="pm-hc-tabs">
        {EDITOR_TABS.map(([id, label, Icon]) => (
          <button key={id} className={`pm-hc-tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {error && <div className="pm-error">{error}</div>}

      <div className="pm-hc-editor-body">
        {tab === 'basic' && (
          <div className="pm-hc-basic">
            <div className="pm-hc-fields">
              <Field
                label="ID"
                required
                hint="Once configured, the ID cannot be edited. Confirm the ID rule before setting an ID."
              >
                <div className="pm-hc-id-row">
                  <input
                    value={form.employee_no}
                    readOnly
                    disabled={Boolean(person)}
                  />
                  {!person && (
                    <button
                      type="button"
                      className="pm-hc-id-regen"
                      title="Regenerate ID"
                      onClick={() => set('employee_no', generatePersonId())}
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Department" required>
                <select value={form.department_id} onChange={event => set('department_id', event.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="First Name" required>
                <input value={form.first_name} onChange={event => set('first_name', event.target.value)} />
              </Field>
              <Field label="Last Name">
                <input value={form.last_name} onChange={event => set('last_name', event.target.value)} />
              </Field>
              <Field
                label="Effective Period"
                required
                hint="During the validity period, the person has access to assigned doors and levels."
              >
                <div className="pm-hc-period">
                  <input type="datetime-local" value={form.valid_from || ''} onChange={event => set('valid_from', event.target.value)} />
                  <span>-</span>
                  <input type="datetime-local" value={form.valid_to || ''} onChange={event => set('valid_to', event.target.value)} />
                </div>
              </Field>
              <Field label="Date of Employment">
                <input type="datetime-local" value={form.employment_date || ''} onChange={event => set('employment_date', event.target.value)} />
              </Field>
            </div>

            <div className="pm-hc-profile-panel">
              <div
                className="pm-hc-photo pm-hc-photo-hoverable"
                onClick={() => setCredModal(true)}
                title="Click to manage credentials"
              >
                {preview ? <img src={preview} alt="" /> : <UserRound size={64} />}
                <div className="pm-photo-hover-menu" onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => setPhotoMenu('device')}><Camera size={13} /> From Device</button>
                  <button type="button" onClick={() => setPhotoMenu('usb')}><Fingerprint size={13} /> Capture</button>
                  <button type="button" onClick={() => uploadRef.current?.click()}><Upload size={13} /> Upload Picture</button>
                </div>
              </div>
              <div className="pm-hc-profile-chips">
                <span className={preview ? 'active' : ''}><Image size={12} /> {preview ? 1 : 0} Face</span>
                <span className={form.card_numbers.length ? 'active' : ''}><CreditCard size={12} /> {form.card_numbers.length} Card</span>
                <span className={form.fingerprints.length ? 'active' : ''}><Fingerprint size={12} /> {form.fingerprints.length} FP</span>
                <span className={form.pin_code ? 'active' : ''}><KeyRound size={12} /> {form.pin_code ? 1 : 0} PIN</span>
              </div>
              <input ref={uploadRef} type="file" accept="image/*" onChange={choosePhoto} hidden />
              <button type="button" className="pm-hc-cred-open-btn" onClick={() => setCredModal(true)}>
                <IdCard size={14} /> Credential Management
              </button>
            </div>
          </div>
        )}

        {tab === 'private' && (
          <div className="pm-hc-private">
            <div className="pm-hc-radio-row">
              <span>Gender</span>
              <div>
                {['male', 'female', 'unknown'].map(value => (
                  <label key={value}>
                    <input type="radio" checked={form.gender === value} onChange={() => set('gender', value)} />
                    {value[0].toUpperCase() + value.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Position"><input value={form.position || ''} onChange={event => set('position', event.target.value)} placeholder="Please select." /></Field>
            <Field label="Email"><div className="pm-hc-input-icon"><Mail size={15} /><input type="email" value={form.email || ''} onChange={event => set('email', event.target.value)} placeholder="Please enter." /></div></Field>
            <Field label="Phone No."><div className="pm-hc-phone"><span>+374</span><input value={form.phone || ''} onChange={event => set('phone', event.target.value)} placeholder="Enter phone No." /></div></Field>
            <Field label="Remark"><textarea value={form.notes || ''} onChange={event => set('notes', event.target.value)} placeholder="Please enter." /></Field>
          </div>
        )}

        {tab === 'access' && (
          <div className="pm-hc-access">
            <div className="pm-hc-access-section">
              <div className="pm-hc-section-head"><span>Access Levels</span><small>Controllers and doors are assigned automatically by each level</small></div>
              <div className="pm-hc-assignment-grid single">
                <section>
                  <h4><Shield size={15} /> Access Levels</h4>
                  {levels.length ? levels.map(level => (
                    <label key={level.id}>
                      <input type="checkbox" checked={form.access_level_ids.includes(level.id)} onChange={() => toggleArray('access_level_ids', level.id)} />
                      <span className="pm-hc-level-dot" style={{ background: level.color }} />
                      {level.name}
                    </label>
                  )) : <p>No access levels configured.</p>}
                </section>
              </div>
            </div>

            <div className="pm-hc-perm-section">
              <div className="pm-hc-section-head"><span>Access Limit</span><small>Person becomes passive when the limit is reached</small></div>
              <div className="pm-hc-perm-rows">
                <div className="pm-hc-perm-row">
                  <div>
                    <strong>Limit Access Times</strong>
                    <small>
                      {form.max_access_times
                        ? `${form.access_times_used || 0} used, ${Math.max(0, Number(form.max_access_times) - Number(form.access_times_used || 0))} remaining`
                        : 'Unlimited entries'}
                    </small>
                  </div>
                  <input type="number" min="1" placeholder="Unlimited" value={form.max_access_times || ''} onChange={e => set('max_access_times', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      <div className="pm-hc-editor-footer">
        <span>{form.access_level_ids.length ? 'Controller sync is managed by access levels' : 'Saved locally'}</span>
        <div>
          <button className="save-btn" onClick={() => save(false)} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : person ? 'Save' : 'Add'}</button>
          {!person && <button className="ghost-btn" onClick={() => save(true)} disabled={saving}>Add and Continue</button>}
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>

      {credModal && (
        <div className="pm-capture-overlay" onMouseDown={e => e.target === e.currentTarget && setCredModal(false)}>
          <div className="pm-cred-modal">
            <div className="pm-capture-head">
              <div>
                <strong>Credential Management</strong>
                <span>Manage fingerprint, card and PIN credentials</span>
              </div>
              <button onClick={() => setCredModal(false)}><X size={17} /></button>
            </div>

            <div className="pm-cred-cards">
              <div className="pm-cred-card">
                <Fingerprint size={26} />
                <span>Fingerprint</span>
                <strong>{form.fingerprints.length} / 10</strong>
                <div className="pm-fingerprint-list">
                  {form.fingerprints.map(fingerprint => (
                    <div key={fingerprint.finger_no}>
                      <span>Finger {fingerprint.finger_no}</span>
                      <small>{fingerprint.quality || 0}%</small>
                      <button
                        type="button"
                        title="Remove fingerprint"
                        onClick={() => setForm(current => ({
                          ...current,
                          fingerprints: current.fingerprints.filter(
                            item => item.finger_no !== fingerprint.finger_no,
                          ),
                        }))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {form.fingerprints.length < 10 && (
                  <button type="button" className="pm-cred-add" onClick={openFingerprintEnrollment}>
                    <Plus size={13} /> Add
                  </button>
                )}
              </div>
              <div className="pm-cred-card">
                <CreditCard size={26} />
                <span>Card</span>
                <strong>{form.card_numbers.length} / 5</strong>
                <div className="pm-cred-card-list">
                  {form.card_numbers.map(cardNumber => (
                    <div key={cardNumber} className="pm-cred-card-number">
                      <code>{cardNumber}</code>
                      <button
                        type="button"
                        title="Remove card"
                        onClick={() => setForm(current => {
                          const nextCards = current.card_numbers.filter(value => value !== cardNumber);
                          return {
                            ...current,
                            card_number: nextCards[0] || '',
                            card_numbers: nextCards,
                          };
                        })}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {form.card_numbers.length < 5 && (
                  <button type="button" className="pm-cred-add" onClick={openCardEnrollment}>
                    <Plus size={13} /> Add
                  </button>
                )}
              </div>
              <div className="pm-cred-card">
                <KeyRound size={26} />
                <span>PIN Code</span>
                <strong>{form.pin_code ? 1 : 0} / 1</strong>
                {form.pin_code
                  ? (
                    <div className="pm-pin-actions">
                      <code>{'•'.repeat(Math.min(form.pin_code.length, 8))}</code>
                      <button type="button" onClick={openPinModal}>Edit</button>
                      <button type="button" onClick={() => set('pin_code', '')}>Remove</button>
                    </div>
                  )
                  : (
                    <button type="button" className="pm-cred-add" onClick={openPinModal}>
                      <Plus size={13} /> Add
                    </button>
                  )}
              </div>
            </div>

            <div className="pm-capture-actions">
              <button onClick={() => setCredModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {fingerEnrollment.open && (
        <div
          className="pm-capture-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && fingerEnrollment.status !== 'collecting') {
              setFingerEnrollment(current => ({ ...current, open: false }));
              setCredModal(true);
            }
          }}
        >
          <div className="pm-capture-dialog">
            <div className="pm-capture-head">
              <div>
                <strong>Enroll Fingerprint</strong>
                <span>Select a terminal and place a finger on its fingerprint reader</span>
              </div>
              <button
                disabled={fingerEnrollment.status === 'collecting'}
                onClick={() => {
                  setFingerEnrollment(current => ({ ...current, open: false }));
                  setCredModal(true);
                }}
              >
                <X size={17} />
              </button>
            </div>
            <div className="pm-capture-body">
              <label>
                Access Terminal
                <select
                  value={fingerEnrollment.deviceId}
                  disabled={fingerEnrollment.status === 'collecting'}
                  onChange={event => setFingerEnrollment(current => ({
                    ...current,
                    deviceId: event.target.value,
                    status: 'idle',
                    message: '',
                  }))}
                >
                  <option value="">Select a terminal</option>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.ip_address})
                    </option>
                  ))}
                </select>
              </label>
              {fingerEnrollment.status === 'collecting' && (
                <div className="pm-finger-collecting">
                  <Fingerprint size={58} />
                  <strong>Collecting fingerprint...</strong>
                  <span>Keep your finger on the terminal reader</span>
                </div>
              )}
              {fingerEnrollment.status === 'captured' && (
                <div className="pm-finger-success">
                  <Fingerprint size={36} />
                  <strong>{fingerEnrollment.message}</strong>
                </div>
              )}
              {fingerEnrollment.status === 'error' && (
                <div className="pm-card-enroll-error">{fingerEnrollment.message}</div>
              )}
              {fingerEnrollment.status === 'idle' && (
                <p>The next free fingerprint slot will be selected automatically.</p>
              )}
            </div>
            <div className="pm-capture-actions">
              <button
                disabled={fingerEnrollment.status === 'collecting'}
                onClick={() => {
                  setFingerEnrollment(current => ({ ...current, open: false }));
                  setCredModal(true);
                }}
              >
                Close
              </button>
              <button
                className="primary"
                disabled={!fingerEnrollment.deviceId || fingerEnrollment.status === 'collecting'}
                onClick={captureFingerprint}
              >
                {fingerEnrollment.status === 'collecting'
                  ? <LoaderCircle className="spin" size={14} />
                  : <Fingerprint size={14} />}
                {fingerEnrollment.status === 'captured' ? 'Add Another' : 'Start Enrollment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pinModal && (
        <div className="pm-capture-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) {
            setPinModal(false);
            setCredModal(true);
          }
        }}>
          <div className="pm-capture-dialog pm-pin-dialog">
            <div className="pm-capture-head">
              <div>
                <strong>{form.pin_code ? 'Edit PIN Code' : 'Add PIN Code'}</strong>
                <span>Enter a numeric PIN containing 4 to 8 digits</span>
              </div>
              <button onClick={() => { setPinModal(false); setCredModal(true); }}><X size={17} /></button>
            </div>
            <div className="pm-capture-body">
              <label>
                PIN Code
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                  value={pinDraft}
                  onChange={event => setPinDraft(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && /^\d{4,8}$/.test(pinDraft)) savePin();
                  }}
                  placeholder="4-8 digits"
                />
              </label>
              {pinDraft && !/^\d{4,8}$/.test(pinDraft) && (
                <div className="pm-pin-hint">PIN must contain at least 4 digits.</div>
              )}
            </div>
            <div className="pm-capture-actions">
              <button onClick={() => { setPinModal(false); setCredModal(true); }}>Cancel</button>
              <button className="primary" disabled={!/^\d{4,8}$/.test(pinDraft)} onClick={savePin}>
                <Save size={14} /> Save PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {cardEnrollment.open && (
        <div className="pm-capture-overlay" onMouseDown={event => event.target === event.currentTarget && stopCardEnrollment()}>
          <div className="pm-capture-dialog pm-card-enroll-dialog">
            <div className="pm-capture-head">
              <div>
                <strong>Enroll Card</strong>
                <span>Select a terminal, start enrollment, then hold the card on its reader</span>
              </div>
              <button onClick={() => stopCardEnrollment()}><X size={17} /></button>
            </div>

            <div className="pm-capture-body">
              <label>
                Access Terminal
                <select
                  value={cardEnrollment.deviceId}
                  disabled={['starting', 'collecting'].includes(cardEnrollment.status)}
                  onChange={event => setCardEnrollment(current => ({
                    ...current,
                    deviceId: event.target.value,
                    status: 'idle',
                    message: '',
                  }))}
                >
                  <option value="">Select a terminal</option>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.ip_address})
                    </option>
                  ))}
                </select>
              </label>

              {['starting', 'collecting'].includes(cardEnrollment.status) && (
                <div className="pm-card-collecting">
                  <div className="pm-card-reader">
                    <CreditCard size={48} />
                    <i />
                  </div>
                  <strong>
                    {cardEnrollment.status === 'starting' ? 'Starting enrollment...' : 'Waiting for card...'}
                  </strong>
                  <span>Hold the card on the selected terminal</span>
                  <small>{cardEnrollment.seconds}s remaining</small>
                </div>
              )}

              {cardEnrollment.status === 'captured' && (
                <div className="pm-card-enroll-success">
                  <CreditCard size={34} />
                  <span>Card captured successfully</span>
                  <strong>{cardEnrollment.cardNumber}</strong>
                </div>
              )}

              {['error', 'expired'].includes(cardEnrollment.status) && (
                <div className="pm-card-enroll-error">{cardEnrollment.message}</div>
              )}

              {cardEnrollment.status === 'idle' && (
                <p>The terminal will be monitored for a new card swipe for 60 seconds.</p>
              )}
            </div>

            <div className="pm-capture-actions">
              <button onClick={() => stopCardEnrollment()}>
                {cardEnrollment.status === 'captured' ? 'Close' : 'Cancel'}
              </button>
              {cardEnrollment.status !== 'captured' && (
                <button
                  className="primary"
                  disabled={!cardEnrollment.deviceId || ['starting', 'collecting'].includes(cardEnrollment.status)}
                  onClick={startCardEnrollment}
                >
                  {cardEnrollment.status === 'starting'
                    ? <LoaderCircle className="spin" size={14} />
                    : <CreditCard size={14} />}
                  {['error', 'expired'].includes(cardEnrollment.status) ? 'Try Again' : 'Start Enrollment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {photoMenu && (
        <div className="pm-capture-overlay" onMouseDown={event => event.target === event.currentTarget && setPhotoMenu(null)}>
          <div className="pm-capture-dialog">
            <div className="pm-capture-head">
              <div>
                <strong>{photoMenu === 'device' ? 'Capture From Device' : 'Capture From USB Camera'}</strong>
                <span>{photoMenu === 'device' ? 'Collect a face from an access terminal in Device Management' : 'Use a webcam connected to this server'}</span>
              </div>
              <button onClick={() => setPhotoMenu(null)}><X size={17} /></button>
            </div>

            {photoMenu === 'device' ? (
              <div className="pm-capture-body">
                {photoBusy ? (
                  <div className="pm-collecting">
                    <div className="pm-collecting-frame">
                      <UserRound size={62} />
                      <span />
                    </div>
                    <strong><LoaderCircle className="spin" size={17} /> Collecting...</strong>
                    <p>Look directly at the access terminal and keep still.</p>
                  </div>
                ) : (
                  <>
                    <label>Access Terminal
                      <select value={selectedCamera} onChange={event => setSelectedCamera(event.target.value)}>
                        <option value="">Select access terminal</option>
                        {devices.filter(device => device.is_active).map(device => (
                          <option key={`controller-${device.id}`} value={device.id}>Controller: {device.name} ({device.ip_address})</option>
                        ))}
                      </select>
                    </label>
                    {!devices.filter(device => device.is_active).length && (
                      <p>No active access terminals are available in Device Management.</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="pm-capture-body">
                <label>USB Camera
                  <select value={usbIndex} onChange={event => setUsbIndex(Number(event.target.value))}>
                    {[0, 1, 2, 3].map(index => <option key={index} value={index}>Camera {index + 1} (index {index})</option>)}
                  </select>
                </label>
                <p>Try another index if more than one USB camera is connected.</p>
              </div>
            )}

            <div className="pm-capture-actions">
              <button onClick={() => setPhotoMenu(null)} disabled={photoBusy && photoMenu === 'device'}>Cancel</button>
              <button
                className="primary"
                disabled={photoBusy || (photoMenu === 'device' && !selectedCamera)}
                onClick={photoMenu === 'device' ? captureFromDevice : captureUsb}
              >
                <Camera size={14} /> {photoBusy ? 'Capturing...' : 'Capture Photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function exportPersons(persons) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['ID', 'First Name', 'Last Name', 'Department', 'Card Number', 'Sync Status'],
    ...persons.map(person => [
      person.employee_no || person.id,
      person.first_name || person.full_name,
      person.last_name || '',
      person.department || 'All Departments',
      person.card_number || '',
      person.acs_sync_status || 'local',
    ]),
  ];
  const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'persons.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function syncErrorText(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map(item => {
      const device = item.device_name || `Device ${item.device_id || ''}`.trim();
      const message = item.message
        || item.person?.message
        || item.person?.status_string
        || item.face?.message
        || item.fingerprints?.message
        || 'Synchronization failed';
      return `${device}: ${message}`;
    }).join('\n');
  } catch {
    return String(value);
  }
}

export default function PersonManagement({ token, isAdmin, refreshTrigger = 0, deptRefreshTrigger = 0 }) {
  const [departments, setDepartments] = useState([]);
  const [persons, setPersons] = useState([]);
  const [devices, setDevices] = useState([]);
  const [levels, setLevels] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [includeSubs, setIncludeSubs] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editorPerson, setEditorPerson] = useState(undefined);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [allDeptsLabel, setAllDeptsLabel] = useState(() => localStorage.getItem('acs_all_depts_label') || 'All Departments');
  const [moveModal, setMoveModal] = useState(false);
  const [moveDeptId, setMoveDeptId] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [syncFilter, setSyncFilter] = useState('all');
  const [syncBusy, setSyncBusy] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(null); // { mode:'add', parentId } | { mode:'rename', id }
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef(null);
  const editValueRef = useRef('');
  const inlineEditRef = useRef(null);
  const savingRef = useRef(false);
  const blurTimerRef = useRef(null);

  const showConfirm = (message, danger = false) =>
    new Promise(resolve => setConfirmModal({ message, danger, resolve }));

  const _applyEdit = (state, value) => {
    inlineEditRef.current = state;
    editValueRef.current = value;
    setInlineEdit(state);
    setEditValue(value);
  };

  const cancelEdit = () => {
    clearTimeout(blurTimerRef.current);
    savingRef.current = false;
    _applyEdit(null, '');
  };

  const confirmEdit = async () => {
    clearTimeout(blurTimerRef.current);
    if (savingRef.current) return;
    const name = editValueRef.current.trim();
    const state = inlineEditRef.current;
    if (!name || !state) { cancelEdit(); return; }
    if (state.mode === 'rename-root') {
      localStorage.setItem('acs_all_depts_label', name);
      setAllDeptsLabel(name);
      cancelEdit();
      return;
    }
    savingRef.current = true;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    try {
      if (state.mode === 'add') {
        const res = await apiFetch(`${API}/api/acs/person-management/departments`, {
          method: 'POST', headers,
          body: JSON.stringify({ name, parent_id: state.parentId }),
        });
        if (res.ok) cancelEdit();
        else savingRef.current = false;
      } else if (state.mode === 'rename') {
        const res = await apiFetch(`${API}/api/acs/person-management/departments/${state.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ name }),
        });
        if (res.ok) cancelEdit();
        else savingRef.current = false;
      }
    } catch { savingRef.current = false; }
  };

  const startAdd = (parentId = null) => {
    _applyEdit({ mode: 'add', parentId }, '');
  };

  const startRename = (deptId, deptName) => {
    const id = deptId !== undefined ? deptId : departments.find(d => d.id === selectedDepartment)?.id;
    const name = deptName !== undefined ? deptName : departments.find(d => d.id === id)?.name;
    if (!id) return;
    _applyEdit({ mode: 'rename', id }, name || '');
  };

  const startRenameRoot = () => {
    _applyEdit({ mode: 'rename-root' }, allDeptsLabel);
  };

  const moveDepts = async () => {
    try {
      const response = await apiFetch(`${API}/api/acs/person-management/persons/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ person_ids: selectedIds, department_id: moveDeptId ? Number(moveDeptId) : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        await showConfirm(data.detail || 'Unable to move person', false);
        return;
      }
      setMoveModal(false);
      setSelectedIds([]);
      await loadPersons();
    } catch (err) {
      await showConfirm(`Unable to move person: ${String(err.message || err)}`, false);
    }
  };
  const departmentTree = useMemo(() => {
    const term = departmentSearch.trim().toLowerCase();
    return buildTree(term ? departments.filter(item => item.name.toLowerCase().includes(term)) : departments);
  }, [departments, departmentSearch]);

  const loadMeta = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [departmentResponse, deviceResponse, levelResponse] = await Promise.all([
      apiFetch(`${API}/api/acs/person-management/departments`, { headers }),
      apiFetch(`${API}/api/acs`, { headers }),
      apiFetch(`${API}/api/acs/levels`, { headers }),
    ]);
    if (departmentResponse.ok) setDepartments(await departmentResponse.json());
    if (deviceResponse.ok) setDevices(await deviceResponse.json());
    if (levelResponse.ok) setLevels(await levelResponse.json());
  }, [token]);

  const loadPersons = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        include_subdepartments: String(includeSubs),
        search,
      });
      if (selectedDepartment) params.set('department_id', selectedDepartment);
      const response = await apiFetch(`${API}/api/acs/person-management/persons?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setPersons(await response.json());
        setSelectedIds([]);
      }
    } finally {
      setLoading(false);
    }
  }, [includeSubs, search, selectedDepartment, token]);

  useEffect(() => {
    if (inlineEdit) {
      const t = setTimeout(() => editInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [inlineEdit]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => {
    const timer = setTimeout(loadPersons, 180);
    return () => clearTimeout(timer);
  }, [loadPersons]);
  // Reload when WebSocket signals a person was created, updated, or deleted
  useEffect(() => {
    if (refreshTrigger) loadPersons();
  }, [refreshTrigger]);

  // Reload department tree when WebSocket signals a department change
  useEffect(() => {
    if (deptRefreshTrigger) loadMeta();
  }, [deptRefreshTrigger]);

  const deleteDepartment = async () => {
    const department = departments.find(item => item.id === selectedDepartment);
    if (!department) return;
    const ok = await showConfirm(`Delete department "${department.name}"?`, true);
    if (!ok) return;
    const response = await apiFetch(`${API}/api/acs/person-management/departments/${department.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setSelectedDepartment(null);
      loadMeta();
    } else {
      const data = await response.json().catch(() => ({}));
      await showConfirm(data.detail || 'Unable to delete department');
    }
  };

  const removePersons = async ids => {
    if (!ids.length) return;
    const ok = await showConfirm(`Delete ${ids.length} selected person(s)?`, true);
    if (!ok) return;
    const results = await Promise.all(ids.map(async id => {
      try {
        const response = await apiFetch(`${API}/api/acs/person-management/persons/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data };
      } catch (requestError) {
        return {
          ok: false,
          status: 0,
          data: { detail: String(requestError.message || requestError) },
        };
      }
    }));
    const failedRequests = results.filter(result => !result.ok);
    const allDeletions = results.flatMap(result =>
      result.data?.device_deletions || result.data?.detail?.device_deletions || []
    );
    if (failedRequests.length) {
      const details = failedRequests.map(result => {
        const detail = result.data?.detail;
        const message = typeof detail === 'string'
          ? detail
          : detail?.message || 'Unable to delete person';
        return `${message} (HTTP ${result.status || 'network error'})`;
      }).join('\n');
      await showConfirm(details, false);
      return;
    }
    await loadPersons();
    const failed = allDeletions.filter(d => !d.ok);
    const succeeded = allDeletions.filter(d => d.ok);
    if (failed.length) {
      const details = failed.map(d =>
        `${d.device_name || 'Device ' + d.device_id}: ${d.message || d.status_string || 'error'}`
      ).join('\n');
      await showConfirm(`Device removal failed:\n${details}`, false);
    } else if (succeeded.length) {
      await showConfirm(`Deleted locally and from ${succeeded.length} controller(s).`, false);
    } else {
      await showConfirm('Deleted from database only — no active controllers configured.', false);
    }
  };

  const activatePerson = async person => {
    if (!person) return;
    const ok = await showConfirm(
      `Activate "${person.full_name || person.employee_no}" and reset access usage to 0?`,
      false,
    );
    if (!ok) return;
    const response = await apiFetch(`${API}/api/acs/person-management/persons/${person.id}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      await showConfirm(data.detail?.message || data.detail || 'Unable to activate person', false);
      return;
    }
    await loadPersons();
  };

  const resyncPerson = async person => {
    if (!person || !person.acs_active) return;
    setSyncBusy(true);
    try {
      const response = await apiFetch(`${API}/api/acs/person-management/persons/${person.id}/resync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        await showConfirm(data.detail || 'Unable to synchronize person', false);
        return;
      }
      await loadPersons();
    } catch (error) {
      await showConfirm(`Unable to synchronize person: ${String(error.message || error)}`, false);
    } finally {
      setSyncBusy(false);
    }
  };

  const visiblePersons = persons.filter(person => {
    if (activityFilter === 'active' && !person.acs_active) return false;
    if (activityFilter === 'passive' && person.acs_active) return false;
    const rawStatus = person.acs_active ? (person.acs_sync_status || 'local') : 'passive';
    const effectiveStatus = rawStatus === 'failed' ? 'error' : rawStatus;
    return syncFilter === 'all' || effectiveStatus === syncFilter;
  });
  const syncCounts = persons.reduce((counts, person) => {
    const status = person.acs_active ? (person.acs_sync_status || 'local') : 'passive';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const allSelected = visiblePersons.length > 0 && visiblePersons.every(person => selectedIds.includes(person.id));
  const activePerson = selectedIds.length === 1 ? persons.find(person => person.id === selectedIds[0]) : null;

  if (editorPerson !== undefined) {
    return (
      <PersonEditor
        key={editorPerson?.id || 'new'}
        person={editorPerson}
        departments={departments}
        devices={devices}
        levels={levels}
        token={token}
        onClose={() => setEditorPerson(undefined)}
        onSaved={(_, continueAdding) => {
          loadPersons();
          setEditorPerson(undefined);
          if (continueAdding) {
            window.setTimeout(() => setEditorPerson(null), 0);
          }
        }}
      />
    );
  }

  return (
    <div className="pm-hc-page">
      <div className="pm-hc-topbar">
        <div className="pm-hc-topbar-group">
          <button title="Add Department" onClick={() => startAdd(null)}><Plus size={18} /></button>
          <button
            title={selectedDepartment ? 'Rename Department' : 'Rename All Departments'}
            onClick={() => selectedDepartment ? startRename() : startRenameRoot()}
          >
            <Edit2 size={17} />
          </button>
          <button title="Delete Department" disabled={!selectedDepartment} onClick={deleteDepartment}><Trash2 size={17} /></button>
          <button title="Add Sub Department" disabled={!selectedDepartment} onClick={() => startAdd(selectedDepartment)}><ChevronDown size={16} /></button>
        </div>

        <div className="pm-hc-person-actions">
          <label className={`pm-hc-subdepartment-toggle ${includeSubs ? 'checked' : ''}`}><input type="checkbox" checked={includeSubs} onChange={event => setIncludeSubs(event.target.checked)} /> Include sub-departments</label>
          <span className="pm-hc-divider" />
          <button onClick={() => setEditorPerson(null)}><Plus size={17} /> Add</button>
          <button disabled={!activePerson} onClick={() => setEditorPerson(activePerson)}><Edit2 size={16} /> Edit</button>
          <button disabled={!activePerson || activePerson.acs_active} onClick={() => activatePerson(activePerson)}>
            <RefreshCw size={16} /> Activate
          </button>
          <button
            disabled={!activePerson?.acs_active || syncBusy}
            onClick={() => resyncPerson(activePerson)}
            title="Send this person's credentials to assigned controllers again"
          >
            <RefreshCw size={16} className={syncBusy ? 'spin' : ''} /> Retry Sync
          </button>
          <button disabled={!selectedIds.length || !isAdmin} onClick={() => removePersons(selectedIds)}><Trash2 size={16} /> Delete</button>
          <button disabled={!selectedIds.length} onClick={() => { setMoveDeptId(''); setMoveModal(true); }}><Folder size={16} /> Move</button>
          <span className="pm-hc-divider" />
          <button onClick={() => exportPersons(visiblePersons)} disabled={!visiblePersons.length}><Download size={16} /> Export</button>
          <button onClick={() => { loadMeta(); loadPersons(); }}><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="pm-hc-content">
        <aside className="pm-hc-departments">
          <div className="pm-hc-search">
            <Search size={17} />
            <input value={departmentSearch} onChange={event => setDepartmentSearch(event.target.value)} placeholder="Search" />
          </div>
          <button
            className={`pm-dept-node root ${selectedDepartment === null ? 'active' : ''}${inlineEdit?.mode === 'rename-root' ? ' pm-dept-editing' : ''}`}
            onClick={() => inlineEdit?.mode !== 'rename-root' && setSelectedDepartment(null)}
            onDoubleClick={e => { e.preventDefault(); startRenameRoot(); }}
          >
            <Building2 size={15} />
            {inlineEdit?.mode === 'rename-root' ? (
              <input
                ref={editInputRef}
                className="pm-dept-name-input"
                value={editValue}
                onChange={e => { editValueRef.current = e.target.value; setEditValue(e.target.value); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                }}
                onBlur={() => { blurTimerRef.current = setTimeout(confirmEdit, 150); }}
                onFocus={() => clearTimeout(blurTimerRef.current)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span>{allDeptsLabel}</span>
            )}
          </button>
          <div className="pm-tree">
            {departmentTree.map(node => (
              <DepartmentNode
                key={node.id}
                node={node}
                selected={selectedDepartment}
                onSelect={setSelectedDepartment}
                editCtx={{ inlineEdit, editValue, onChange: v => { editValueRef.current = v; setEditValue(v); }, onConfirm: confirmEdit, onCancel: cancelEdit, onStartRename: startRename, inputRef: editInputRef, blurTimer: blurTimerRef }}
              />
            ))}
            {inlineEdit?.mode === 'add' && inlineEdit?.parentId === null && (
              <InlineDeptInput
                editCtx={{ inlineEdit, editValue, onChange: v => { editValueRef.current = v; setEditValue(v); }, onConfirm: confirmEdit, onCancel: cancelEdit, onStartRename: startRename, inputRef: editInputRef, blurTimer: blurTimerRef }}
                style={{ paddingLeft: 12 }}
              />
            )}
          </div>
        </aside>

        <main className="pm-hc-list">
          <div className="pm-hc-filter-row">
            <div className="pm-hc-list-filter">
              <Search size={15} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ID, name, card or email" />
              <span>{visiblePersons.length} person(s)</span>
            </div>
            <AcsUiSelect
              className="pm-hc-ui-select"
              label="All activity"
              value={activityFilter}
              onChange={setActivityFilter}
              options={[
                { value: 'all', label: 'All activity' },
                { value: 'active', label: 'Active' },
                { value: 'passive', label: 'Passive' },
              ]}
            />
            <AcsUiSelect
              className="pm-hc-ui-select pm-hc-sync-select"
              label="All sync states"
              value={syncFilter}
              onChange={setSyncFilter}
              options={[
                { value: 'all', label: 'All sync states' },
                { value: 'synced', label: 'Synced', count: syncCounts.synced || 0 },
                { value: 'pending', label: 'Pending', count: syncCounts.pending || 0 },
                { value: 'error', label: 'Failed', count: (syncCounts.error || 0) + (syncCounts.failed || 0) },
                { value: 'local', label: 'Local', count: syncCounts.local || 0 },
                { value: 'passive', label: 'Passive', count: syncCounts.passive || 0 },
              ]}
            />
          </div>

          <div className="pm-hc-table-wrap">
            <table className="pm-hc-table">
              <thead>
                <tr>
                  <th className="check"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : visiblePersons.map(person => person.id))} /></th>
                  <th>Profile<br />Picture</th>
                  <th>ID</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Department</th>
                  <th>Credential Information</th>
                  <th>Sync Status</th>
                </tr>
              </thead>
              <tbody>
                {visiblePersons.map(person => {
                  const selected = selectedIds.includes(person.id);
                  return (
                    <tr
                      key={person.id}
                      className={selected ? 'selected' : ''}
                      onDoubleClick={() => setEditorPerson(person)}
                    >
                      <td className="check"><input type="checkbox" checked={selected} onChange={() => setSelectedIds(current => selected ? current.filter(id => id !== person.id) : [...current, person.id])} /></td>
                      <td><div className="pm-hc-avatar">{person.preview_image ? <img src={mediaUrl(API, person.preview_image)} alt="" /> : <UserRound size={23} />}</div></td>
                      <td className="strong">
                        <button
                          type="button"
                          className="pm-hc-id-link"
                          onClick={() => setEditorPerson(person)}
                          title="Edit person"
                        >
                          {person.employee_no || person.id}
                        </button>
                      </td>
                      <td>{person.first_name || person.full_name}</td>
                      <td>{person.last_name || '-'}</td>
                      <td>{person.department || 'All Departments'}</td>
                      <td>
                        <div className="pm-hc-credentials">
                          <span title="Cards"><IdCard size={15} /> {person.card_numbers?.length || (person.card_number ? 1 : 0)}</span>
                          <span title="Faces"><Image size={15} /> {person.preview_image ? 1 : 0}</span>
                          <span title="Access Levels"><Shield size={15} /> {person.access_levels?.length || 0}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`pm-sync ${person.acs_active ? person.acs_sync_status : 'passive'}`}
                          title={syncErrorText(person.acs_sync_error) || undefined}
                        >
                          {person.acs_active ? (person.acs_sync_status || 'local') : 'passive'}
                        </span>
                        {person.acs_active && ['error', 'failed'].includes(person.acs_sync_status) && (
                          <button
                            type="button"
                            className="pm-sync-retry"
                            onClick={event => { event.stopPropagation(); resyncPerson(person); }}
                            title={syncErrorText(person.acs_sync_error) || 'Retry synchronization'}
                            disabled={syncBusy}
                          >
                            <RefreshCw size={11} /> Retry
                          </button>
                        )}
                        {person.max_access_times && (
                          <small className="pm-access-usage">
                            {person.access_times_used || 0}/{person.max_access_times}
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loading && !visiblePersons.length && (
              <div className="pm-hc-empty">
                <div><MoreHorizontal size={24} /></div>
                <span>No data.</span>
              </div>
            )}
            {loading && <div className="pm-hc-loading">Loading...</div>}
          </div>

          <div className="pm-hc-pagination">
            <span>Showing: {visiblePersons.length} / Total: {persons.length}</span>
          </div>
        </main>
      </div>



      {/* ── Move Modal ── */}
      {moveModal && (
        <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && setMoveModal(false)}>
          <div className="pm-dialog">
            <div className="pm-dialog-header">
              <strong>Move to Department</strong>
              <button className="pm-dialog-close" onClick={() => setMoveModal(false)}><X size={16} /></button>
            </div>
            <div className="pm-dialog-body">
              <p style={{ margin: '0 0 10px', opacity: 0.7, fontSize: 13 }}>
                Moving {selectedIds.length} person(s)
              </p>
              <select
                className="pm-dialog-input"
                value={moveDeptId}
                onChange={e => setMoveDeptId(e.target.value)}
              >
                <option value="">{allDeptsLabel}</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div className="pm-dialog-footer">
              <button className="ghost-btn" onClick={() => setMoveModal(false)}>Cancel</button>
              <button className="save-btn" onClick={moveDepts}>Move</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <ConfirmDialogModal
          message={confirmModal.message}
          danger={confirmModal.danger}
          onConfirm={() => { setConfirmModal(null); confirmModal.resolve(true); }}
          onCancel={() => { setConfirmModal(null); confirmModal.resolve(false); }}
        />
      )}
    </div>
  );
}
