import { apiFetch } from './apiClient';
// AcsAnalyticsDashboard.jsx — ACS Analytics: hourly heatmap, per-door, top persons, denial breakdown

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart2, RefreshCw, TrendingUp, Users, DoorOpen, AlertTriangle, Database, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { API } from './apiConfig';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];

function StatCard({ label, value, sub, color = '#3b82f6', Icon }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ background: color + '20', borderRadius: 10, padding: 10 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{value ?? '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function AcsAnalyticsDashboard({ token }) {
  const [period,   setPeriod]   = useState(24);
  const [summary,  setSummary]  = useState(null);
  const [hourly,   setHourly]   = useState([]);
  const [byDoor,   setByDoor]   = useState([]);
  const [topPersons, setTopPersons] = useState([]);
  const [trend,    setTrend]    = useState([]);
  const [denials,  setDenials]  = useState([]);
  const [offlineCache, setOfflineCache] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const hdrs = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, hrRes, doorRes, topRes, trendRes, denRes, offRes] = await Promise.all([
        apiFetch(`${API}/api/acs/analytics/summary?hours=${period}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/hourly?days=${Math.ceil(period/24)||1}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/by-door?hours=${period}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/top-persons?hours=${period}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/daily-trend?days=${Math.min(Math.ceil(period/24),30)}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/denials?hours=${period}`, { headers: hdrs }),
        apiFetch(`${API}/api/acs/analytics/offline-cache`, { headers: hdrs }),
      ]);
      if (sumRes.ok)   setSummary(await sumRes.json());
      if (hrRes.ok)    setHourly((await hrRes.json()).hourly || []);
      if (doorRes.ok)  setByDoor((await doorRes.json()).doors || []);
      if (topRes.ok)   setTopPersons((await topRes.json()).persons || []);
      if (trendRes.ok) setTrend((await trendRes.json()).trend || []);
      if (denRes.ok)   setDenials((await denRes.json()).by_reason || []);
      if (offRes.ok)   setOfflineCache(await offRes.json());
    } finally {
      setLoading(false);
    }
  }, [token, period]);

  useEffect(() => { load(); }, [load]);

  const exportEvents = async (fmt) => {
    const res = await apiFetch(`${API}/api/acs/analytics/export?hours=${period}&format=${fmt}`, { headers: hdrs });
    if (!res.ok) return;
    const blob = await res.blob();
    const ext  = fmt === 'excel' ? 'xlsx' : 'csv';
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `acs_events_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncOffline = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await apiFetch(`${API}/api/acs/analytics/offline-sync`, {
        method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      setSyncResult(res.ok ? `Synced ${d.results?.length || 0} device(s)` : 'Sync failed');
      load();
    } finally { setSyncing(false); }
  };

  const personTypeColor = (t) => {
    if (t === 'employee') return '#3b82f6';
    if (t === 'vip')      return '#f59e0b';
    if (t === 'blacklist')return '#ef4444';
    return '#94a3b8';
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={20} /> ACS Analytics
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
                           background: 'var(--bg)', fontSize: 12 }}>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={168}>Last 7 days</option>
            <option value={720}>Last 30 days</option>
          </select>
          <button className="btn-ghost-sm" onClick={load} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn-ghost-sm" onClick={() => exportEvents('csv')} title="Export CSV">
            ⬇ CSV
          </button>
          <button className="btn-ghost-sm" onClick={() => exportEvents('excel')} title="Export Excel">
            ⬇ Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading analytics…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
            <StatCard label="Total Events" value={summary?.total_events} Icon={BarChart2} color="#3b82f6" />
            <StatCard label="Access Granted" value={summary?.granted} Icon={CheckCircle} color="#10b981" />
            <StatCard label="Access Denied" value={summary?.denied} Icon={AlertTriangle} color="#ef4444"
                      sub={`${summary?.denial_rate_pct ?? 0}% denial rate`} />
            <StatCard label="Unique Persons" value={summary?.unique_persons} Icon={Users} color="#8b5cf6" />
          </div>

          {/* Hourly heatmap + daily trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Hourly heatmap */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={16} /> Hourly Access Heatmap
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourly} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }}
                         tickFormatter={h => `${String(h).padStart(2,'0')}:00`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [v, 'Access events']}
                           labelFormatter={h => `${String(h).padStart(2,'0')}:00`} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Daily trend */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={16} /> Daily Trend
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }}
                         tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="granted" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="denied"  stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-door + denial pie */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
            {/* Per-door table */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DoorOpen size={16} /> Door Statistics
              </h3>
              {byDoor.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No door data available.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Device</th>
                      <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Door</th>
                      <th style={{ textAlign:'right', padding:'4px 8px', color:'#10b981' }}>Granted</th>
                      <th style={{ textAlign:'right', padding:'4px 8px', color:'#ef4444' }}>Denied</th>
                      <th style={{ textAlign:'right', padding:'4px 8px', color:'var(--muted)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDoor.slice(0,10).map((d, i) => (
                      <tr key={`${d.device_id}-${d.door_no}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding:'5px 8px' }}>{d.device_name || `Device ${d.device_id}`}</td>
                        <td style={{ padding:'5px 8px' }}>Door {d.door_no}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', color:'#10b981', fontWeight:600 }}>{d.granted}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', color:'#ef4444', fontWeight:600 }}>{d.denied}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', color:'var(--muted)' }}>{d.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Denial pie chart */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} /> Denial Reasons
              </h3>
              {denials.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No denials in period.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={denials} dataKey="count" nameKey="reason" cx="50%" cy="50%"
                           outerRadius={60} label={({ reason, percent }) =>
                             `${reason?.replace(/_/g,' ')}: ${(percent*100).toFixed(0)}%`
                           } labelLine={false}>
                        {denials.map((d, i) => <Cell key={d.reason ?? i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                    {denials.map((d, i) => (
                      <span key={d.reason ?? i} style={{ fontSize:11, padding:'2px 6px', borderRadius:4,
                                            background: COLORS[i%COLORS.length]+'20',
                                            color: COLORS[i%COLORS.length] }}>
                        {d.reason?.replace(/_/g,' ')} ({d.count})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Top persons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={16} /> Top Persons by Access
              </h3>
              {topPersons.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No access data.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topPersons.slice(0, 10).map((p, i) => (
                    <div key={p.person_id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 20, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{i+1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.person_name || `Person #${p.person_id}`}
                        </div>
                        <div style={{ fontSize: 11, color: personTypeColor(p.person_type) }}>
                          {p.person_type || 'unknown'}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <div style={{
                          height: 8, borderRadius: 4, background: '#3b82f6',
                          width: Math.max(20, (p.access_count / (topPersons[0]?.access_count || 1)) * 100),
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', minWidth: 28, textAlign:'right' }}>
                          {p.access_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Offline cache status */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Database size={16} /> Offline Card Cache
                </h3>
                <button onClick={syncOffline} disabled={syncing}
                        style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)',
                                 background:'var(--bg)', fontSize:12, cursor:'pointer',
                                 display:'flex', alignItems:'center', gap:5 }}>
                  <RefreshCw size={12} className={syncing ? 'spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
              </div>
              {syncResult && (
                <div style={{ marginBottom:12, padding:'6px 10px', borderRadius:6,
                              background:'#f0fdf4', color:'#15803d', fontSize:12 }}>
                  {syncResult}
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>Cached cards</span>
                  <strong>{offlineCache?.count ?? '—'}</strong>
                </div>
                <p style={{ fontSize:12, color:'var(--muted)', margin:0 }}>
                  The offline cache stores all active card assignments locally.
                  When an ACS device is unreachable, access decisions fall back to this cache.
                  Sync regularly to keep it up-to-date.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
