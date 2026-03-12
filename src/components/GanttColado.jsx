import { useState, useMemo } from 'react'
import { RESISTENCIAS } from '../constants'
import { supabase } from '../supabase'

const CATS = ['beams', 'columns', 'slabs', 'footings']
const CAT_LABELS = { beams: 'Vigas', columns: 'Columnas', slabs: 'Losas', footings: 'Fundaciones' }

const fechaLocal = (fechaStr) => {
  const offset = new Date().getTimezoneOffset()
  const sign = offset > 0 ? '-' : '+'
  const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const m = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${fechaStr}T00:00:00${sign}${h}:${m}`
}

export default function GanttColado({ elementFloor, concreteIds, categoryIds, onSelectionChange, ifcStats, globalIdMap }) {
  const [selected,  setSelected]  = useState({})
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ resistencia: 'H-25', fecha: '', hora: '07:00', obs: '' })

  const matrix = useMemo(() => {
    const concreteSet = new Set(concreteIds)
    const pisos = {}
    for (const [id, floor] of Object.entries(elementFloor)) {
      const numId = parseInt(id)
      if (!concreteSet.has(numId)) continue
      const key = floor.name
      if (!pisos[key]) pisos[key] = { name: floor.name, elevation: floor.elevation, cats: {} }
      for (const cat of CATS) {
        if (categoryIds[cat]?.includes(numId)) {
          if (!pisos[key].cats[cat]) pisos[key].cats[cat] = []
          pisos[key].cats[cat].push(numId)
        }
      }
    }
    return Object.values(pisos).sort((a, b) => a.elevation - b.elevation)
  }, [elementFloor, concreteIds, categoryIds])

  const toggleCell = (pisoName, cat, ids) => {
    const key = `${pisoName}-${cat}`
    const next = { ...selected, [key]: !selected[key] }
    setSelected(next)
    const allSelected = []
    for (const [k, v] of Object.entries(next)) {
      if (!v) continue
      const [piso, c] = k.split('-')
      const pRow = matrix.find(p => p.name === piso)
      if (pRow?.cats[c]) allSelected.push(...pRow.cats[c])
    }
    onSelectionChange?.(allSelected)
  }

  const toggleRow = (piso) => {
    const anySelected = CATS.some(c => piso.cats[c]?.length && selected[`${piso.name}-${c}`])
    const next = { ...selected }
    for (const c of CATS) {
      if (piso.cats[c]?.length) next[`${piso.name}-${c}`] = !anySelected
    }
    setSelected(next)
    const allSelected = []
    for (const [k, v] of Object.entries(next)) {
      if (!v) continue
      const [pisoN, c] = k.split('-')
      const pRow = matrix.find(p => p.name === pisoN)
      if (pRow?.cats[c]) allSelected.push(...pRow.cats[c])
    }
    onSelectionChange?.(allSelected)
  }

  const selectedCount = useMemo(() => {
    let total = 0
    for (const [k, v] of Object.entries(selected)) {
      if (!v) continue
      const [pisoN, c] = k.split('-')
      const pRow = matrix.find(p => p.name === pisoN)
      total += pRow?.cats[c]?.length ?? 0
    }
    return total
  }, [selected, matrix])

const handleSubmit = async () => {
  console.log('form completo:', form)
  try {
    if (!form.fecha) return alert('Seleccioná una fecha de colado')

    const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().split('T')[0]
    const maxFecha = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    if (form.fecha < hoy) return alert('La fecha de colado no puede ser anterior a hoy')
    if (form.fecha > maxFecha) return alert('No se aceptan pedidos con más de 30 días de anticipación')

console.log('globalIdMap keys:', Object.keys(globalIdMap ?? {}).length)
   const elementosSeleccionados = []
for (const [k, v] of Object.entries(selected)) {
  if (!v) continue
  const [pisoN, cat] = k.split('-')
  const pRow = matrix.find(p => p.name === pisoN)
  if (pRow?.cats[cat]) {
    elementosSeleccionados.push({ 
      piso: pisoN, 
      categoria: CAT_LABELS[cat], 
      ids: pRow.cats[cat],
      globalIds: pRow.cats[cat].map(id => globalIdMap?.[id]).filter(Boolean)
    })
  }
}
    console.log('ifcStats al publicar:', ifcStats)
    console.log('selectedCount:', selectedCount)

    const { error } = await supabase.from('pedidos').insert({
      obra_nombre: 'Obra Av. Colón 1200',
      fecha_colado: form.fecha,
      hora: form.hora,
      resistencia: form.resistencia,
      m3_estimado: ifcStats?.concrete > 0 ? ifcStats.concrete : selectedCount * 2.5,
      obs: form.obs || null,
      estado: 'publicado',
      elementos_ifc: elementosSeleccionados
    })
    if (error) throw error
    setShowForm(false)
    setSelected({})
    alert('✅ Pedido publicado en el marketplace')
  } catch (e) {
    console.error('Error completo:', e)
    alert('Error al publicar: ' + e.message)
  }
}
  return (
    <div style={{ padding: '0.75rem', fontSize: '0.78rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--text)' }}>Planificación de Colado</div>
        {selectedCount > 0 && (
          <button onClick={() => setShowForm(true)} style={{
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.75rem'
          }}>
            🧱 Generar pedido ({selectedCount})
          </button>
        )}
      </div>

      {/* Tabla Gantt */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Nivel</th>
              {CATS.map(c => <th key={c} style={thStyle}>{CAT_LABELS[c]}</th>)}
              <th style={thStyle}>Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(piso => {
              const rowTotal = CATS.reduce((s, c) => s + (piso.cats[c]?.length ?? 0), 0)
              const anySelected = CATS.some(c => piso.cats[c]?.length && selected[`${piso.name}-${c}`])
              return (
                <tr key={piso.name} style={{ background: anySelected ? '#f0fdf4' : 'white' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleRow(piso)}>
                    <input type="checkbox" checked={anySelected} onChange={() => toggleRow(piso)} style={{ marginRight: 6 }} />
                    {piso.name}
                    <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>{piso.elevation.toFixed(1)}m</span>
                  </td>
                  {CATS.map(c => {
                    const ids = piso.cats[c] ?? []
                    const key = `${piso.name}-${c}`
                    return (
                      <td key={c} style={{ ...tdStyle, textAlign: 'center', cursor: ids.length ? 'pointer' : 'default' }}
                        onClick={() => ids.length && toggleCell(piso.name, c, ids)}>
                        {ids.length ? (
                          <span style={{
                            background: selected[key] ? 'var(--primary)' : '#e2e8f0',
                            color: selected[key] ? 'white' : 'var(--text)',
                            borderRadius: 10, padding: '2px 8px', fontWeight: 600
                          }}>{ids.length}</span>
                        ) : <span style={{ color: '#e2e8f0' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{rowTotal}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal pedido */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 16 }}>🧱 Pedido de Hormigón</div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Resistencia</label>
              <select value={form.resistencia} onChange={e => setForm(f => ({ ...f, resistencia: e.target.value }))} style={inputStyle}>
                {RESISTENCIAS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Fecha de colado</label>
              <input
                type="date"
                value={form.fecha}
                min={new Date().toLocaleDateString('en-CA')}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Hora de inicio</label>
              <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Observaciones</label>
              <textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                style={{ ...inputStyle, height: 64, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, padding: '0.5rem', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer', background: 'white'
              }}>Cancelar</button>
              <button onClick={handleSubmit} style={{
                flex: 1, padding: '0.5rem', border: 'none',
                borderRadius: 8, cursor: 'pointer', background: 'var(--primary)',
                color: 'white', fontWeight: 600
              }}>Confirmar pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle = { padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid var(--border)', color: 'var(--text-gray)', whiteSpace: 'nowrap' }
const tdStyle = { padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--border)' }
const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--text-gray)', marginBottom: 4 }
const inputStyle = { width: '100%', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }