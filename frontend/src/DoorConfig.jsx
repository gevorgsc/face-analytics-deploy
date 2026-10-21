import { apiFetch } from './apiClient';
// DoorConfig.jsx — Door settings, face sync, interlock, event polling, reports

import React, { useCallback, useEffect, useState } from 'react';
import { Settings, Cpu, RefreshCw, Download, Play, Link, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { API } from './apiConfig';

function DeviceSection({ device, token, isAdmin, persons }) {
  const [expanded,  setExpanded]  = useState(false);
  const [doorConfs, setDoorConfs] = useState({});
  const [devInfo,   setDevInfo]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [polling,   setPolling]   = useState(false);
  const [pollRes,   setPollRes]   = useState(null);
  const [interlock, setInterlock] = useState(null);
  const [intEdit,   setIntEdit]   = useState(false);
  const [notice,    setNotice]    = useState(null);

  const showNotice = (msg, ok = true) => { setNotice({ msg, ok }); setTimeout(() => setNotice(null), 4000); };
  const [intEnabled,setIntEnabled]= useState(false);
  const [intGroups, setIntGroups] = useState('');

  const loadInfo = async () => {
    const res = await apiFetch(`${API}/api/acs/cfg/device-info/${device.id}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (res.ok) setDevInfo(await res.json());
  };

  const loadDoor = async (doorNo) => {
    const res = await apiFetch(`${API}/api/acs/cfg/door/${device.id}/${doorNo}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setDoorConfs(prev => ({ ...prev, [doorNo]: data }));
    }
  };

  const handleExpand = () => {
    if (!expanded) { loadInfo(); for (let i = 1; i <= (device.door_count||1); i++) loadDoor(i); }
    setExpanded(v => !v);
  };

  const saveDoor = async (doorNo, cfg) => {
    await apiFetch(`${API}/api/acs/cfg/door/${device.id}/${doorNo}`, {
      method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify(cfg),
    });
    loadDoor(doorNo);
  };

  const pollEvents = async () => {
    setPolling(true);
    const res = await apiFetch(`${API}/api/acs/cfg/poll-events/${device.id}?hours_back=1`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}` }
    });
    if (res.ok) setPollRes(await res.json());
    setPolling(false);
  };

  const loadInterlock = async () => {
    const res = await apiFetch(`${API}/api/acs/cfg/interlock/${device.id}`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (res.ok) { const d = await res.json(); setInterlock(d); setIntEnabled(d.enabled==='true'); setIntGroups((d.groups||[]).map(g=>g.join(',')).join('\n')); }
  };

  const saveInterlock = async () => {
    const groups = intGroups.split('\n').map(l=>l.split(',').map(Number).filter(Boolean)).filter(g=>g.length>1);
    await apiFetch(`${API}/api/acs/cfg/interlock/${device.id}`, {
      method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({ enabled: intEnabled, groups }),
    });
    setIntEdit(false); loadInterlock();
  };

  const syncFace = async (personId) => {
    const res = await apiFetch(`${API}/api/acs/cfg/face-sync/${device.id}/${personId}`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}` }
    });
    const d = await res.json();
    showNotice(d.ok ? `Face synced for person ${personId}` : `Sync failed: ${d.message}`, d.ok);
  };

  const INPUT = { padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',fontSize:12,
                  background:'var(--bg)',color:'var(--text)',width:'80px' };

  return (
    <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden' }}>
      {notice && (
        <div style={{ padding:'8px 16px',fontSize:12,fontWeight:500,
                      color: notice.ok ? '#065f46' : '#991b1b',
                      background: notice.ok ? '#dcfce7' : '#fee2e2' }}>
          {notice.msg}
        </div>
      )}
      <div onClick={handleExpand}
           style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'14px 16px',cursor:'pointer' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <Cpu size={18} style={{ color:'var(--primary)' }}/>
          <div>
            <strong style={{ fontSize:14,fontWeight:600 }}>{device.name}</strong>
            <div style={{ fontSize:12,color:'var(--muted)' }}>{device.ip_address}:{device.http_port||80} · {device.door_count} door(s)</div>
          </div>
          {devInfo?.model && <span style={{ fontSize:11,background:'#dbeafe',color:'#1e40af',borderRadius:6,padding:'2px 8px' }}>{devInfo.model}</span>}
        </div>
        {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid var(--border-soft)',padding:'16px',display:'flex',flexDirection:'column',gap:16 }}>

          {/* Device info */}
          {devInfo && (
            <div style={{ background:'var(--bg)',borderRadius:8,padding:'12px',display:'flex',gap:24,flexWrap:'wrap',fontSize:12 }}>
              {[['Model',devInfo.model],['Serial',devInfo.serial_number],['Firmware',devInfo.firmware],['Type',devInfo.device_type]].map(([l,v])=>v&&(
                <div key={l}><span style={{ color:'var(--muted)' }}>{l}: </span><strong>{v}</strong></div>
              ))}
            </div>
          )}

          {/* Door configs */}
          {Array.from({ length: device.door_count||1 },(_,i)=>i+1).map(n => {
            const cfg = doorConfs[n];
            return (
              <div key={n} style={{ background:'var(--bg)',borderRadius:8,padding:'12px' }}>
                <div style={{ fontWeight:600,fontSize:13,marginBottom:8 }}>Door {n}</div>
                {cfg?.ok ? (
                  <div style={{ display:'flex',gap:16,flexWrap:'wrap',alignItems:'center' }}>
                    {[
                      ['Name',     'door_name',          'text', cfg.door_name||''],
                      ['Open Duration (s)','open_duration','number', cfg.open_duration||''],
                      ['Alarm Timeout (s)','open_alarm_timeout','number', cfg.open_alarm_timeout||''],
                    ].map(([l,k,t,v])=>(
                      <label key={k} style={{ fontSize:11,color:'var(--muted)',display:'flex',flexDirection:'column',gap:3 }}>
                        {l}
                        <input type={t} defaultValue={v} style={INPUT}
                               id={`door_${n}_${k}`} />
                      </label>
                    ))}
                    {isAdmin && (
                      <button onClick={() => {
                        const d = {};
                        ['door_name','open_duration','open_alarm_timeout'].forEach(k => {
                          const el = document.getElementById(`door_${n}_${k}`);
                          if (el?.value) d[k] = el.value;
                        });
                        saveDoor(n, d);
                      }} style={{ padding:'6px 12px',borderRadius:7,border:'none',
                                  background:'var(--primary)',color:'#fff',fontSize:12,cursor:'pointer',alignSelf:'flex-end' }}>
                        Save
                      </button>
                    )}
                  </div>
                ) : <div style={{ fontSize:12,color:'var(--muted)' }}>Loading…</div>}
              </div>
            );
          })}

          {/* Event polling */}
          <div style={{ background:'var(--bg)',borderRadius:8,padding:'12px' }}>
            <div style={{ fontWeight:600,fontSize:13,marginBottom:8 }}>Event Polling</div>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <button onClick={pollEvents} disabled={polling}
                      style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:7,
                               border:'none',background:'#dbeafe',color:'#1e40af',fontSize:12,fontWeight:600,cursor:'pointer' }}>
                <Play size={12} className={polling?'spin':''}/> {polling?'Polling…':'Pull Events (last 1h)'}
              </button>
              {pollRes && (
                <span style={{ fontSize:12,color:'var(--success)' }}>
                  ✓ {pollRes.new_events} new events stored (of {pollRes.total_from_device} from device)
                </span>
              )}
            </div>
          </div>

          {/* Face sync */}
          {isAdmin && persons.length > 0 && (
            <div style={{ background:'var(--bg)',borderRadius:8,padding:'12px' }}>
              <div style={{ fontWeight:600,fontSize:13,marginBottom:8,display:'flex',alignItems:'center',gap:8 }}>
                <Upload size={13}/> Sync Person Face to Device
              </div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                {persons.slice(0,20).map(p => (
                  <button key={p.id} onClick={()=>syncFace(p.id)}
                          style={{ padding:'5px 12px',borderRadius:7,border:'1px solid var(--border)',
                                   background:'transparent',fontSize:12,cursor:'pointer',display:'flex',
                                   alignItems:'center',gap:5 }}>
                    <Upload size={11}/> {p.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multi-door interlock */}
          <div style={{ background:'var(--bg)',borderRadius:8,padding:'12px' }}>
            <div style={{ fontWeight:600,fontSize:13,marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <span style={{ display:'flex',alignItems:'center',gap:8 }}><Link size={13}/> Multi-door Interlock</span>
              <button onClick={()=>{ loadInterlock(); setIntEdit(v=>!v); }}
                      style={{ fontSize:11,color:'var(--primary)',background:'none',border:'none',cursor:'pointer' }}>
                {intEdit?'Cancel':'Configure'}
              </button>
            </div>
            {intEdit && (
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                <label style={{ fontSize:12,display:'flex',alignItems:'center',gap:8 }}>
                  <input type="checkbox" checked={intEnabled} onChange={e=>setIntEnabled(e.target.checked)}/> Enabled
                </label>
                <label style={{ fontSize:12,color:'var(--muted)',display:'flex',flexDirection:'column',gap:4 }}>
                  Door groups (one group per line, comma-separated door numbers, e.g. "1,2")
                  <textarea value={intGroups} onChange={e=>setIntGroups(e.target.value)} rows={3}
                            style={{ padding:'8px',borderRadius:7,border:'1px solid var(--border)',
                                     fontSize:12,background:'var(--bg)',resize:'vertical' }}/>
                </label>
                <button onClick={saveInterlock}
                        style={{ alignSelf:'flex-start',padding:'6px 14px',borderRadius:7,border:'none',
                                 background:'var(--primary)',color:'#fff',fontSize:12,cursor:'pointer' }}>
                  Save Interlock
                </button>
                {interlock?.groups && (
                  <div style={{ fontSize:11,color:'var(--muted)' }}>
                    Current groups: {(interlock.groups||[]).map((g,i)=>`Group ${i+1}: doors [${g.join(', ')}]`).join(' | ')||'none'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoorConfig({ token, isAdmin }) {
  const [devices, setDevices] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expFrom, setExpFrom] = useState(new Date().toLocaleDateString('en-CA'));
  const [expTo,   setExpTo]   = useState(new Date().toLocaleDateString('en-CA'));
  const [expFmt,  setExpFmt]  = useState('excel');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, pRes] = await Promise.all([
        apiFetch(`${API}/api/acs`,      { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/persons`,  { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (dRes.ok) setDevices(await dRes.json());
      if (pRes.ok) setPersons(await pRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const exportReport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch(
        `${API}/api/acs/cfg/reports/export?date_from=${expFrom}&date_to=${expTo}&fmt=${expFmt}`,
        { headers:{ Authorization:`Bearer ${token}` } }
      );
      if (!res.ok) { showNotice('Export failed', false); return; }
      const blob = await res.blob();
      const cd   = res.headers.get('content-disposition') || '';
      const name = (cd.match(/filename="?([^";]+)"?/i)||[])[1] || `access_report.${expFmt === 'excel' ? 'xlsx' : 'pdf'}`;
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return (
    <div style={{ padding:24,display:'flex',flexDirection:'column',gap:20 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:18,fontWeight:700,color:'var(--text)' }}>
          <Settings size={20}/> Door Config &amp; Tools
        </div>
        <button onClick={load} disabled={loading} style={{ display:'inline-flex',alignItems:'center',gap:5,
                padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',
                background:'transparent',fontSize:13,color:'var(--muted)',cursor:'pointer' }}>
          <RefreshCw size={13} className={loading?'spin':''}/> Refresh
        </button>
      </div>

      {/* Reports export */}
      <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:18 }}>
        <div style={{ fontWeight:600,fontSize:14,marginBottom:12,display:'flex',alignItems:'center',gap:8 }}>
          <Download size={16}/> Access Reports Export
        </div>
        <div style={{ display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end' }}>
          {[['From','expFrom',expFrom,setExpFrom],['To','expTo',expTo,setExpTo]].map(([l,,v,sv])=>(
            <label key={l} style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              {l} <input type="date" value={v} onChange={e=>sv(e.target.value)}
                   style={{ padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',fontSize:13,background:'var(--bg)' }} />
            </label>
          ))}
          <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
            Format
            <select value={expFmt} onChange={e=>setExpFmt(e.target.value)}
                    style={{ padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',fontSize:13,background:'var(--bg)' }}>
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <button onClick={exportReport} disabled={exporting}
                  style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'8px 18px',borderRadius:8,
                           border:'none',background:'var(--primary)',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer' }}>
            <Download size={14}/>{exporting?'Exporting…':'Export'}
          </button>
        </div>
      </div>

      {/* Devices */}
      {loading ? <div style={{ textAlign:'center',padding:40,color:'var(--muted)' }}>Loading…</div>
               : devices.length === 0 ? <div style={{ textAlign:'center',padding:40,color:'var(--muted)' }}>No ACS devices.</div>
               : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {devices.map(d=>(
            <DeviceSection key={d.id} device={d} token={token} isAdmin={isAdmin} persons={persons}/>
          ))}
        </div>
      )}
    </div>
  );
}
