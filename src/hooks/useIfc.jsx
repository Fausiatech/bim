import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { CATEGORIES, ESTADOS_IFC } from '../constants'

export function useIfc({ viewerRef, currentModel, categoryIds, wallsVisible, concreteOnly,
  selectedEstado, setSelectedEstado, setCategoryIds, setIfcStats, setEstadoIds, setRemitos,
  setModelData, setChatMessages, iniciarGPS, generarRemitos, setActiveTab,
  supabase, currentUser, currentCat, setWallsVisible, setConcreteOnly }) {

  const getScene = () =>
    viewerRef.current?.context?.scene?.scene ??
    viewerRef.current?.context?.getScene()

  const concreteIdsRef = useRef([])
  const statsRef = useRef(null)

  // ── Save analysis ───────────────────────────────────────
  const saveAnalysis = async (name, sp, total, vol, summary) => {
    if (!currentUser) return
    await supabase.from('ifc_analyses').insert({
      user_id: currentUser.id, file_name: name, storage_path: sp,
      total_elements: total, concrete_volume: vol, summary,
      category: currentCat, created_at: new Date().toISOString()
    })
  }

  // ── Scan IFC model ──────────────────────────────────────
  const scanModel = async (modelID, name, sp) => {
    const mgr = viewerRef.current.IFC.loader.ifcManager
    const ids = {}
    let total = 0, concrete = 0, steel = 0, none = 0, vol = 0
    const summary = {}, concreteIds = []

  const firstSlab = ids['slabs']?.[0]
if (firstSlab) {
  const props = await mgr.getItemProperties(modelID, firstSlab, false)
  const psets = await mgr.getPropertySets(modelID, firstSlab, false)
}

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      if (key === 'all') continue
      ids[key] = []
      for (const typeName of cat.codes) {
        try {
          const { [typeName]: typeCode } = await import('web-ifc')
          const found = await mgr.getAllItemsOfType(modelID, typeCode, false)
          if (!found?.length) continue
          const fresh = found.filter(id => !ids[key].includes(id))
          ids[key].push(...fresh)
          total += fresh.length

          // Muestra para análisis de materiales (máx 50 por tipo)
          const sample = fresh.slice(0, 50)
          await Promise.all(sample.map(async (id) => {
            try {
              const ma = await mgr.getMaterialsProperties(modelID, id, false)
              const matName = ma?.[0]?.Name?.value ?? ma?.[0]?.ForLayerSet?.LayerSetName?.value ?? 'Sin material'
              const low = matName.toLowerCase()
              if (!summary[matName]) summary[matName] = { count: 0, volume: 0 }
              summary[matName].count++
              if (low.includes('concret') || low.includes('hormig')) {
                concrete++; concreteIds.push(id)
              } else if (low.includes('steel') || low.includes('acero')) {
                steel++
              } else {
                try {
                  const props = await mgr.getItemProperties(modelID, id)
                  const nombre = (props?.Name?.value ?? '').toLowerCase()
                  if (nombre.includes('concret') || nombre.includes('hormig')) {
                    concrete++; concreteIds.push(id)
                    summary[matName].count--
                    if (!summary['Concrete (by name)']) summary['Concrete (by name)'] = { count: 0, volume: 0 }
                    summary['Concrete (by name)'].count++
                  } else { none++ }
                } catch (_) { none++ }
              }
            } catch (_) { none++ }
          }))

          // Resto: clasificar solo por nombre
          await Promise.all(fresh.slice(50).map(async (id) => {
            try {
              const props = await mgr.getItemProperties(modelID, id)
              const nombre = (props?.Name?.value ?? '').toLowerCase()
              if (nombre.includes('concret') || nombre.includes('hormig')) {
                concrete++; concreteIds.push(id)
              } else if (nombre.includes('steel') || nombre.includes('acero')) {
                steel++
              } else { none++ }
            } catch (_) { none++ }
          }))

        } catch (_) {}
      }
    }
     try {
      const testId = ids['slabs']?.[0] ?? ids['beams']?.[0]
      
      if (testId) {
        const p = await mgr.getItemProperties(modelID, testId, false)
        
      }
    } catch(e) { console.log('test error:', e.message) }
    try {
  const testId = ids['slabs']?.[0]
  if (testId) {
    const { IFCRELCONTAINEDINSPATIALSTRUCTURE } = await import('web-ifc')
    const rels = await mgr.getAllItemsOfType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE, false)
    for (const relId of rels.slice(0, 20)) {
      const rel = await mgr.getItemProperties(modelID, relId, false)
      
    }
  }
} catch(e) { console.log('nivel error:', e.message) }

const floorIds = [39, 43, 47, 51, 54, 58, 62, 66, 70, 74, 78, 82]
for (const fId of floorIds) {
  const fp = await mgr.getItemProperties(modelID, fId, false)
  
}
// Construir mapa elementId → piso
const { IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCBUILDINGSTOREY } = await import('web-ifc')
const storeyIds = await mgr.getAllItemsOfType(modelID, IFCBUILDINGSTOREY, false)
const floors = {}
for (const fId of storeyIds) {
  const fp = await mgr.getItemProperties(modelID, fId, false)
  floors[fId] = { name: fp?.Name?.value ?? `Piso ${fId}`, elevation: fp?.Elevation?.value ?? 0 }
}

