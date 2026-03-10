import * as THREE from 'three'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { adjudicarCotizacion, colorearPiezasBIM, COLORES_ESTADO } from '../utils/adjudicarCotizacion'


function Stars({ rating }) {
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
      <span style={{ color: '#64748b', marginLeft: 4, fontSize: '0.72rem' }}>{rating}</span>
    </span>
  )
}

// Props nuevas: user, ifcViewer (ref), onAdjudicarCotizacion (callback de App.jsx)
export default function PedidosContratista({ user, ifcViewer, onAdjudicarCotizacion, onEstadoChange }) {
  const [pedidos,      setPedidos]      = useState([])
  const [cotizaciones, setCotizaciones] = useState({})
  const [expanded,     setExpanded]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [adjudicando,  setAdjudicando]  = useState(null) // id de cotización en proceso

  useEffect(() => { fetchPedidos() }, [])

  const fetchPedidos = async () => {
    setLoading(true)
    setExpanded(null)       
    setCotizaciones({})
    // RLS filtra automáticamente por usuario_id gracias al SQL setup
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
    setPedidos(data ?? [])
    setLoading(false)
  }

  const fetchCotizaciones = async (pedidoId) => {
    console.log('fetchCotizaciones llamado', pedidoId, 'cache:', cotizaciones[pedidoId])
    if (cotizaciones[pedidoId]?.length) { setExpanded(pedidoId); return }
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, perfiles_proveedor(empresa, rating, entregas_completadas, entregas_a_tiempo_pct, zona)')
      .eq('pedido_id', pedidoId)
      .order('precio_total', { ascending: true })
      console.log('cotizaciones fetched:', data, 'error:', error)
    if (!error) setCotizaciones(prev => ({ ...prev, [pedidoId]: data ?? [] }))
    setExpanded(pedidoId)
  }

  const getIds = (pedido) => pedido.elementos_ifc?.flatMap(e => e.ids) ?? []

  // ── Adjudicar: genera remito real + cambia color BIM ─────
  const handleAdjudicar = useCallback(async (pedido, cotizacion) => {
    if (!confirm('¿Adjudicar este proveedor?')) return
    if (!user) return alert('Sesión expirada, volvé a iniciar sesión')

    setAdjudicando(cotizacion.id)
    try {
      // Delegar a App.jsx que tiene ifcViewer y user
      await onAdjudicarCotizacion({ cotizacion, pedido })
     // onEstadoChange?.(getIds(pedido), 'adjudicado')
      await fetchPedidos()
      setExpanded(null)
    } catch (err) {
  if (err.message?.includes('three') || err.message?.includes('IFC')) {
    console.warn('Color BIM:', err.message)
  } else {
    alert('Error al adjudicar: ' + err.message)
  }
} finally {
  setAdjudicando(null)
}
}, [user, onAdjudicarCotizacion, onEstadoChange])

  // ── Despachar ─────────────────────────────────────────────
  const handleDespachar = async (pedido) => {
  const { error } = await supabase.from('pedidos').update({ estado: 'en_camino' }).eq('id', pedido.id)
  console.log('despachar error:', JSON.stringify(error))
  if (error) return alert('Error al despachar: ' + error.message)
  onEstadoChange?.(getIds(pedido), 'en_camino')
  try {
    const viewer = ifcViewer?.current ?? ifcViewer
    if (viewer) await colorearPiezasBIM(viewer, pedido.elementos_ifc, { r: 0.97, g: 0.62, b: 0.07 })
  } catch (e) { console.warn('color BIM:', e.message) }
  await fetchPedidos()
}
// ── Confirmar entrega ─────────────────────────────────────
  
const handleEntrega = async (pedido) => {
  if (!confirm('¿Confirmar entrega?')) return
  await supabase.from('pedidos').update({ estado: 'entregado' }).eq('id', pedido.id)
  onEstadoChange?.(getIds(pedido), 'entregado')
  try {
    const viewer = ifcViewer?.current ?? ifcViewer
    if (viewer) await colorearPiezasBIM(viewer, pedido.elementos_ifc, { r: 0.13, g: 0.77, b: 0.37 }) // verde
  } catch (e) { console.warn('color BIM:', e.message) }
  await fetchPedidos()
}

async function colorearPiezasBIM(viewer, elementosIfc, color) {
  if (!elementosIfc?.length) return
  const instance = viewer?.current ?? viewer
  if (!instance) return
  const todosLosIds = elementosIfc.flatMap(e => e.ids)
  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color.r, color.g, color.b),
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
  })
  instance.IFC.loader.ifcManager.createSubset({
    modelID: 0,
    ids: todosLosIds,
    scene: instance.context.getScene(),
    removePrevious: true,
    customID: 'estado-color',
    material
  })
}

  const ESTADO_STYLE = {
    publicado:  { background: '#e0f2fe', color: '#0369a1' },
    adjudicado: { background: '#fef9c3', color: '#854d0e' },
    en_camino:  { background: '#fff7ed', color: '#c2410c' },
    entregado:  { background: '#dcfce7', color: '#15803d' },
    borrador:   { background: '#f1f5f9', color: '#64748b' },
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>
  if (!pedidos.length) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Sin pedidos aún</div>

  return (
    <div style={{ padding: '0.75rem', fontSize: '0.78rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>Mis Pedidos</div>

      {pedidos.map(p => {
        const isOpen = expanded === p.id
        const cotz = cotizaciones[p.id] ?? []
        const estadoStyle = ESTADO_STYLE[p.estado] ?? ESTADO_STYLE.borrador

        return (
          <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ padding: '0.6rem 0.75rem', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontWeight: 700 }}>{p.obra_nombre}</div>
                <span style={{ ...estadoStyle, padding: '2px 8px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 600 }}>
                  {p.estado}
                </span>
              </div>
              <div style={{ color: '#64748b', marginBottom: 6 }}>
                📅 {p.fecha_colado} · {p.hora} · {p.resistencia} · {p.m3_estimado?.toFixed(1)} m³
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {p.elementos_ifc?.map((e, i) => (
                  <span key={i} style={{ background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', color: '#475569' }}>
                    {e.piso} · {e.categoria} ({e.ids.length})
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.estado === 'publicado' && (
                  <button onClick={() => isOpen ? setExpanded(null) : fetchCotizaciones(p.id)}
                    style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    {isOpen ? 'Ocultar' : `Ver cotizaciones${cotz.length ? ` (${cotz.length})` : ''}`}
                  </button>
                )}
                {p.estado === 'adjudicado' && (
                  <button onClick={() => handleDespachar(p)} style={{
                    background: '#f59e0b', color: 'white', border: 'none',
                    borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 600
                  }}>🚚 Despachar</button>
                )}
                {p.estado === 'en_camino' && (
                  <button onClick={() => handleEntrega(p)} style={{
                    background: '#15803d', color: 'white', border: 'none',
                    borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 600
                  }}>✅ Confirmar entrega</button>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', background: '#f8fafc' }}>
                {!cotz.length ? (
                  <div style={{ padding: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>Sin cotizaciones aún</div>
                ) : (
                  cotz.map((c, i) => (
                    <div key={c.id} style={{
                      padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)',
                      background: i === 0 ? '#f0fdf4' : 'white',
                      display: 'flex', flexDirection: 'column', gap: 6
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {i === 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 5px', fontSize: '0.68rem', marginRight: 4 }}>Mejor precio</span>}
                          {c.perfiles_proveedor?.empresa}
                        </div>
                        <div style={{ color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Stars rating={c.perfiles_proveedor?.rating ?? 0} />
                          <span>✅ {c.perfiles_proveedor?.entregas_a_tiempo_pct}% a tiempo</span>
                          <span>📍 {c.perfiles_proveedor?.zona}</span>
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 12 }}>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>${c.precio_total?.toLocaleString('es-AR')}</span>
                          <span style={{ color: '#64748b' }}>${c.precio_m3?.toLocaleString('es-AR')}/m³</span>
                          <span style={{ color: '#64748b' }}>⏱ {c.tiempo_entrega}</span>
                        </div>
                        {c.obs && <div style={{ color: '#94a3b8', marginTop: 2 }}>💬 {c.obs}</div>}
                      </div>
                      <button
                        onClick={() => handleAdjudicar(p, c)}
                        disabled={adjudicando === c.id}
                        style={{
                          background: adjudicando === c.id ? '#94a3b8' : '#15803d',
                          color: 'white', border: 'none', borderRadius: 6,
                          padding: '0.4rem 0.6rem', cursor: adjudicando === c.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.72rem', fontWeight: 600, alignSelf: 'flex-start'
                        }}>
                        {adjudicando === c.id ? 'Generando remito...' : 'Adjudicar'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}