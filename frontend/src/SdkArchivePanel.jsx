import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Download, Film, LoaderCircle, Play, RefreshCw, Square, X } from 'lucide-react';
import { API } from './apiConfig';
import { apiFetch } from './apiClient';

const COPY = {
  ru: {
    archive: 'Видеоархив SDK', investigation: 'Расследование видео',
    hint: 'Запись и получение архива выполняются через SDK устройства. RTSP не используется.',
    camera: 'Камера', start: 'Начать запись', stop: 'Остановить запись', recording: 'Идёт запись', ready: 'Архив готов',
    refresh: 'Обновить', export: 'Экспортировать выбранное', download: 'Скачать', close: 'Закрыть', selected: 'Выбрано',
    clips: 'Фрагменты архива', timeline: 'Временная шкала', preview: 'Просмотр записи', selectClip: 'Выберите MP4-фрагмент для просмотра.',
    loadingClip: 'Загружается запись…', sdkFile: 'Исходный SDK-файл', rawHint: 'Этот исходный файл можно скачать. Для просмотра остановите запись и дождитесь MP4-фрагмента.',
    noArchive: 'Сохранённых фрагментов пока нет.', noSdkCameras: 'Нет камер, подключённых через Hikvision SDK.',
    mp4Only: 'Для экспорта выберите только готовые MP4-фрагменты.', error: 'Не удалось выполнить операцию с видеоархивом.',
  },
  en: {
    archive: 'SDK video archive', investigation: 'Video investigation',
    hint: 'Recording and archive retrieval are performed through the device SDK. RTSP is not used.',
    camera: 'Camera', start: 'Start recording', stop: 'Stop recording', recording: 'Recording in progress', ready: 'Archive ready',
    refresh: 'Refresh', export: 'Export selected', download: 'Download', close: 'Close', selected: 'Selected',
    clips: 'Archive clips', timeline: 'Timeline', preview: 'Clip preview', selectClip: 'Select an MP4 clip to play.',
    loadingClip: 'Loading clip…', sdkFile: 'Original SDK file', rawHint: 'This original file can be downloaded. Stop recording and wait for the MP4 clip to watch it here.',
    noArchive: 'No saved clips yet.', noSdkCameras: 'No cameras connected through Hikvision SDK.',
    mp4Only: 'Select only completed MP4 clips to export.', error: 'The video archive operation could not be completed.',
  },
  hy: {
    archive: 'SDK տեսաարխիվ', investigation: 'Տեսանյութի ուսումնասիրում',
    hint: 'Ձայնագրումն ու արխիվի ստացումը կատարվում են սարքի SDK-ով։ RTSP չի օգտագործվում։',
    camera: 'Տեսախցիկ', start: 'Սկսել ձայնագրումը', stop: 'Դադարեցնել ձայնագրումը', recording: 'Ձայնագրումը ընթացքի մեջ է', ready: 'Արխիվը պատրաստ է',
    refresh: 'Թարմացնել', export: 'Արտահանել ընտրվածը', download: 'Ներբեռնել', close: 'Փակել', selected: 'Ընտրված է',
    clips: 'Արխիվի հատվածներ', timeline: 'Ժամանակացույց', preview: 'Ձայնագրության դիտում', selectClip: 'Դիտելու համար ընտրեք MP4 հատված։',
    loadingClip: 'Ձայնագրությունը բեռնվում է…', sdkFile: 'Սկզբնական SDK ֆայլ', rawHint: 'Սկզբնական ֆայլը կարող եք ներբեռնել։ Դիտելու համար դադարեցրեք ձայնագրումը և սպասեք MP4 հատվածին։',
    noArchive: 'Պահպանված հատվածներ դեռ չկան։', noSdkCameras: 'Hikvision SDK-ով միացված տեսախցիկներ չկան։',
    mp4Only: 'Արտահանելու համար ընտրեք միայն պատրաստ MP4 հատվածներ։', error: 'Չհաջողվեց կատարել տեսաարխիվի գործողությունը։',
  },
};

function dateTime(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleString(lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fileSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SdkArchivePanel({ cameras, token, lang, onClose }) {
  const t = COPY[lang] || COPY.en;
  const sdkCameras = useMemo(() => cameras.filter(camera => (camera.snapshot_mode || 'hiksdk') === 'hiksdk'), [cameras]);
  const [cameraId, setCameraId] = useState(() => sdkCameras[0]?.id || '');
  const [status, setStatus] = useState({ recording: false });
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [activeClipName, setActiveClipName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const previewUrlRef = useRef('');
  const previewRequestRef = useRef(0);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const clearPreview = useCallback(() => {
    previewRequestRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPreviewUrl('');
    setPreviewLoading(false);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!sdkCameras.some(camera => String(camera.id) === String(cameraId))) setCameraId(sdkCameras[0]?.id || '');
  }, [cameraId, sdkCameras]);

  const load = useCallback(async () => {
    if (!cameraId) {
      setStatus({ recording: false });
      setSegments([]);
      return;
    }
    const [statusRes, segmentsRes] = await Promise.all([
      apiFetch(`${API}/api/video-archive/cameras/${cameraId}/status`, { headers }),
      apiFetch(`${API}/api/video-archive/cameras/${cameraId}/segments?limit=50`, { headers }),
    ]);
    if (statusRes.ok) setStatus(await statusRes.json());
    if (segmentsRes.ok) {
      const payload = await segmentsRes.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setSegments(items);
      setSelected(current => current.filter(filename => items.some(item => item.filename === filename)));
      setActiveClipName(current => items.some(item => item.filename === current) ? current : '');
      if (typeof payload?.recording === 'boolean') setStatus(current => ({ ...current, recording: payload.recording }));
    }
  }, [cameraId, headers]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async endpoint => {
    if (!cameraId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`${API}/api/video-archive/cameras/${cameraId}/${endpoint}`, { method: 'POST', headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || t.error);
      }
      await load();
    } catch (error) {
      setMessage(error?.message || t.error);
    } finally {
      setBusy(false);
    }
  };

  const download = async item => {
    try {
      const response = await apiFetch(`${API}${item.download_url}`, { headers });
      if (!response.ok) throw new Error(t.error);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setMessage(error?.message || t.error);
    }
  };

  const previewClip = async item => {
    setActiveClipName(item.filename);
    clearPreview();
    if (item.format !== 'mp4') return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewLoading(true);
    setMessage('');
    try {
      const response = await apiFetch(`${API}${item.download_url}`, { headers });
      if (!response.ok) throw new Error(t.error);
      const objectUrl = URL.createObjectURL(await response.blob());
      if (previewRequestRef.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      previewUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    } catch (error) {
      if (previewRequestRef.current === requestId) setMessage(error?.message || t.error);
    } finally {
      if (previewRequestRef.current === requestId) setPreviewLoading(false);
    }
  };

  const exportSelected = async () => {
    const files = segments.filter(item => selected.includes(item.filename));
    if (!files.length || files.some(item => item.format !== 'mp4')) {
      setMessage(t.mp4Only);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`${API}/api/video-archive/cameras/${cameraId}/export`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: files.map(item => item.filename) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || t.error);
      }
      await download(await response.json());
    } catch (error) {
      setMessage(error?.message || t.error);
    } finally {
      setBusy(false);
    }
  };

  const selectCamera = event => {
    clearPreview();
    setCameraId(event.target.value);
    setSelected([]);
    setActiveClipName('');
    setMessage('');
  };
  const toggleSelected = filename => setSelected(current => current.includes(filename) ? current.filter(item => item !== filename) : [...current, filename]);
  const activeClip = segments.find(item => item.filename === activeClipName);

  return (
    <div className="sc-archive-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sc-archive-dialog" role="dialog" aria-modal="true" aria-label={t.archive}>
        <header>
          <div><span className="sc-video-icon"><Archive size={20} /></span><div><p>{t.investigation}</p><h2>{t.archive}</h2><small>{t.hint}</small></div></div>
          <button className="sc-dialog-close" onClick={onClose} aria-label={t.close}><X size={20} /></button>
        </header>
        {!sdkCameras.length ? <div className="sc-archive-empty"><Film size={32} /><strong>{t.noSdkCameras}</strong></div> : <>
          <div className="sc-archive-controls">
            <label>{t.camera}<select value={cameraId} onChange={selectCamera}>{sdkCameras.map(camera => <option value={camera.id} key={camera.id}>{camera.name}</option>)}</select></label>
            <span className={status.recording ? 'sc-recording-state active' : 'sc-recording-state'}><i /> {status.recording ? t.recording : t.ready}</span>
            <div className="sc-archive-actions">
              <button className="sc-archive-secondary" onClick={load} disabled={busy}><RefreshCw size={15} /> {t.refresh}</button>
              {status.recording
                ? <button className="sc-archive-stop" onClick={() => action('stop')} disabled={busy}><Square size={14} fill="currentColor" /> {t.stop}</button>
                : <button className="sc-archive-start" onClick={() => action('start')} disabled={busy}><Play size={15} fill="currentColor" /> {t.start}</button>}
            </div>
          </div>
          {message && <div className="sc-archive-message">{message}</div>}
          <div className="sc-archive-list-head"><span>{t.selected}: {selected.length}</span><button onClick={exportSelected} disabled={busy || !selected.length}><Download size={15} /> {busy ? <LoaderCircle className="spin" size={15} /> : t.export}</button></div>
          <div className="sc-archive-workspace">
            <aside className="sc-archive-clips">
              <div className="sc-archive-section-title"><Film size={16} /> {t.clips}</div>
              <div className="sc-archive-list">
                {segments.map(item => <article key={item.filename} className={`sc-archive-row${activeClipName === item.filename ? ' is-active' : ''}`}>
                  <input type="checkbox" checked={selected.includes(item.filename)} onChange={() => toggleSelected(item.filename)} aria-label={item.filename} />
                  <button className="sc-archive-clip" onClick={() => previewClip(item)} title={item.format === 'mp4' ? t.preview : t.rawHint}>
                    <Film size={18} /><span><strong>{dateTime(item.created_at, lang)}</strong><small>{item.format === 'mp4' ? 'MP4' : t.sdkFile} · {fileSize(item.size_bytes)}</small></span>
                  </button>
                  <button className="sc-archive-download" onClick={() => download(item)} title={t.download}><Download size={16} /></button>
                </article>)}
                {!segments.length && <div className="sc-archive-empty"><Film size={30} /><strong>{t.noArchive}</strong></div>}
              </div>
            </aside>
            <section className="sc-archive-preview">
              <div className="sc-archive-section-title"><Play size={16} /> {t.preview}</div>
              {previewLoading ? <div className="sc-archive-preview-empty"><LoaderCircle className="spin" size={30} /><strong>{t.loadingClip}</strong></div>
                : previewUrl && activeClip ? <div className="sc-archive-player"><video controls preload="metadata" src={previewUrl} /><div><strong>{dateTime(activeClip.created_at, lang)}</strong><span>MP4 · {fileSize(activeClip.size_bytes)}</span></div></div>
                : activeClip ? <div className="sc-archive-preview-empty"><Archive size={31} /><strong>{t.sdkFile}</strong><span>{t.rawHint}</span><button onClick={() => download(activeClip)}><Download size={15} /> {t.download}</button></div>
                : <div className="sc-archive-preview-empty"><Film size={32} /><strong>{t.selectClip}</strong></div>}
              <div className="sc-archive-timeline"><span>{t.timeline}</span><div>{segments.map(item => <button type="button" key={item.filename} className={`${item.format === 'mp4' ? 'ready' : 'raw'}${activeClipName === item.filename ? ' is-active' : ''}`} title={dateTime(item.created_at, lang)} onClick={() => previewClip(item)} />)}</div></div>
            </section>
          </div>
        </>}
      </section>
    </div>
  );
}
