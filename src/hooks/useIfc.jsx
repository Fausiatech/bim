import { useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { CATEGORIES, ESTADOS_IFC } from '../constants'

export function useIfc({ viewerRef, currentModel, categoryIds, wallsVisible, concreteOnly,
  selectedEstado, setSelectedEstado, setCategoryIds, setIfcStats, setEstadoIds, setRemitos,
  setModelData, setChatMessages, iniciarGPS, setActiveTab,
  supabase, currentUser, currentCat, setWallsVisible, setConcreteOnly, setCategoryLabels }) {

  const getScene = () =>
    viewerRef.current?.context?.scene?.scene ??
    viewerRef.current?.context?.getScene()

  const concreteIdsRef  = useRef([])
  const statsRef        = useRef(null)
  const elementFloorRef = useRef({})
  const globalIdMapRef = useRef({})
 


  // ── Save analysis ───────────────────────────────────────
  const saveAnalysis = async (name, sp, total, vol, summary) => {
    if (!currentUser) return
    await supabase.from('ifc_analyses').insert({
      user_id: currentUser.id, file_name: name, storage_path: sp,
      total_elements: total, concrete_volume: vol, summary,
      category: currentCat, created_at: new Date().toISOString()
    })
  }

  // ── Función base para colorear IDs con un color ─────────
  // Un solo enfoque: highlightIfcItemsByID. Sin subsets manuales.
 const colorearIds = useCallback((modelID, idsInput, color, customID = 'color-subset') => {
  if (!viewerRef.current || !idsInput?.length) return
  const mgr = viewerRef.current.IFC.loader.ifcManager
  const scene = viewerRef.current.context.getScene()
  const validIds = [...new Set(idsInput.map(id => parseInt(id)).filter(id => !isNaN(id)))]
  if (!validIds.length) return
  
  // Remover primero para evitar el bug de 'mesh' undefined
  try { mgr.removeSubset(modelID, undefined, customID) } catch(_) {}
  
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    transparent: true, opacity: 0.85,
    depthTest: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  try {
    mgr.createSubset({ modelID, ids: validIds, scene, material: mat, removePrevious: false, customID })
  } catch(e) { console.warn('colorearIds:', e.message) }
}, [])
  // ── Colorear un estado (limpia todo primero) ────────────
  // Usada para interacción manual — click en pedido, adjudicar, etc.
  const colorearEstado = useCallback((estado, ids) => {
    if (!viewerRef.current || !currentModel) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    // Limpiar subsets anteriores
    Object.keys(ESTADOS_IFC).forEach(k => {
      try { mgr.removeSubset(modelID, undefined, `est-${k}`) } catch (_) {}
    })
    try { mgr.removeSubset(modelID, undefined, 'highlight') } catch (_) {}
    if (!estado || !ids?.length) return
    colorearIds(modelID, ids, ESTADOS_IFC[estado].three, `est-${estado}`)
  }, [currentModel, colorearIds])

  // ── Colorear todos los pedidos desde Supabase ───────────
  // Usada al cargar modelo y al togglear muros — todos los estados coexisten
  const colorearPedidosDesdeSupabase = useCallback(async (modelID) => {
    try {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('estado, elementos_ifc')
        .in('estado', ['adjudicado', 'en_camino', 'entregado'])
      if (!pedidos?.length) return

      const idsPorEstado = { adjudicado: [], en_camino: [], entregado: [] }
      for (const p of pedidos) {
        const pIds = p.elementos_ifc?.flatMap(e => e.ids) ?? []
        if (idsPorEstado[p.estado]) idsPorEstado[p.estado].push(...pIds)
      }

      // Colorear cada estado — highlightIfcItemsByID acumula sin pisar
      for (const estado of ['adjudicado', 'en_camino', 'entregado']) {
        if (!idsPorEstado[estado].length) continue
        colorearIds(modelID, idsPorEstado[estado], ESTADOS_IFC[estado].three)
      }

      setEstadoIds({
        adjudicado: idsPorEstado.adjudicado,
        en_camino:  idsPorEstado.en_camino,
        entregado:  idsPorEstado.entregado,
      })
      if (idsPorEstado.en_camino.length > 0) iniciarGPS()
    } catch (e) { console.warn('colorearPedidos:', e.message) }
  }, [supabase, colorearIds, iniciarGPS])

  // ── Scan IFC model ──────────────────────────────────────
 const scanModel = async (modelID, name, sp) => {
  const mgr = viewerRef.current.IFC.loader.ifcManager
  const ids = {}
  const globalIdMap = {} // expressID → globalId
  let total = 0, concrete = 0, steel = 0, none = 0, vol = 0
  const summary = {}, concreteIds = []

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

        await Promise.all(fresh.map(async (id) => {
          try {
            const props = await mgr.getItemProperties(modelID, id, false)
            // ← capturar GlobalId para todos los elementos
            if (props?.GlobalId?.value) globalIdMap[id] = props.GlobalId.value

            const nombre = (props?.Name?.value ?? '').toLowerCase()
            const ma = await mgr.getMaterialsProperties(modelID, id, false)
            const matName = ma?.[0]?.Name?.value ?? 
                           ma?.[0]?.ForLayerSet?.LayerSetName?.value ?? 
                           'Sin material'
            const low = matName.toLowerCase()

            if (!summary[matName]) summary[matName] = { count: 0, volume: 0 }
            summary[matName].count++

            if (low.includes('concret') || low.includes('hormig') ||
                nombre.includes('concret') || nombre.includes('hormig')) {
              concrete++; concreteIds.push(id)
            } else if (low.includes('steel') || low.includes('acero') ||
                       nombre.includes('steel') || nombre.includes('acero')) {
              steel++
            } else { none++ }
          } catch (_) { none++ }
        }))
      } catch (_) {}
    }
  }

    // ── Construir mapa elementId → piso ───────────────────
    const { IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCBUILDINGSTOREY } = await import('web-ifc')
    const storeyIds = await mgr.getAllItemsOfType(modelID, IFCBUILDINGSTOREY, false)
    const floors = {}
    for (const fId of storeyIds) {
      const fp = await mgr.getItemProperties(modelID, fId, false)
      floors[fId] = { name: fp?.Name?.value ?? `Piso ${fId}`, elevation: fp?.Elevation?.value ?? 0 }
    }

    const floorMap = {}
    const rels = await mgr.getAllItemsOfType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE, false)
    for (const relId of rels) {
      const rel = await mgr.getItemProperties(modelID, relId, false)
      const floorId = rel?.RelatingStructure?.value
      if (!floorId || !floors[floorId]) continue
      for (const el of (rel.RelatedElements ?? [])) {
        floorMap[el.value] = floors[floorId]
      }
    }

    // ── Fundaciones desde IFCSLAB ─────────────────────────
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

    // ── Volumen geométrico ────────────────────────────────
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

    // ── Actualizar refs y estado ──────────────────────────
    concreteIdsRef.current = concreteIds
    elementFloorRef.current = floorMap

    const stats = { total, volume: geoVol > 0 ? geoVol : vol, concrete, steel, none }
    statsRef.current = stats
    setCategoryIds(ids)
    setIfcStats(stats)

    // ── Colorear pedidos al terminar el scan ──────────────
    await colorearPedidosDesdeSupabase(modelID)

    // ── Cargar remitos ────────────────────────────────────
    if (currentUser) {
      try {
        const { data: remitosDB } = await supabase
          .from('remitos').select('*')
          .eq('usuario_id', currentUser.id)
          .order('created_at', { ascending: false })
        setRemitos(remitosDB ?? [])
      } catch (e) { console.log('remitos:', e.message) }
    }

    const md = { fileName: name, schema: 'IFC2X3', total, categories: ids, summary, concreteCount: concrete, steelCount: steel, noneCount: none }
    setModelData(md)
    setChatMessages(prev => [...prev, { role: 'assistant', text: `Modelo "${name}" analizado. ${total} elementos, ${concrete} de hormigón.` }])
    await saveAnalysis(name, sp, total, geoVol > 0 ? geoVol : vol, summary)
    globalIdMapRef.current = globalIdMap
}

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

    Object.keys(ESTADOS_IFC).forEach(k => { try { mgr.removeSubset(modelID, undefined, `est-${k}`) } catch (_) {} })
    try { mgr.removeSubset(modelID, undefined, 'highlight') } catch (_) {}
    const oldWire = scene.getObjectByName('wire-highlight')
    if (oldWire) scene.remove(oldWire)
    setSelectedEstado(null)

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

    if (cat === 'all') {
      if (statsRef.current) setIfcStats(statsRef.current)
      return
    }

    const concreteSet = new Set([...concreteIdsRef.current, ...(categoryIds['footings'] ?? [])])
    let ids = categoryIds[cat] ?? []
    if (concreteOnly) ids = ids.filter(id => concreteSet.has(id))
    if (!ids.length) return

    const concreteInCat = ids.filter(id => concreteIdsRef.current.includes(id)).length
    const volProporcional = statsRef.current
      ? Math.round(statsRef.current.volume * concreteInCat / (concreteIdsRef.current.length || 1) * 10) / 10
      : 0
    setIfcStats(prev => ({ ...prev, total: ids.length, concrete: concreteInCat || null, volume: volProporcional }))

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
        // Restaurar colores de estados
        await colorearPedidosDesdeSupabase(modelID)
      } else {
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
        try { mgr.removeSubset(modelID, undefined, 'no-walls') } catch (_) {}
        // Restaurar colores de estados
        await colorearPedidosDesdeSupabase(modelID)
      }
      setWallsVisible(next)
    } catch (e) { console.error('toggleWalls:', e.message) }
  }, [currentModel, categoryIds, wallsVisible, colorearPedidosDesdeSupabase])

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
      await mgr.createSubset({ modelID, ids: allConcreteIds, scene, removePrevious: true, customID: 'concrete-only' })
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = false })
      const subset = mgr.getSubset(modelID, undefined, 'concrete-only')
      if (subset) subset.visible = true
      await colorearPedidosDesdeSupabase(modelID)  // ← agregado acá
      setIfcStats(prev => ({ ...prev, total: allConcreteIds.length, concrete: concreteIdsRef.current.length }))
    } else {
      mgr.removeSubset(modelID, scene, 'concrete-only')
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
      if (statsRef.current) setIfcStats(statsRef.current)
    }
    setConcreteOnly(next)
  } catch (err) { console.error('toggleConcreteOnly error:', err) }
}, [currentModel, categoryIds, colorearPedidosDesdeSupabase])  // ← agregado acá

  return { 
    scanModel, colorearEstado, colorearPedidosDesdeSupabase,
    highlightCategory, toggleWalls, toggleConcreteOnly, 
    handleEstadoClick, elementFloorRef, concreteIdsRef,globalIdMapRef  
  }
}