import { useState, useCallback } from 'react'


console.log('USESPECKLE CARGADO')

const FT3_TO_M3 = 0.0283168
const COSTO_HOR = 280 // USD por m³

const QUERY = (projectId, modelId) => `
  query {
    project(id: "${projectId}") {
      name
      model(id: "${modelId}") {
        id
        name
        versions(limit: 1) {
          items {
            id
            referencedObject
            createdAt
            authorUser { name }
          }
        }
      }
    }
  }
`

const fetchGraphQL = async (projectId, modelId) => {
  const res = await fetch('/speckle/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY(projectId, modelId) }),
  })
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0].message)
  return data?.data?.project
}

const fetchObject = async (projectId, objId) => {
  const res = await fetch(`/speckle/objects/${projectId}/${objId}/single`)
  if (!res.ok) throw new Error(`HTTP ${res.status} al obtener objeto`)
  return res.json()
}

const walkObjects = (obj, results = []) => {
  if (!obj || typeof obj !== 'object') return results
  if (obj.speckle_type?.includes('RevitColumn') ||
      obj.speckle_type?.includes('RevitBeam') ||
      obj.speckle_type?.includes('RevitWall') ||
      obj.speckle_type?.includes('RevitFloor') ||
      obj.speckle_type?.includes('RevitFoundation')) {
    results.push(obj)
    return results
  }
  if (Array.isArray(obj)) { obj.forEach(i => walkObjects(i, results)); return results }
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') walkObjects(v, results) })
  return results
}

const parseElement = (el, savedStates = {}) => {
  const vol_ft3 = el.parameters?.Volume || 0
  const vol_m3  = +(vol_ft3 * FT3_TO_M3).toFixed(2)
  const nivel   = el.level?.name || el.parameters?.['Base Level'] || '—'
  const tipo    = el.type || el.parameters?.Type || '—'
  const mat     = el.parameters?.['Structural Material'] || '—'
  const loc     = el.parameters?.['Column Location Mark'] || '—'
  const len_ft  = el.parameters?.Length || 0
  const largo_m = +(len_ft * 0.3048).toFixed(2)
  const b = el.parameters?.b ? +(el.parameters.b * 30.48).toFixed(0) : null
  const h = el.parameters?.h ? +(el.parameters.h * 30.48).toFixed(0) : null
  const dim     = b && h ? `${b}x${h}cm` : tipo
  const matLow  = mat.toLowerCase()
  const isHormigon = matLow.includes('concrete') || matLow.includes('hormig') || tipo.includes('CC')
  const id      = String(el.elementId || el.id)
  const speckleType = el.speckle_type || ''
  const categoria =
    speckleType.includes('Column')    ? 'Columna'   :
    speckleType.includes('Beam')      ? 'Viga'      :
    speckleType.includes('Wall')      ? 'Muro'      :
    speckleType.includes('Floor')     ? 'Losa'      :
    speckleType.includes('Foundation')? 'Fundación' : 'Elemento'

  return {
    id,
    speckleId: el.id,
    tipo,
    categoria,
    nivel,
    dim,
    material: isHormigon ? 'Hormigón' : 'Acero',
    isHormigon,
    loc,
    largo_m,
    vol_m3,
    costo_est: +(vol_m3 * COSTO_HOR).toFixed(0),
    estado: savedStates[id] || 'pendiente',
  }
}

export const useSpeckle = () => {
  const [elementos, setElementos] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [lastSync, setLastSync]   = useState(null)
  const [projectName, setProjectName] = useState(null)

  const load = useCallback(async (projectId, modelId, savedStates = {}) => {
    setLoading(true)
    setError(null)
    try {
      const proj = await fetchGraphQL(projectId, modelId)
      setProjectName(proj?.name || 'Proyecto')
      const ver = proj?.model?.versions?.items?.[0]
      if (!ver?.referencedObject) throw new Error('No se encontró versión publicada en Speckle')
      const root = await fetchObject(projectId, ver.referencedObject)
      if (!root) throw new Error('No se pudo acceder al modelo')
      const raw = walkObjects(root)
      const parsed = raw.map(el => parseElement(el, savedStates))
      setElementos(parsed)
      setLastSync(new Date().toLocaleTimeString('es-AR'))
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  // Estadísticas derivadas
  const stats = {
    total:      elementos.length,
    hormigon:   elementos.filter(e => e.isHormigon).length,
    acero:      elementos.filter(e => !e.isHormigon).length,
    vol_total:  +elementos.reduce((s, e) => s + e.vol_m3, 0).toFixed(1),
    costo_total: elementos.reduce((s, e) => s + e.costo_est, 0),
    ejecutados: elementos.filter(e => e.estado === 'desencofrado').length,
    avance:     elementos.length
      ? Math.round(elementos.filter(e => e.estado === 'desencofrado').length / elementos.length * 100)
      : 0,
    observaciones: elementos.filter(e => e.estado === 'observacion').length,
    niveles:    [...new Set(elementos.map(e => e.nivel))].sort(),
    categorias: [...new Set(elementos.map(e => e.categoria))],
  }

  return { elementos, loading, error, lastSync, projectName, stats, load, setElementos }
}