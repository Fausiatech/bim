import { useCallback } from 'react'
import * as THREE from 'three'
import { CATEGORIES, ESTADOS_IFC } from '../constants'

export function useIfc({ viewerRef, currentModel, categoryIds, wallsVisible, concreteOnly,
  selectedEstado, setSelectedEstado, setCategoryIds, setIfcStats, setEstadoIds, setRemitos,
  setModelData, setChatMessages, iniciarGPS, generarRemitos, setActiveTab,
  supabase, currentUser, currentCat }) {

  const getScene = () =>
    viewerRef.current?.context?.scene?.scene ??
    viewerRef.current?.context?.getScene()

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

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      if (key === 'all') continue; ids[key] = []
      for (const code of cat.codes) {
        try {
          const found = await mgr.getAllItemsOfType(modelID, code, false)
          if (!found?.length) continue
          const fresh = found.filter(id => !ids[key].includes(id))
          ids[key].push(...fresh); total += fresh.length
          for (const id of fresh.slice(0, 50)) {
            try {
              const ma = await mgr.getMaterialsProperties(modelID, id, false)
              const matName = ma?.[0]?.Name?.value ?? ma?.[0]?.ForLayerSet?.LayerSetName?.value ?? 'Sin material'
              const low = matName.toLowerCase()
              let v = 0
              const ps = await mgr.getPropertySets(modelID, id, false)
              if (ps) for (const p of ps) for (const q of [...(p?.HasProperties || []), ...(p?.Quantities || [])]) {
                const n = (q?.Name?.value || '').toLowerCase()
                if (n.includes('volume') || n.includes('volumen')) { const x = q?.NominalValue?.value ?? q?.VolumeValue?.value ?? 0; if (x > v) v = x }
              }
              if (!summary[matName]) summary[matName] = { count: 0, volume: 0 }
              summary[matName].count++; summary[matName].volume += v; vol += v
              if (low.includes('concret') || low.includes('hormig')) { concrete++; concreteIds.push(id) }
              else if (low.includes('steel') || low.includes('acero')) steel++
              else none++
            } catch (_) { none++ }
          }
        } catch (_) { }
      }
    }

    let geoVol = 0
    try {
      const mesh = viewerRef.current.context.getScene().children.find(c => c.type === 'Mesh')
      if (mesh?.geometry) {
        const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index
        if (pos && idx) {
          const v = (ax, ay, az, bx, by, bz, cx, cy, cz) =>
            (ax * (by * cz - bz * cy) + bx * (cy * az - cz * ay) + cx * (ay * bz - az * by)) / 6
          let sum = 0
          for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i) * 3, b = idx.getX(i + 1) * 3, c = idx.getX(i + 2) * 3
            sum += v(pos.array[a], pos.array[a + 1], pos.array[a + 2],
              pos.array[b], pos.array[b + 1], pos.array[b + 2],
              pos.array[c], pos.array[c + 1], pos.array[c + 2])
          }
          geoVol = Math.abs(sum)
        }
      }
    } catch (e) { console.log('vol geo:', e.message) }

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
    console.log('fundaciones detectadas:', ids['footings'].length)

    setCategoryIds(ids)
    setIfcStats({ total, volume: geoVol > 0 ? geoVol : vol, concrete, steel, none })

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

    Object.keys(ESTADOS_IFC).forEach(k => { try { mgr.removeSubset(modelID, undefined, `est-${k}`) } catch (_) {} })
    try { mgr.removeSubset(modelID, undefined, 'highlight') } catch (_) {}
    const oldWire = scene.getObjectByName('wire-highlight')
    if (oldWire) scene.remove(oldWire)
    setSelectedEstado(null)

    if (concreteOnly) {
      const concreteSubset = mgr.getSubset(modelID, undefined, 'concrete-only')
      const concreteUUID = concreteSubset?.uuid
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = c.uuid === concreteUUID })
    } else if (!wallsVisible) {
      const noWalls = mgr.getSubset(modelID, undefined, 'no-walls')
      const noWallsUUID = noWalls?.uuid
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = c.uuid === noWallsUUID })
    } else {
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
    }

    if (cat === 'all') return
    const ids = categoryIds[cat] ?? []
    if (!ids.length) return

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
  const toggleConcreteOnly = useCallback(async () => {
    if (!currentModel || !viewerRef.current) return
    const modelID = currentModel.modelID
    const mgr = viewerRef.current.IFC.loader.ifcManager
    const scene = getScene()
    const next = !concreteOnly
    try {
      if (next) {
        const { IFCRELASSOCIATESMATERIAL } = await import('web-ifc')
        const matRelIds = await mgr.getAllItemsOfType(modelID, IFCRELASSOCIATESMATERIAL, false)
        const concreteIds = []
        for (const matRelId of matRelIds) {
          const rel = await mgr.getItemProperties(modelID, matRelId)
          const matId = rel.RelatingMaterial?.value
          if (!matId) continue
          const mat = await mgr.getItemProperties(modelID, matId)
          const layerSetId = mat?.ForLayerSet?.value
          if (!layerSetId) continue
          const layerSet = await mgr.getItemProperties(modelID, layerSetId)
          for (const layerHandle of (layerSet?.MaterialLayers ?? [])) {
            const layer = await mgr.getItemProperties(modelID, layerHandle.value)
            const materialId = layer?.Material?.value
            if (!materialId) continue
            const material = await mgr.getItemProperties(modelID, materialId)
            const nombre = material?.Name?.value?.toLowerCase() ?? ''
            if (nombre.includes('concret') || nombre.includes('hormig')) {
              for (const objHandle of (rel.RelatedObjects ?? [])) concreteIds.push(objHandle.value)
            }
          }
        }
        for (const id of (categoryIds['footings'] ?? [])) {
          if (!concreteIds.includes(id)) concreteIds.push(id)
        }
        if (!concreteIds.length) return
        mgr.createSubset({ modelID, ids: concreteIds, scene, removePrevious: true, customID: 'concrete-only' })
        const subsetUUID = mgr.getSubset(modelID, undefined, 'concrete-only')?.uuid
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = c.uuid === subsetUUID })
      } else {
        scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
        try { mgr.removeSubset(modelID, undefined, 'concrete-only') } catch (_) {}
      }
      setConcreteOnly(next)
    } catch (e) { console.error('toggleConcreteOnly:', e.message) }
  }, [currentModel, categoryIds, concreteOnly])

  return { scanModel, colorearEstado, highlightCategory, toggleWalls, toggleConcreteOnly, handleEstadoClick }
}