const elementFloor = {} // elementId → { name, elevation }
const rels = await mgr.getAllItemsOfType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE, false)
for (const relId of rels) {
  const rel = await mgr.getItemProperties(modelID, relId, false)
  const floorId = rel?.RelatingStructure?.value
  if (!floorId || !floors[floorId]) continue
  for (const el of (rel.RelatedElements ?? [])) {
    elementFloor[el.value] = floors[floorId]
  }
}


    // Volumen geométrico
    let geoVol = 0
    try {
      const mesh = viewerRef.current.context.getScene().children.find(c => c.type === 'Mesh')
      if (mesh?.geometry) {
        const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index
        if (pos && idx) {
          const vt = (ax, ay, az, bx, by, bz, cx, cy, cz) =>
            (ax * (by * cz - bz * cy) + bx * (cy * az - cz * ay) + cx * (ay * bz - az * by)) / 6
          let sum = 0
          for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i) * 3, b = idx.getX(i + 1) * 3, c = idx.getX(i + 2) * 3
            sum += vt(pos.array[a], pos.array[a + 1], pos.array[a + 2],
              pos.array[b], pos.array[b + 1], pos.array[b + 2],
              pos.array[c], pos.array[c + 1], pos.array[c + 2])
          }
          geoVol = Math.abs(sum)
        }
      }
    } catch (e) { console.log('vol geo:', e.message) }

    // Fundaciones desde IFCSLAB
    const { IFCSLAB } = await import('web-ifc')
    const allSlabIds = await mgr.getAllItemsOfType(modelID, IFCSLAB, false)
    const fundacionPrefijos = ['SFD_Pile_Cap_Rectangle', 'SFD_Round', 'SFD_']
    for (const id of allSlabIds) {
      try {
        const props = await mgr.getItemProperties(modelID, id)
        const nombre = props?.Name?.value ?? ''
        if (fundacionPrefijos.some(p => nombre.startsWith(p))) {
          if (!ids['footings'].includes(id)) ids['footings'].push(id)
        }
      } catch (_) {}
    }
    
    concreteIdsRef.current = concreteIds
    const stats = { total, volume: geoVol > 0 ? geoVol : vol, concrete, steel, none }
    statsRef.current = stats
    setCategoryIds(ids)
    setIfcStats(stats)

    if (concreteIds.length > 0) {
      const estados = { entregado: [], en_camino: [], pendiente: [] }
      for (const id of concreteIds) {
        const r = Math.random()
        if (r < 0.33) estados.entregado.push(id)
        else if (r < 0.66) estados.en_camino.push(id)
        else estados.pendiente.push(id)
      }
      setEstadoIds(estados)
      setRemitos(generarRemitos(estados))
      if (estados.en_camino.length > 0) iniciarGPS()
      if (sp) localStorage.setItem('last_model_name', name)
    }

    const md = { fileName: name, schema: 'IFC2X3', total, categories: ids, summary, concreteCount: concrete, steelCount: steel, noneCount: none }
    setModelData(md)
    setChatMessages(prev => [...prev, { role: 'assistant', text: `Modelo "${name}" analizado. ${total} elementos, ${concrete} de hormigón.` }])
    await saveAnalysis(name, sp, total, vol, summary)
  }

  // ── Colorear por estado ─────────────────────────────────
  const colorearEstado = useCallback((estado, ids) => {
    if (!viewerRef.current || !currentModel) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    Object.keys(ESTADOS_IFC).forEach(k => {
      try { mgr.removeSubset(modelID, undefined, `est-${k}`) } catch (_) {}
    })
    try { mgr.removeSubset(modelID, undefined, 'highlight') } catch (_) {}
    if (!estado || !ids?.length) return
    const colorBase = new THREE.Color(ESTADOS_IFC[estado].three)
    const mat = new THREE.MeshLambertMaterial({
      color: colorBase, transparent: true, opacity: 0.9,
      emissive: colorBase, emissiveIntensity: 0.3, depthTest: true,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    try {
      const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id))
      mgr.createSubset({ modelID, ids: validIds, material: mat, removePrevious: true, customID: `est-${estado}` })
    } catch (e) { console.error('colorear:', e.message) }
  }, [currentModel])

  // ── Handle estado click ─────────────────────────────────
  const handleEstadoClick = useCallback((estado) => {
    if (selectedEstado === estado) { setSelectedEstado(null); colorearEstado(null, []) }
    else { setSelectedEstado(estado); colorearEstado(estado, []); setActiveTab('remitos') }
  }, [selectedEstado, colorearEstado])

  // ── Highlight categoría ─────────────────────────────────
  const highlightCategory = useCallback(async (cat) => {
    if (!currentModel || !viewerRef.current) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    const scene = getScene()

    // Limpiar subsets anteriores
    Object.keys(ESTADOS_IFC).forEach(k => { try { mgr.removeSubset(modelID, undefined, `est-${k}`) } catch (_) {} })
    try { mgr.removeSubset(modelID, undefined, 'highlight') } catch (_) {}
    const oldWire = scene.getObjectByName('wire-highlight')
    if (oldWire) scene.remove(oldWire)
    setSelectedEstado(null)

    // Restaurar visibilidad base según filtros activos
    if (concreteOnly) {
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = false })
      const concreteSubset = mgr.getSubset(modelID, undefined, 'concrete-only')
      if (concreteSubset) concreteSubset.visible = true
    } else if (!wallsVisible) {
      const noWalls = mgr.getSubset(modelID, undefined, 'no-walls')
      const noWallsUUID = noWalls?.uuid
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = c.uuid === noWallsUUID })
    } else {
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
    }

    // Restaurar stats y salir si es 'all'
    if (cat === 'all') {
      if (statsRef.current) setIfcStats(statsRef.current)
      return
    }

    // Filtrar IDs de la categoría — si concreteOnly, solo los de hormigón
    const concreteSet = new Set([
      ...concreteIdsRef.current,
      ...(categoryIds['footings'] ?? [])
    ])
    let ids = categoryIds[cat] ?? []
    if (concreteOnly) ids = ids.filter(id => concreteSet.has(id))
    if (!ids.length) return

    // Actualizar cards
    const concreteInCat = ids.filter(id => concreteIdsRef.current.includes(id)).length
    const volProporcional = statsRef.current
      ? Math.round(statsRef.current.volume * concreteInCat / (concreteIdsRef.current.length || 1) * 10) / 10
      : 0
    setIfcStats(prev => ({
      ...prev,
      total: ids.length,
      concrete: concreteInCat || null,
      volume: volProporcional
    }))

    // Crear subset y wireframe
    mgr.createSubset({ modelID, ids, scene, removePrevious: true, customID: 'highlight' })
    const subsetMesh = mgr.getSubset(modelID, undefined, 'highlight')
    if (subsetMesh) {
      const wire = new THREE.WireframeGeometry(subsetMesh.geometry)
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
      const wireframe = new THREE.LineSegments(wire, lineMat)
      wireframe.name = 'wire-highlight'
      wireframe.position.copy(subsetMesh.position)
      wireframe.rotation.copy(subsetMesh.rotation)
      scene.add(wireframe)
    }
  }, [currentModel, categoryIds, wallsVisible, concreteOnly])

  // ── Toggle walls ────────────────────────────────────────
  const toggleWalls = useCallback(async () => {
    if (!currentModel || !viewerRef.current) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    const scene = getScene()
    const wallIds = new Set(categoryIds['walls'] ?? [])
    if (!wallIds.size) return
    const next = !wallsVisible
    try {
      if (!next) {
        const { IFCBEAM, IFCCOLUMN, IFCSLAB } = await import('web-ifc')
        const beamIds   = await mgr.getAllItemsOfType(modelID, IFCBEAM,   false)
        const columnIds = await mgr.getAllItemsOfType(modelID, IFCCOLUMN, false)
        const slabIds   = await mgr.getAllItemsOfType(modelID, IFCSLAB,   false)
        const visibleIds = [...beamIds, ...columnIds, ...slabIds]
        mgr.createSubset({ modelID, ids: visibleIds, scene, removePrevious: true, customID: 'no-walls' })
        const subsetUUID = mgr.getSubset(modelID, undefined, 'no-walls')?.uuid
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = c.uuid === subsetUUID })
      } else {
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
        try { mgr.removeSubset(modelID, undefined, 'no-walls') } catch (_) {}
      }
      setWallsVisible(next)
    } catch (e) { console.error('toggleWalls:', e.message) }
  }, [currentModel, categoryIds, wallsVisible])

  // ── Toggle concrete only ────────────────────────────────
  const toggleConcreteOnly = useCallback(async (next) => {
    if (!currentModel || !viewerRef.current) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    const scene = getScene()

    try {
      if (next) {
        const allConcreteIds = [
          ...concreteIdsRef.current,
          ...(categoryIds['footings'] ?? [])
        ].filter((v, i, a) => a.indexOf(v) === i)

        
        if (!allConcreteIds.length) return

        await mgr.createSubset({
          modelID, ids: allConcreteIds, scene,
          removePrevious: true, customID: 'concrete-only'
        })

        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = false })
        const subset = mgr.getSubset(modelID, undefined, 'concrete-only')
        if (subset) subset.visible = true
        else console.warn('subset no encontrado')

        setIfcStats(prev => ({
          ...prev,
          total: allConcreteIds.length,
          concrete: concreteIdsRef.current.length,
        }))

      } else {
        mgr.removeSubset(modelID, scene, 'concrete-only')
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
        if (statsRef.current) setIfcStats(statsRef.current)
      }
      setConcreteOnly(next)
    } catch (err) {
      console.error('toggleConcreteOnly error:', err)
    }
  }, [currentModel, categoryIds])

  return { scanModel, colorearEstado, highlightCategory, toggleWalls, toggleConcreteOnly, handleEstadoClick }
}

      