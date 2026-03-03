import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const ESTADOS = [
  { id: 'pendiente',    label: 'Pendiente',    color: '#94a3b8', bg: '#f1f5f9', icon: '⏳' },
  { id: 'encofrado',    label: 'Encofrado',    color: '#f59e0b', bg: '#fef3c7', icon: '🪵' },
  { id: 'hormigonado',  label: 'Hormigonado',  color: '#3b82f6', bg: '#dbeafe', icon: '🏗️' },
  { id: 'desencofrado', label: 'Desencofrado', color: '#22c55e', bg: '#dcfce7', icon: '✅' },
  { id: 'observacion',  label: 'Observación',  color: '#ef4444', bg: '#fee2e2', icon: '⚠️' },
]

const COSTO_HOR = 280

const estObj = id => ESTADOS.find(e => e.id === id) || ESTADOS[0]

export default function SpeckleDashboard({ elementos, stats, lastSync, projectName, onEstadoChange }) {
  const [tab, setTab]           = useState('kpis')
  const [filtroNivel, setFiltroNivel]   = useState('todos')
  const [filtroMat, setFiltroMat]       = useState('todos')
  const [filtroEst, setFiltroEst]       = useState('todos')
  const [seleccionados, setSeleccionados] = useState([])
  const [estadoLote, setEstadoLote]     = useState('')
  const [modal, setModal]               = useState(null)

  const niveles = stats.niveles || []

  const filtrados = elementos.filter(e =>
    (filtroNivel === 'todos' || e.nivel === filtroNivel) &&
    (filtroMat   === 'todos' || e.material === filtroMat) &&
    (filtroEst   === 'todos' || e.estado === filtroEst)
  )

  const byNivel = niveles.map(n => ({
    nivel: n.replace('Top of ', '').substring(0, 12),
    total: elementos.filter(e => e.nivel === n).length,
    ejec:  elementos.filter(e => e.nivel === n && e.estado === 'desencofrado').length,
    vol:   +elementos.filter(e => e.nivel === n).reduce((s, e) => s + e.vol_m3, 0).toFixed(1),
  }))

  const pieData = ESTADOS.map(e => ({
    name: e.label,
    value: elementos.filter(el => el.estado === e.id).length,
    color: e.color,
  })).filter(d => d.value > 0)

  const riesgo = stats.observaciones > 2 ? 'alto'
    : elementos.filter(e => e.estado === 'encofrado').length > 5 ? 'medio' : 'bajo'
  const riesgoConf = {
    alto:  { color: '#ef4444', label: '⚠️ Riesgo Alto' },
    medio: { color: '#f59e0b', label: '🟡 Riesgo Medio' },
    bajo:  { color: '#22c55e', label: '✅ Riesgo Bajo' },
  }

  const aplicarLote = () => {
    if (!estadoLote || !seleccionados.length) return
    seleccionados.forEach(id => onEstadoChange(id, estadoLote))
    setSeleccionados([])
    setEstadoLote('')
  }

  const toggleSel = id => setSeleccionados(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const s = { // estilos inline reutilizables
    card: { background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
    tab:  (active) => ({ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: active ? '#3b82f6' : '#f1f5f9', color: active ? 'white' : '#64748b' }),
    badge:(color, bg) => ({ padding: '2px 8px', borderRadius: 10, background: bg, color, fontSize: 11, fontWeight: 600 }),
  }

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{projectName || 'Speckle Dashboard'}</div>
          {lastSync && <div style={{ fontSize: 11, color: '#94a3b8' }}>⚡ Sync {lastSync}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['kpis', 'elementos', 'costos'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={s.tab(tab === t)}>
              {t === 'kpis' ? '📊 KPIs' : t === 'elementos' ? '🏗 Elementos' : '💰 Costos'}
            </button>
          ))}
        </div>
      </div>

      {/* TAB KPIs */}
      {tab === 'kpis' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Avance',        val: `${stats.avance}%`,                          color: '#22c55e', bar: true },
            { label: 'Elementos',     val: stats.total,                                  color: '#3b82f6' },
            { label: 'Vol. Hormigón', val: `${stats.vol_total} m³`,                      color: '#8b5cf6' },
            { label: 'Observaciones', val: stats.observaciones,                          color: stats.observaciones > 0 ? '#ef4444' : '#22c55e' },
            { label: 'Riesgo',        val: riesgoConf[riesgo].label,                     color: riesgoConf[riesgo].color },
          ].map((k, i) => (
            <div key={i} style={{ ...s.card, borderTop: `3px solid ${k.color}` }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, margin: '4px 0 2px' }}>{k.val}</div>
              {k.bar && <div style={{ background: '#f1f5f9', borderRadius: 4, height: 5, marginTop: 6 }}>
                <div style={{ width: `${stats.avance}%`, background: k.color, height: 5, borderRadius: 4 }} />
              </div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={s.card}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12 }}>Avance por Nivel</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byNivel} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nivel" tick={{ fontSize: 10 }} width={75} />
                <Tooltip formatter={(v, n) => [v, n === 'total' ? 'Total' : 'Ejecutado']} />
                <Bar dataKey="total" fill="#e2e8f0" radius={3} />
                <Bar dataKey="ejec"  fill="#22c55e" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={s.card}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12 }}>Estados</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={60} dataKey="value"
                  label={({ percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Legend formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12 }}>Volumen m³ por Nivel</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={byNivel}>
              <XAxis dataKey="nivel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => [`${v} m³`, 'Volumen']} />
              <Bar dataKey="vol" fill="#3b82f6" radius={3} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>)}

      {/* TAB ELEMENTOS */}
      {tab === 'elementos' && (<>
        <div style={{ ...s.card, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {[
            { val: filtroNivel, set: setFiltroNivel, opts: [['todos','Todos los niveles'], ...niveles.map(n => [n, n.replace('Top of ','')])] },
            { val: filtroMat,   set: setFiltroMat,   opts: [['todos','Materiales'],['Hormigón','Hormigón'],['Acero','Acero']] },
            { val: filtroEst,   set: setFiltroEst,   opts: [['todos','Estados'], ...ESTADOS.map(e => [e.id, `${e.icon} ${e.label}`])] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{filtrados.length} elementos</span>
          {seleccionados.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>{seleccionados.length} sel.</span>
              <select value={estadoLote} onChange={e => setEstadoLote(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #3b82f6', fontSize: 11 }}>
                <option value=''>Cambiar estado...</option>
                {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.icon} {e.label}</option>)}
              </select>
              <button onClick={aplicarLote} style={{ padding: '5px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Aplicar</button>
              <button onClick={() => setSeleccionados([])} style={{ padding: '5px 8px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          )}
        </div>

        <div style={{ ...s.card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', width: 28 }}>
                  <input type="checkbox"
                    onChange={e => setSeleccionados(e.target.checked ? filtrados.map(el => el.id) : [])}
                    checked={seleccionados.length === filtrados.length && filtrados.length > 0} />
                </th>
                {['Categoría','Tipo','Nivel','Sección','Material','Vol m³','Estado',''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((el, i) => {
                const est = estObj(el.estado)
                return (
                  <tr key={el.id} style={{ borderTop: '1px solid #f1f5f9', background: seleccionados.includes(el.id) ? '#eff6ff' : i%2===0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={seleccionados.includes(el.id)} onChange={() => toggleSel(el.id)} /></td>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{el.categoria}</td>
                    <td style={{ padding: '7px 10px', color: '#64748b' }}>{el.tipo}</td>
                    <td style={{ padding: '7px 10px', color: '#64748b', fontSize: 10 }}>{el.nivel.replace('Top of ','')}</td>
                    <td style={{ padding: '7px 10px' }}>{el.dim}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={s.badge(el.isHormigon ? '#3b82f6' : '#db2777', el.isHormigon ? '#dbeafe' : '#fce7f3')}>{el.material}</span>
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{el.vol_m3}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <select value={el.estado} onChange={e => onEstadoChange(el.id, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: 5, border: `1px solid ${est.color}`, background: est.bg, color: est.color, fontWeight: 600, fontSize: 10, cursor: 'pointer' }}>
                        {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.icon} {e.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <button onClick={() => setModal(el)} style={{ padding: '3px 7px', background: '#f1f5f9', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10 }}>Ver</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {/* TAB COSTOS */}
      {tab === 'costos' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Presupuesto Total', val: `USD ${stats.costo_total.toLocaleString()}`, color: '#3b82f6' },
            { label: 'Ejecutado', val: `USD ${elementos.filter(e=>e.estado==='desencofrado').reduce((s,e)=>s+e.costo_est,0).toLocaleString()}`, color: '#22c55e' },
            { label: 'Pendiente', val: `USD ${elementos.filter(e=>e.estado!=='desencofrado').reduce((s,e)=>s+e.costo_est,0).toLocaleString()}`, color: '#f59e0b' },
          ].map((k,i) => (
            <div key={i} style={{ ...s.card, borderLeft: `4px solid ${k.color}` }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, margin: '6px 0' }}>{k.val}</div>
            </div>
          ))}
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Costo por Nivel</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12 }}>Vol. hormigón × USD {COSTO_HOR}/m³</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byNivel.map(n => ({ ...n, costo: +(n.vol * COSTO_HOR).toFixed(0) }))}>
              <XAxis dataKey="nivel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [`USD ${v.toLocaleString()}`, 'Costo']} />
              <Bar dataKey="costo" fill="#8b5cf6" radius={3} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>)}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 22, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{modal.categoria} — {modal.tipo}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>ID Revit: {modal.id}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>✕</button>
            </div>
            {[['Nivel', modal.nivel],['Sección', modal.dim],['Material', modal.material],['Largo', `${modal.largo_m} m`],['Volumen', `${modal.vol_m3} m³`],['Costo est.', `USD ${modal.costo_est.toLocaleString()}`],['Ubicación', modal.loc]].map(([k,v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>Estado</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ESTADOS.map(e => (
                  <button key={e.id} onClick={() => { onEstadoChange(modal.id, e.id); setModal({...modal, estado: e.id}) }}
                    style={{ padding: '5px 10px', borderRadius: 7, border: `2px solid ${modal.estado===e.id ? e.color : '#e2e8f0'}`, background: modal.estado===e.id ? e.bg : 'white', color: modal.estado===e.id ? e.color : '#64748b', fontSize: 11, fontWeight: modal.estado===e.id ? 700 : 400, cursor: 'pointer' }}>
                    {e.icon} {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}