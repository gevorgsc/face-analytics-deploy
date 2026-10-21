import React, { useState, useMemo, useEffect } from 'react';
import { Upload, ImagePlus } from 'lucide-react';
import { useTr } from './i18n';
import { toast } from './useToast';
import { mediaUrl } from './mediaUrl';
import { API } from './apiConfig';

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function thumbImage(item) {
  return mediaUrl(API, item?.crop_image_path || item?.preview_image || item?.image_path || item?.original_image_path);
}

function Card({ children, className = '' }) {
  return <div className={'card ' + className}>{children}</div>;
}

function DragDropUpload({ files, setFiles }) {
  const t = useTr();
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef(null);

  // Create object URLs once per file set and revoke on cleanup to prevent memory leaks
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

  const addFiles = (newFiles) => {
    const imgs = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imgs].slice(0, 5));
  };

  const removeFile = (idx) => setFiles(f => f.filter((_, i) => i !== idx));

  return (
    <div
      className={`dragdrop-zone ${dragging ? 'dragdrop-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => addFiles(e.target.files)}
      />
      {files.length === 0 ? (
        <div className="dragdrop-hint">
          <ImagePlus size={28} />
          <p>{t('dragDropHint')}</p>
          <small>{t('dragDropSub')}</small>
        </div>
      ) : (
        <div className="dragdrop-previews" onClick={e => e.stopPropagation()}>
          {files.map((f, i) => (
            <div key={previews[i]} className="dragdrop-thumb">
              <img src={previews[i]} alt="" />
              <button onClick={() => removeFile(i)} className="dragdrop-remove">×</button>
            </div>
          ))}
          {files.length < 5 && (
            <div className="dragdrop-add" onClick={() => inputRef.current?.click()}>
              <ImagePlus size={20} />
              <small>{t('addMore')}</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PersonRegisterFields({ form, setForm }) {
  const t = useTr();
  return (
    <>
      <input placeholder={t('fullName')} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
      <select value={form.person_type} onChange={e => setForm({ ...form, person_type: e.target.value })}>
        <option value="employee">{t('employeeOption')}</option>
        <option value="vip">{t('vipOption')}</option>
        <option value="blacklist">{t('blacklistOption')}</option>
      </select>
      <input placeholder={t('departmentCompany')} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
      <input placeholder={t('phone')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <textarea placeholder={t('notes')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
    </>
  );
}

export default function RegisterPerson({ events, load, authFetch }) {
  const t = useTr();
  const [mode, setMode] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [form, setForm] = useState({ full_name: '', person_type: 'employee', department: '', phone: '', notes: '' });

  const reset = () => {
    setMode(null);
    setFiles([]);
    setSelectedEvent(null);
    setForm({ full_name: '', person_type: 'employee', department: '', phone: '', notes: '' });
  };

  const saveUpload = async () => {
    if (files.length === 0) { toast.warn(t('chooseAtLeastOneImage')); return; }
    if (!form.full_name) { toast.warn(t('writeFullName')); return; }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    files.forEach(f => fd.append('files', f));

    const res = await authFetch(API + '/api/persons/register', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { toast.error(data.detail || t('failedToUpdate')); return; }
    reset();
    load();
    toast.success(t('personRegistered'));
  };

  const saveFromEvent = async () => {
    if (!selectedEvent) { toast.warn(t('selectEvent')); return; }
    if (!form.full_name) { toast.warn(t('writeFullName')); return; }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));

    const res = await authFetch(API + '/api/persons/register-from-event/' + selectedEvent.id, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { toast.error(data.detail || t('failedToUpdate')); return; }
    reset();
    load();
    toast.success(t('personRegistered'));
  };

  return (
    <Card className="register-person compact-register">
      <h2>{t('registerPerson')}</h2>
      <p className="muted">{t('registerHint')}</p>
      <div className="register-actions">
        <button className="save-btn" onClick={() => setMode('upload')}><Upload size={18} />{t('uploadRegister')}</button>
        <button className="save-btn dark-btn" onClick={() => setMode('event')}><ImagePlus size={18} />{t('selectFromEvents')}</button>
      </div>

      {mode === 'upload' && (
        <div className="modal-bg">
          <div className="modal-card">
            <h2>{t('uploadRegister')}</h2>
            <DragDropUpload files={files} setFiles={setFiles} />
            {files.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {files.length} {t('face')} - {t('selected')}
                {files.length > 1 && ` - ${t('dragDropSub').split('-')[1]?.trim()}`}
              </p>
            )}
            <PersonRegisterFields form={form} setForm={setForm} />
            <div className="modal-actions">
              <button onClick={reset}>{t('cancel')}</button>
              <button className="save-btn" onClick={saveUpload}>{t('registerPerson')}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'event' && (
        <div className="modal-bg">
          <div className="modal-card large-modal">
            <h2>{t('selectFromEvents')}</h2>
            <div className="event-select-grid">
              {events.map(e => (
                <div
                  key={e.id}
                  className={selectedEvent?.id === e.id ? 'select-event selected' : 'select-event'}
                  onClick={() => setSelectedEvent(e)}
                >
                  <img src={thumbImage(e)} alt="" />
                  <small>{formatDateTime(e.created_at)}</small>
                </div>
              ))}
            </div>
            {selectedEvent && (
              <>
                <h2>{t('persons')}</h2>
                <PersonRegisterFields form={form} setForm={setForm} />
              </>
            )}
            <div className="modal-actions">
              <button onClick={reset}>{t('cancel')}</button>
              <button className="save-btn" onClick={saveFromEvent}>{t('registerPerson')}</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
