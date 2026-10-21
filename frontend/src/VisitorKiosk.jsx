import React, { useEffect, useState } from 'react';
import { CheckCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { API } from './apiConfig';

const initial = {
  full_name:'', phone:'', company:'', host_person_id:'', visit_reason:'',
  id_type:'Passport', id_number:'', valid_from:'', valid_to:'', consent_accepted:false, website:'',
};

export default function VisitorKiosk() {
  const [form, setForm] = useState(initial);
  const [options, setOptions] = useState({ hosts:[], id_types:[] });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]:value }));

  useEffect(() => {
    fetch(`${API}/api/visitor-kiosk/options`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setOptions)
      .catch(() => setError('Unable to load visitor registration options.'));
  }, []);

  const submit = async event => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await fetch(`${API}/api/visitor-kiosk/reservations`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          ...form,
          host_person_id:form.host_person_id ? Number(form.host_person_id) : null,
          valid_from:form.valid_from ? `${form.valid_from}:00` : null,
          valid_to:form.valid_to ? `${form.valid_to}:00` : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Registration failed');
      setResult(data);
      setForm(initial);
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight:'100vh',background:'linear-gradient(135deg,#eff6ff,#f8fafc)',padding:24,display:'grid',placeItems:'center' }}>
      <section style={{ width:'min(760px,100%)',background:'#fff',borderRadius:22,padding:28,boxShadow:'0 24px 70px rgba(15,23,42,.12)' }}>
        <header style={{ display:'flex',alignItems:'center',gap:14,marginBottom:22 }}>
          <div style={{ width:46,height:46,borderRadius:14,background:'#dbeafe',color:'#1d4ed8',display:'grid',placeItems:'center' }}><UserPlus/></div>
          <div><h1 style={{ margin:0,fontSize:24 }}>Visitor Registration</h1><p style={{ margin:'4px 0 0',color:'#64748b' }}>Register your visit and wait for host approval.</p></div>
        </header>
        {result ? (
          <div style={{ textAlign:'center',padding:'42px 20px' }}>
            <CheckCircle size={56} color="#16a34a"/>
            <h2>Reservation submitted</h2>
            <p>Your reservation code</p>
            <strong style={{ display:'inline-block',fontSize:25,letterSpacing:2,padding:'12px 18px',background:'#f1f5f9',borderRadius:10 }}>{result.reservation_code}</strong>
            <p style={{ color:'#64748b' }}>Status: pending approval</p>
            <button className="save-btn" onClick={()=>setResult(null)}>Register another visitor</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14 }}>
            <input tabIndex="-1" autoComplete="off" aria-hidden="true" value={form.website} onChange={e=>set('website',e.target.value)} style={{ position:'absolute',left:'-10000px' }}/>
            <label>Full name *<input required value={form.full_name} onChange={e=>set('full_name',e.target.value)}/></label>
            <label>Phone<input value={form.phone} onChange={e=>set('phone',e.target.value)}/></label>
            <label>Company<input value={form.company} onChange={e=>set('company',e.target.value)}/></label>
            <label>Host<select value={form.host_person_id} onChange={e=>set('host_person_id',e.target.value)}><option value="">Select host</option>{options.hosts.map(host=><option key={host.id} value={host.id}>{host.name}</option>)}</select></label>
            <label>ID type<select value={form.id_type} onChange={e=>set('id_type',e.target.value)}>{options.id_types.map(type=><option key={type}>{type}</option>)}</select></label>
            <label>ID number<input value={form.id_number} onChange={e=>set('id_number',e.target.value)}/></label>
            <label>Visit starts<input required type="datetime-local" value={form.valid_from} onChange={e=>set('valid_from',e.target.value)}/></label>
            <label>Visit ends *<input required type="datetime-local" value={form.valid_to} onChange={e=>set('valid_to',e.target.value)}/></label>
            <label style={{ gridColumn:'1/-1' }}>Purpose<textarea value={form.visit_reason} onChange={e=>set('visit_reason',e.target.value)}/></label>
            <label style={{ gridColumn:'1/-1',display:'flex',flexDirection:'row',alignItems:'center',gap:9 }}>
              <input required type="checkbox" checked={form.consent_accepted} onChange={e=>set('consent_accepted',e.target.checked)}/>
              <ShieldCheck size={17}/> I consent to visitor data processing for access and security.
            </label>
            {error && <div style={{ gridColumn:'1/-1',padding:10,borderRadius:8,background:'#fee2e2',color:'#991b1b' }}>{error}</div>}
            <button className="save-btn" disabled={saving} style={{ gridColumn:'1/-1',padding:12 }}>{saving ? 'Submitting...' : 'Submit reservation'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
