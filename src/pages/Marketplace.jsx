import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const RESISTENCIAS_OPTS = ['H-17', 'H-21', 'H-25', 'H-30', 'H-35', 'H-40']
const MAX_PEDIDOS = 30

// ── Proveedores simulados para testing ──────────────────────
const PROVEEDORES_TEST = [
  { id: null,                                    nombre: '— Seleccioná tu empresa —' },
  { id: '0ad4fcdc-87c3-4141-afd6-03e509abc3ca', nombre: 'Hormigonera Norte Cba' },
  { id: '5ab1cf85-4baa-4802-b7ef-8d385994bece', nombre: 'Hormigonera Sur' },
  { id: 'b0f7b443-ab73-4395-a649-8766d0da8363', nombre: 'Hormigones YA' },
  { id: 'f6563746-0c21-4e17-b672-bdc780a17a41', nombre: 'Ready Mix Córdoba' },
]

function Stars({ rating }) {
  const r = Math.round(rating)
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.85rem', letterSpacing: 1 }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
      <span style={{ color: '#64748b', marginLeft: 4, fontSize: '0.75rem', letterSpacing: 0 }}>{rating}</span>
    </span>
  )
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ background: bg, color, borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
      {label}
    </span>
  )
}

function MetricCard({ icon, value, label }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.6rem 0.9rem', textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: '1.2rem' }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function Marketplace() {
  const [pedidos,         setPedidos]         = useState([])
  const [perfilActivo,    setPerfilActivo]     = useState(null)
  const [proveedorId,     setProveedorId]      = useState(null)
  const [miscotizaciones, setMisCotizaciones] = useState({}) // pedidoId → cotización propia
  const [loading,         setLoading]         = useState(true)
  const [selected,        setSelected]        = useState(null)
  const [enviado,         setEnviado]         = useState(false)
  const [form,            setForm]            = useState({ precio_m3: '', precio_total: '', tiempo_entrega: '', obs: '' })
  const [showRegistro,    setShowRegistro]    = useState(false)
  const [registroForm,    setRegistroForm]    = useState({
    empresa: '', zona: '', email: '', telefono: '',
    radio_cobertura_km: '', preaviso_horas: '',
    antiguedad_años: '', cantidad_clientes: '',
    resistencias: []
  })
  const [registroEnviado, setRegistroEnviado] = useState(false)
  const [registroLoading, setRegistroLoading] = useState(false)

  useEffect(() => { fetchPedidos() }, [])

  useEffect(() => {
    if (proveedorId) {
      fetchPerfil(proveedorId)
      fetchMisCotizaciones(proveedorId)
    } else {
      setPerfilActivo(null)
      setMisCotizaciones({})
    }
  }, [proveedorId])

  const fetchPedidos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .eq('estado', 'publicado')
      .order('fecha_colado', { ascending: true })
      .limit(MAX_PEDIDOS)
    setPedidos(data ?? [])
    setLoading(false)
  }

  const fetchPerfil = async (id) => {
    const { data } = await supabase.from('perfiles_proveedor').select('*').eq('id', id).single()
    setPerfilActivo(data)
  }

  const fetchMisCotizaciones = async (id) => {
    const { data } = await supabase
      .from('cotizaciones')
      .select('*')
      .eq('proveedor_id', id)
    const map = {}
    data?.forEach(c => { map[c.pedido_id] = c })
    setMisCotizaciones(map)
  }

  const calcTotal = () => {
    if (form.precio_m3 && selected?.m3_estimado) {
      setForm(f => ({ ...f, precio_total: (parseFloat(f.precio_m3) * selected.m3_estimado).toFixed(2) }))
    }
  }

  const handleCotizar = (pedido) => {
    setSelected(pedido)
    setEnviado(false)
    setForm({ precio_m3: '', precio_total: '', tiempo_entrega: '', obs: '' })
  }

  const handleSubmitCotizacion = async () => {
    console.log('handleSubmitCotizacion llamado', { selected, proveedorId, form })
    if (!proveedorId) return alert('Seleccioná tu empresa primero')
    if (!form.precio_m3 || !form.tiempo_entrega) return alert('Completá precio y tiempo de entrega')

    const { data: existe } = await supabase
      .from('cotizaciones').select('id')
      .eq('pedido_id', selected.id).eq('proveedor_id', proveedorId)
      .maybeSingle()
    if (existe) return alert('Ya cotizaste este pedido')

    try {
      const { error } = await supabase.from('cotizaciones').insert({
        pedido_id:      selected.id,
        proveedor_id:   proveedorId,
        precio_m3:      parseFloat(form.precio_m3) || null,
        precio_total:   parseFloat(form.precio_total) || null,
        tiempo_entrega: form.tiempo_entrega,
        obs:            form.obs || null,
      })
      if (error) throw error
      setEnviado(true)
      setMisCotizaciones(prev => ({ ...prev, [selected.id]: { precio_m3: form.precio_m3, precio_total: form.precio_total, tiempo_entrega: form.tiempo_entrega } }))
    } catch (e) {
      alert('Error al enviar cotización: ' + e.message)
    }
  }

  const toggleResistencia = (r) => {
    setRegistroForm(f => ({
      ...f,
      resistencias: f.resistencias.includes(r) ? f.resistencias.filter(x => x !== r) : [...f.resistencias, r]
    }))
  }

  const handleRegistro = async () => {
    const { empresa, zona, email, resistencias } = registroForm
    if (!empresa || !zona || !email) return alert('Completá empresa, zona y email')
    if (!resistencias.length) return alert('Seleccioná al menos una resistencia')
    setRegistroLoading(true)
    try {
      const { error } = await supabase.from('perfiles_proveedor').insert({
        empresa, zona, email,
        telefono:            registroForm.telefono || null,
        radio_cobertura_km:  parseFloat(registroForm.radio_cobertura_km) || null,
        preaviso_horas:      parseInt(registroForm.preaviso_horas) || null,
        antiguedad_años:     parseInt(registroForm.antiguedad_años) || null,
        cantidad_clientes:   parseInt(registroForm.cantidad_clientes) || null,
        resistencias, rating: 0, entregas_completadas: 0, entregas_a_tiempo_pct: 0
      })
      if (error) throw error
      setRegistroEnviado(true)
    } catch (e) {
      alert('Error al registrarse: ' + e.message)
    } finally {
      setRegistroLoading(false)
    }
  }

  const yaCotice = (pedidoId) => !!miscotizaciones[pedidoId]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div>
          <img src="/Recurso 20.png" alt="logo" style={{ height: 36, objectFit: 'contain' }} />  
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'white' }}>🧱 BIM Marketplace</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Portal de proveedores de hormigón</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={proveedorId ?? ''}
            onChange={e => setProveedorId(e.target.value || null)}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 600, background: '#334155', color: 'white', cursor: 'pointer' }}>
            {PROVEEDORES_TEST.map(p => (
              <option key={p.id ?? 'null'} value={p.id ?? ''}>{p.nombre}</option>
            ))}
          </select>
          <a href="/" style={{ fontSize: '0.8rem', color: '#94a3b8', textDecoration: 'none' }}>← Volver</a>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* Columna izquierda — perfil proveedor */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {perfilActivo ? (
            <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', position: 'sticky', top: 20 }}>
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '1.5rem' }}>🏭</div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>{perfilActivo.empresa}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 6 }}>📍 {perfilActivo.zona}</div>
                <Stars rating={perfilActivo.rating} />
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  {perfilActivo.rating >= 4.5 && <Badge label="⭐ Top proveedor" color="#92400e" bg="#fef3c7" />}
                  {perfilActivo.entregas_a_tiempo_pct >= 95 && <Badge label="✅ Muy puntual" color="#065f46" bg="#d1fae5" />}
                  {perfilActivo.entregas_completadas >= 100 && <Badge label="🏆 +100 entregas" color="#1e40af" bg="#dbeafe" />}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                <MetricCard icon="📦" value={perfilActivo.entregas_completadas} label="Entregas" />
                <MetricCard icon="✅" value={`${perfilActivo.entregas_a_tiempo_pct}%`} label="A tiempo" />
                <MetricCard icon="👥" value={perfilActivo.cantidad_clientes ?? '—'} label="Clientes" />
                <MetricCard icon="📐" value={`${perfilActivo.radio_cobertura_km}km`} label="Cobertura" />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>RESISTENCIAS</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {perfilActivo.resistencias?.map(r => (
                    <span key={r} style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, padding: '2px 7px', fontSize: '0.72rem', fontWeight: 700 }}>{r}</span>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                ⏱ Preaviso mínimo: <strong>{perfilActivo.preaviso_horas}hs</strong>
              </div>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏭</div>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Seleccioná tu empresa</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 16 }}>para ver tu perfil y cotizar pedidos</div>
              <button onClick={() => { setShowRegistro(true); setRegistroEnviado(false) }}
                style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', width: '100%' }}>
                + Registrar mi empresa
              </button>
            </div>
          )}
        </div>

        {/* Columna derecha — pedidos */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 100px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>Pedidos activos</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{pedidos.length} pedidos publicados · ordenados por fecha de colado</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>Cargando pedidos...</div>
          ) : pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>No hay pedidos publicados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pedidos.map(p => {
                const cotice = yaCotice(p.id)
                return (
                  <div key={p.id} style={{
                    background: 'white', borderRadius: 12, padding: '1.1rem 1.25rem',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    border: cotice ? '2px solid #86efac' : '1px solid #e2e8f0',
                    opacity: cotice ? 0.85 : 1
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{p.obra_nombre}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                          📅 {p.fecha_colado} · {p.hora} · {p.resistencia}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {cotice && <Badge label="✓ Ya cotizaste" color="#065f46" bg="#d1fae5" />}
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600 }}>
                          publicado
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {[
                        { label: 'Volumen', value: `${p.m3_estimado?.toFixed(1)} m³` },
                        { label: 'Elementos', value: p.elementos_ifc?.reduce((s, e) => s + e.ids.length, 0) ?? '—' },
                        { label: 'Publicado', value: new Date(p.created_at).toLocaleDateString('es-AR') },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '0.4rem 0.6rem' }}>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{label}</div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {p.elementos_ifc?.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        {p.elementos_ifc.map((e, i) => (
                          <span key={i} style={{ background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem', color: '#475569' }}>
                            {e.piso} · {e.categoria} ({e.ids.length})
                          </span>
                        ))}
                      </div>
                    )}
                    {p.obs && <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.6rem' }}>💬 {p.obs}</div>}

                    {cotice ? (
                      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#15803d' }}>
                        ✅ Cotización enviada · entrega: {miscotizaciones[p.id]?.tiempo_entrega}
                      </div>
                    ) : (
                      <button
                        onClick={() => proveedorId ? handleCotizar(p) : alert('Seleccioná tu empresa primero')}
                        style={{
                          background: proveedorId ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#e2e8f0',
                          color: proveedorId ? 'white' : '#94a3b8',
                          border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem',
                          cursor: proveedorId ? 'pointer' : 'not-allowed',
                          fontWeight: 600, fontSize: '0.82rem',
                          boxShadow: proveedorId ? '0 2px 6px rgba(59,130,246,0.3)' : 'none'
                        }}>
                        {proveedorId ? 'Cotizar pedido →' : 'Seleccioná tu empresa para cotizar'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal cotización */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            {enviado ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>Cotización enviada</div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>El cliente recibirá tu oferta</div>
                <button onClick={() => { setSelected(null); setEnviado(false) }}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>Cotizar pedido</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>
                  {selected.obra_nombre} · {selected.m3_estimado?.toFixed(1)} m³ · {selected.resistencia}
                </div>

                {perfilActivo && (
                  <div style={{ background: '#eff6ff', borderRadius: 10, padding: '0.6rem 0.9rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.2rem' }}>🏭</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{perfilActivo.empresa}</div>
                      <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>Cotizando como esta empresa</div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Precio por m³ ($) *</label>
                  <input type="number" value={form.precio_m3}
                    onChange={e => setForm(f => ({ ...f, precio_m3: e.target.value }))}
                    onBlur={calcTotal} style={inputStyle} placeholder="ej: 85000" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Precio total ($)</label>
                  <input type="number" value={form.precio_total}
                    onChange={e => setForm(f => ({ ...f, precio_total: e.target.value }))}
                    style={inputStyle} placeholder="calculado automáticamente" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Tiempo de entrega *</label>
                  <input type="text" value={form.tiempo_entrega}
                    onChange={e => setForm(f => ({ ...f, tiempo_entrega: e.target.value }))}
                    style={inputStyle} placeholder="ej: 48hs, mismo día" />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Observaciones</label>
                  <textarea value={form.obs}
                    onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                    style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSelected(null); setEnviado(false) }}
                    style={{ flex: 1, padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: 'white' }}>
                    Cancelar
                  </button>
                  <button onClick={handleSubmitCotizacion}
                    style={{ flex: 2, padding: '0.5rem', border: 'none', borderRadius: 8, cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 700 }}>
                    Enviar cotización →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal registro proveedor */}
      {showRegistro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 480, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            {registroEnviado ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>Empresa registrada</div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>Ya podés cotizar pedidos desde el marketplace</div>
                <button onClick={() => setShowRegistro(false)}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}>Registrar empresa proveedora</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>Completá los datos para aparecer en el marketplace</div>
                {[
                  { label: 'Empresa *',                     key: 'empresa',            placeholder: 'Hormigonera Norte SRL' },
                  { label: 'Zona *',                        key: 'zona',               placeholder: 'Norte Córdoba' },
                  { label: 'Email de contacto *',           key: 'email',              placeholder: 'contacto@empresa.com', type: 'email' },
                  { label: 'Teléfono',                      key: 'telefono',           placeholder: '351 000-0000' },
                  { label: 'Radio de cobertura (km)',       key: 'radio_cobertura_km', placeholder: '50',  type: 'number' },
                  { label: 'Preaviso mínimo (hs)',          key: 'preaviso_horas',     placeholder: '24',  type: 'number' },
                  { label: 'Antigüedad en el rubro (años)', key: 'antiguedad_años',    placeholder: '10',  type: 'number' },
                  { label: 'Cantidad de clientes activos',  key: 'cantidad_clientes',  placeholder: '30',  type: 'number' },
                ].map(({ label, key, placeholder, type = 'text' }) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>{label}</label>
                    <input type={type} value={registroForm[key]} placeholder={placeholder}
                      onChange={e => setRegistroForm(f => ({ ...f, [key]: e.target.value }))}
                      style={inputStyle} />
                  </div>
                ))}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Resistencias que trabajás *</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {RESISTENCIAS_OPTS.map(r => (
                      <span key={r} onClick={() => toggleResistencia(r)} style={{
                        background: registroForm.resistencias.includes(r) ? '#3b82f6' : '#f1f5f9',
                        color: registroForm.resistencias.includes(r) ? 'white' : '#475569',
                        borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem',
                        cursor: 'pointer', fontWeight: 600
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowRegistro(false)}
                    style={{ flex: 1, padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: 'white' }}>
                    Cancelar
                  </button>
                  <button onClick={handleRegistro} disabled={registroLoading} style={{
                    flex: 2, padding: '0.5rem', border: 'none', borderRadius: 8,
                    cursor: registroLoading ? 'not-allowed' : 'pointer',
                    background: registroLoading ? '#93c5fd' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white', fontWeight: 700
                  }}>
                    {registroLoading ? 'Registrando...' : 'Registrar empresa →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 4, fontWeight: 600 }
const inputStyle = { width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }