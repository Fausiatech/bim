import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const ESTADO_CONF = {
  publicado:  { color: '#3b82f6', bg: '#dbeafe', label: 'Publicado',  icon: '📋' },
  adjudicado: { color: '#ef4444', bg: '#fee2e2', label: 'Adjudicado', icon: '🔴' },
  en_camino:  { color: '#f59e0b', bg: '#fef3c7', label: 'En camino',  icon: '🚚' },
  entregado:  { color: '#22c55e', bg: '#dcfce7', label: 'Entregado',  icon: '✅' },
}

const card = { background: 'white', borderRadius: 10, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }

export default function BIDashboard({ stats, pedidos }) {
  const list = pedidos ?? []

  // Avance por piso — agrupa por el campo piso de cada elemento_ifc
  const avancePorPiso = useMemo(() => {
    const map = {}
    for (const p of list) {
      for (const el of (p.elementos_ifc ?? [])) {
        const piso = el.piso ?? 'Sin piso'
        if (!map[piso]) map[piso] = { piso, total: 0, entregado: 0, en_camino: 0, adjudicado: 0 }
        const n = el.ids?.length ?? 0
        map[piso].total += n
        if (p.estado === 'entregado')  map[piso].entregado  += n
        if (p.estado === 'en_camino')  map[piso].en_camino  += n
        if (p.estado === 'adjudicado') map[piso].adjudicado += n
      }
    }
    return Object.values(map).sort((a, b) => a.piso.localeCompare(b.piso))
  }, [list])

  // Pie — cantidad de pedidos por estado
  const pieData = Object.entries(ESTADO_CONF)
    .map(([id, c]) => ({ name: c.label, value: list.filter(p => p.estado === id).length, color: c.color }))
    .filter(d => d.value > 0)

  const riesgoColor = stats?.riesgo === 'Alto' ? '#ef4444' : '#22c55e'
  const riesgoLabel = stats?.riesgo === 'Alto' ? '⚠️ Alto' : '✅ Bajo'

  return (
    <div style={{ padding: 12, overflowY: 'auto', background: '#f0f4f8', height: '100%' }}>

      {/* KPIs — 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Avance',         val: `${stats?.avance ?? 0}%`,         color: '#22c55e', bar: true },
          { label: 'Elementos',      val: stats?.total ?? 0,                 color: '#3b82f6' },
          { label: 'Vol. Hormigón',  val: `${stats?.vol_total ?? 0} m³`,     color: '#8b5cf6' },
          { label: 'Vol. Entregado', val: `${stats?.vol_entregado ?? 0} m³`, color: '#22c55e' },
          { label: 'Riesgo',         val: riesgoLabel,                       color: riesgoColor },
        ].map((k, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: k.label === 'Riesgo' ? 13 : 18, fontWeight: 800, color: k.color, margin: '3px 0 2px' }}>{k.val}</div>
            {k.bar && (
              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 4, marginTop: 4 }}>
                <div style={{ width: `${Math.min(stats?.avance ?? 0, 100)}%`, background: k.color, height: 4, borderRadius: 4 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contadores por estado — 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {Object.entries(ESTADO_CONF).map(([id, c]) => (
          <div key={id} style={{ ...card, borderLeft: `4px solid ${c.color}`, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>
              {list.filter(p => p.estado === id).length}
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos — apilados verticalmente para aprovechar el ancho */}
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8, color: '#1e293b' }}>Avance por Piso</div>
        {avancePorPiso.length > 0 ? (
          <ResponsiveContainer width="100%" height={avancePorPiso.length * 28 + 20}>
            <BarChart data={avancePorPiso} layout="vertical" barSize={8}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="piso" tick={{ fontSize: 10 }} width={65} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="total"     fill="#e2e8f0" radius={2} name="Total" />
              <Bar dataKey="entregado" fill="#22c55e" radius={2} name="Entregado" />
              <Bar dataKey="en_camino" fill="#f59e0b" radius={2} name="En camino" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: '20px 0' }}>
            Sin pedidos con datos de piso
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: '#1e293b' }}>Estados de pedidos</div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="45%"
                outerRadius={55}
                innerRadius={25}
                dataKey="value"
                label={({ name, value }) => `${value}`}
                labelLine={false}
              >
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Legend
                iconSize={8}
                formatter={v => <span style={{ fontSize: 10 }}>{v}</span>}
              />
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: '20px 0' }}>Sin datos</div>
        )}
      </div>

      {/* Pedidos recientes */}
      {list.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8, color: '#1e293b' }}>Pedidos recientes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {list.slice(0, 5).map((p, i) => {
              const c = ESTADO_CONF[p.estado] ?? ESTADO_CONF.publicado
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#f8fafc', borderRadius: 7 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{p.fecha_colado}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{p.m3_estimado?.toFixed(1)} m³</div>
                  </div>
                  <span style={{ background: c.bg, color: c.color, borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>
                    {c.icon} {c.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}