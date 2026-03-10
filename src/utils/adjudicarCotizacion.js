import { supabase } from '../supabase'
import * as THREE from 'three'

const COLOR_ADJUDICADO = { r: 0.93, g: 0.27, b: 0.27 } // rojo
const COLOR_EN_CAMINO  = { r: 0.97, g: 0.62, b: 0.07 } // amarillo
const COLOR_ENTREGADO  = { r: 0.13, g: 0.77, b: 0.37 } // verde

export async function adjudicarCotizacion({ cotizacion, pedido, user, ifcViewer }) {
  if (!user) throw new Error('No autenticado')

  // 1. Marcar pedido como adjudicado
  const { error: errPedido } = await supabase
    .from('pedidos')
    .update({
      estado: 'adjudicado',
      cotizacion_adjudicada_id: cotizacion.id,
      adjudicado_at: new Date().toISOString()
    })
    .eq('id', pedido.id)
    console.log('errPedido:', JSON.stringify(errPedido))

  if (errPedido) throw new Error(errPedido.message ?? JSON.stringify(errPedido))

  // 2. Crear remito
  const { data: remito, error: errRemito } = await supabase
    .from('remitos')
    .insert({
      pedido_id:      pedido.id,
      cotizacion_id:  cotizacion.id,
      proveedor_id:   cotizacion.proveedor_id,
      usuario_id:     user.id,
      m3_despachado:  pedido.m3_estimado,
      precio_total:   cotizacion.precio_total,
      elementos_ifc:  pedido.elementos_ifc,
      fecha_entrega:  calcularFechaEntrega(cotizacion.tiempo_entrega),
      color_aplicado: '#ef4444'
    })
    .select()
    .single()

  if (errRemito) throw new Error(errRemito.message ?? JSON.stringify(errRemito))

  // 3. Cambiar color en el visor BIM
  try {
    const viewer = ifcViewer?.current ?? ifcViewer
    if (viewer) await colorearPiezasBIM(viewer, pedido.elementos_ifc, COLOR_ADJUDICADO)
  } catch (e) { console.warn('color BIM:', e.message) }

  return remito
}

export async function colorearPiezasBIM(viewer, elementosIfc, color) {
  if (!elementosIfc?.length) return
  const instance = viewer?.current ?? viewer
  if (!instance) return
  const todosLosIds = elementosIfc.flatMap(e => e.ids)
  instance.IFC.loader.ifcManager.createSubset({
    modelID: 0,
    ids: todosLosIds,
    scene: instance.context.getScene(),
    removePrevious: true,
    customID: 'estado-color',
  })
}

//export async function colorearPiezasBIM(viewer, elementosIfc, color) {
//  if (!elementosIfc?.length) return
//  const instance = viewer?.current ?? viewer
  
//  if (!instance) return
//  const todosLosIds = elementosIfc.flatMap(e => e.ids)
// const material = new THREE.MeshLambertMaterial({
//    color: new THREE.Color(color.r, color.g, color.b),
//    transparent: false,
//    opacity: 1,
//    depthTest: true,
//    depthWrite: true,
//  })
//instance.IFC.loader.ifcManager.createSubset({
//    modelID: 0,
//    ids: todosLosIds,
//    scene: instance.context.getScene(),
//    removePrevious: true,
//    customID: 'estado-color',
//    material
//  })
//}

export const COLORES_ESTADO = {
  adjudicado: COLOR_ADJUDICADO,
  en_camino:  COLOR_EN_CAMINO,
  entregado:  COLOR_ENTREGADO,
}

function calcularFechaEntrega(tiempoEntrega) {
  if (!tiempoEntrega) return null
  const hoy = new Date()
  const resultado = (() => {
    if (/mismo.?d[ií]a/i.test(tiempoEntrega)) return new Date(hoy)
    const hs = tiempoEntrega.match(/(\d+)\s*hs/i)
    if (hs) { const d = new Date(hoy); d.setHours(d.getHours() + parseInt(hs[1])); return d }
    const dias = tiempoEntrega.match(/(\d+)\s*d[ií]a/i)
    if (dias) { const d = new Date(hoy); d.setDate(d.getDate() + parseInt(dias[1])); return d }
    return null
  })()
  if (!resultado) return null
  const unAnio = 365 * 24 * 60 * 60 * 1000
  if (Math.abs(resultado - hoy) > unAnio) return null
  return resultado.toISOString().split('T')[0]
}