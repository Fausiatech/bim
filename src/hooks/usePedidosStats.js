import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export function usePedidosStats(ifcStats, currentUser) {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPedidos = useCallback(async () => {
    if (!currentUser) return
    console.log('fetchPedidos currentUser:', currentUser.id)
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('estado, elementos_ifc, m3_estimado, fecha_colado, created_at')
        .order('created_at', { ascending: false })
         console.log('pedidos:', data?.length, 'error:', error)
      setPedidos(data ?? [])
    } catch(e) { console.warn('fetchPedidos stats:', e.message) }
    setLoading(false)
  }, [currentUser])

  useEffect(() => { fetchPedidos() }, [fetchPedidos])

  const stats = {
    total:         ifcStats?.concrete ?? 0,
    entregados:    pedidos.filter(p => p.estado === 'entregado').length,
    en_camino:     pedidos.filter(p => p.estado === 'en_camino').length,
    adjudicados:   pedidos.filter(p => p.estado === 'adjudicado').length,
    publicados:    pedidos.filter(p => p.estado === 'publicado').length,
    vol_total:     +(ifcStats?.volume ?? 0).toFixed(1),
    vol_entregado: +pedidos
      .filter(p => p.estado === 'entregado')
      .reduce((s, p) => s + (p.m3_estimado ?? 0), 0).toFixed(1),
    avance: ifcStats?.concrete
      ? Math.round(pedidos.filter(p => p.estado === 'entregado').length / ifcStats.concrete * 100)
      : 0,
    riesgo: pedidos.filter(p => 
      p.estado === 'adjudicado' && 
      new Date(p.fecha_colado) < new Date()
    ).length > 0 ? 'Alto' : 'Bajo'
  }

  return { pedidos, stats, loading, fetchPedidos }
}