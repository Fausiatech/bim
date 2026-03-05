import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { createClient } from '@supabase/supabase-js'
import SpeckleDashboard from './components/SpeckleDashboard'
import { useSpeckle } from './hooks/useSpeckle'
import './App.css'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const API_URL = 'http://localhost:8000'

const CATEGORIES = {
  all:     { label: 'Todo',     codes: [160246688, 3303938423, 3732776249, 2233826070, 3875453745, 753842376], color: null },
  beams:   { label: 'Vigas',    codes: [160246688],              color: '#2196F3' },
  columns: { label: 'Columnas', codes: [3303938423],             color: '#F44336' },
  slabs:   { label: 'Losas',    codes: [3732776249, 1410488051, 2533272240], color: '#4CAF50' },
  footings:{ label: 'Fundaciones',  codes: [2233826070],             color: '#FF9800' },
  members: { label: 'Miembros', codes: [3875453745],             color: '#9C27B0' },
  walls:   { label: 'Muros',    codes: [753842376],              color: '#607D8B' },
}

const ESTADOS_IFC = {
  entregado: { label: 'Entregado', color: '#4CAF50', three: 0x4CAF50, icon: '✅' },
  en_camino: { label: 'En camino', color: '#FFC107', three: 0xFFC107, icon: '🚚' },
  pendiente: { label: 'Pendiente', color: '#F44336', three: 0xF44336, icon: '🔴' },
}

const OBRA   = { lat: -31.4167, lng: -64.1833, nombre: 'Obra Av. Colón 1200, Córdoba' }
const PLANTA = { lat: -31.3500, lng: -64.2200, nombre: 'Hormigonera Norte Cba' }

function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}
function interpolar(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t } }

const RESISTENCIAS = ['H-17', 'H-21', 'H-25', 'H-30', 'H-35']
const PATENTES     = ['AA 123 BB', 'CC 456 DD', 'EE 789 FF', 'GG 012 HH']
const CHOFERES     = ['García, Carlos', 'López, Mario', 'Fernández, Juan', 'Rodríguez, Pedro']

function generarRemitos(estadoIds) {
  const remitos = []; let nro = 1001; const now = new Date()
  for (const id of (estadoIds.entregado || [])) {
    const f = new Date(now - Math.random() * 7 * 86400000)
    remitos.push({
      nro: `R-${nro++}`, fecha: f.toLocaleDateString('es-AR'),
      hora: f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      m3: (2 + Math.random() * 6).toFixed(1), resistencia: RESISTENCIAS[Math.floor(Math.random() * 5)],
      asentamiento: `${6 + Math.floor(Math.random() * 8)} cm`, patente: PATENTES[Math.floor(Math.random() * 4)],
      chofer: CHOFERES[Math.floor(Math.random() * 4)], elementoId: id, estado: 'entregado'
    })
  }
  for (const id of (estadoIds.en_camino || [])) {
    remitos.push({
      nro: `R-${nro++}`, fecha: now.toLocaleDateString('es-AR'),
      hora: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      m3: (2 + Math.random() * 6).toFixed(1), resistencia: RESISTENCIAS[Math.floor(Math.random() * 5)],
      asentamiento: `${6 + Math.floor(Math.random() * 8)} cm`, patente: PATENTES[Math.floor(Math.random() * 4)],
      chofer: CHOFERES[Math.floor(Math.random() * 4)], elementoId: id, estado: 'en_camino'
    })
  }
  return remitos.sort((a, b) => b.nro.localeCompare(a.nro))
}

export default function App() {
  const viewerRef      = useRef(null)
  const fileInputRef   = useRef(null)
  const gpsIntervalRef = useRef(null)
  const gpsProgressRef = useRef(0)

  const [currentModel,  setCurrentModel]  = useState(null)
  const [currentCat,    setCurrentCat]    = useState('all')
  const [categoryIds,   setCategoryIds]   = useState({})
  const [modelData,     setModelData]     = useState(null)
  const [currentUser,   setCurrentUser]   = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [ifcStats,      setIfcStats]      = useState({ total: 0, volume: 0, concrete: 0, steel: 0, none: 0 })
  const [fileSize,      setFileSize]      = useState('')
  const [fileName,      setFileName]      = useState('')
  const [chatMessages,  setChatMessages]  = useState([])
  const [chatInput,     setChatInput]     = useState('')
  const [chatLoading,   setChatLoading]   = useState(false)
  const [wallsVisible,  setWallsVisible]  = useState(true)
  const [concreteOnly, setConcreteOnly] =   useState(false)
  const [estadoIds,     setEstadoIds]     = useState({})
  const [activeTab,     setActiveTab]     = useState('categorias')
  const [selectedEstado,setSelectedEstado]= useState(null)
  const [remitos,       setRemitos]       = useState([])
  const [camionPos,     setCamionPos]     = useState(null)
  const [camionDist,    setCamionDist]    = useState(null)
  const [camionEstado,  setCamionEstado]  = useState('en_ruta')
  const [catVolume,     setCatVolume]     = useState({ total: 0, piezas: [] })
  const [volExpanded,   setVolExpanded]   = useState(false)
  const [concreteElementIds, setConcreteElementIds] = useState([])

  // ── Speckle ─────────────────────────────────────────────
  const { elementos: speckleEls, loading: speckleLoading, error: speckleError,
          lastSync, projectName, stats: speckleStats, load: loadSpeckle,
          setElementos: setSpeckleEls } = useSpeckle()

  // Auto-cargar Speckle al iniciar
  useEffect(() => {
    loadSpeckle(
      import.meta.env.VITE_SPECKLE_PROJECT_ID,
      import.meta.env.VITE_SPECKLE_MODEL_ID
    )
  }, [loadSpeckle])

  const handleSpeckleEstadoChange = useCallback((id, estado) => {
    setSpeckleEls(prev => prev.map(e => e.id === id ? { ...e, estado } : e))
  }, [setSpeckleEls])

  // ── Supabase auth ───────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null))
  }, [])

  // ── IFC viewer init ─────────────────────────────────────
  useEffect(() => {
    if (viewerRef.current) return
    const init = async () => {
      await new Promise(r => setTimeout(r, 200))
      const container = document.getElementById('viewer-canvas')
      if (!container) return
      while (container.firstChild) container.removeChild(container.firstChild)
      const v = new IfcViewerAPI({ container, backgroundColor: new THREE.Color(0xF8FAF8) })
      v.axes.setAxes(); v.grid.setGrid()
      viewerRef.current = v; window.viewer = v
      await new Promise(r => setTimeout(r, 100))
      try {
        await v.IFC.setWasmPath('/')
        await v.IFC.loader.ifcManager.applyWebIfcConfig({ COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: false })
      } catch (e) { console.error('WASM:', e) }
    }
    init()
    window.addEventListener('dblclick', async () => {
      if (!viewerRef.current) return
      try {
        const result = await viewerRef.current.IFC.selector.pickIfcItem()
        if (!result) return
        const props = await viewerRef.current.IFC.loader.ifcManager.getItemProperties(result.modelID, result.id)
        console.log('Elemento clickeado:', props)
      } catch (e) { console.error('pick:', e) }
    })
    return () => { viewerRef.current?.dispose?.() }
  }, [])

  // ── GPS simulado ────────────────────────────────────────
  const iniciarGPS = useCallback(() => {
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
    gpsProgressRef.current = 0
    gpsIntervalRef.current = setInterval(() => {
      gpsProgressRef.current = Math.min(gpsProgressRef.current + 0.008, 1)
      const pos = interpolar(PLANTA, OBRA, gpsProgressRef.current)
      const dist = distKm(pos, OBRA)
      setCamionPos(pos); setCamionDist(dist)
      if (dist <= 6) setCamionEstado('proximo')
      if (gpsProgressRef.current >= 1) { setCamionEstado('entregado'); clearInterval(gpsIntervalRef.current) }
    }, 1000)
  }, [])

  useEffect(() => () => { if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current) }, [])

  const getScene = () => viewerRef.current?.context?.scene?.scene ?? viewerRef.current?.context?.getScene()

  // ── Supabase storage ────────────────────────────────────
  const uploadToStorage = async (file) => {
    if (!currentUser) return null
    const path = `${currentUser.id}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('ifc-models').upload(path, file, { upsert: false })
    if (error) { console.error('Storage:', error.message); return null }
    return data.path
  }

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
              if (ps) for (const p of ps) for (const q of [...(p?.HasProperties || []), (p?.Quantities || [])]) {
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
    // Detectar fundaciones por nombre (IfcSlab con prefijos especiales)
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
console.log('ids footings antes de set:', ids['footings']?.length, ids['footings'])

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

  // ── Colorear por estado IFC ─────────────────────────────
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
      color: colorBase,
      transparent: true,
      opacity: 0.9,
      emissive: colorBase,
      emissiveIntensity: 0.3,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    try {
      const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id))
      mgr.createSubset({ modelID, ids: validIds, material: mat, removePrevious: true, customID: `est-${estado}` })
      console.log(`✅ Coloreado: ${estado} (${validIds.length} elementos)`)
    } catch (e) { console.error('colorear:', e.message) }
  }, [currentModel])

  // ── Handle estado click ─────────────────────────────────
  const handleEstadoClick = useCallback((estado) => {
    if (selectedEstado === estado) { setSelectedEstado(null); colorearEstado(null, []) }
    else { setSelectedEstado(estado); colorearEstado(estado, estadoIds[estado] ?? []); setActiveTab('remitos') }
  }, [selectedEstado, estadoIds, colorearEstado])

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

  if (cat === 'all') { setCatVolume({ total: 0, piezas: [] }); return }

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

  // Calcular volumen
  const piezas = []
  let volumenTotal = 0
  for (const id of ids) {
    try {
      mgr.createSubset({ modelID, ids: [id], scene, removePrevious: false, customID: `vol-${id}` })
      const geo = mgr.getSubset(modelID, undefined, `vol-${id}`)?.geometry
      if (geo?.index?.count > 0) {
        const pos = geo.attributes.position
        const idx = geo.index.array
        let vol = 0
       for (let j = 0; j < idx.length; j += 3) {
          const ax = pos.getX(idx[j]),   ay = pos.getY(idx[j]),   az = pos.getZ(idx[j])
          const bx = pos.getX(idx[j+1]), by = pos.getY(idx[j+1]), bz = pos.getZ(idx[j+1])
          const cx = pos.getX(idx[j+2]), cy = pos.getY(idx[j+2]), cz = pos.getZ(idx[j+2])
          vol += (ax*(by*cz - bz*cy) + bx*(cy*az - cz*ay) + cx*(ay*bz - az*by)) / 6
        }
        const volM3 = Math.abs(vol) * 0.0283168
        piezas.push({ id, nombre: `ID ${id}`, volM3: volM3.toFixed(4) })
        volumenTotal += volM3
        
      }
      try { mgr.removeSubset(modelID, undefined, `vol-${id}`) } catch(_) {}
    } catch(_) {}
  }
  setCatVolume({ total: volumenTotal, piezas })

}, [currentModel, categoryIds, wallsVisible, concreteOnly])

//_______ Togglewalls ______________

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
      const beamIds = await mgr.getAllItemsOfType(modelID, IFCBEAM, false)
      const columnIds = await mgr.getAllItemsOfType(modelID, IFCCOLUMN, false)
      const slabIds = await mgr.getAllItemsOfType(modelID, IFCSLAB, false)
      const visibleIds = [...beamIds, ...columnIds, ...slabIds]

      mgr.createSubset({ modelID, ids: visibleIds, scene, removePrevious: true, customID: 'no-walls' })

      const subset = mgr.getSubset(modelID, undefined, 'no-walls')
      const subsetUUID = subset?.uuid
      scene.children.forEach(c => {
        if (c.modelID === modelID) c.visible = c.uuid === subsetUUID
      })

    } else {
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
      try { mgr.removeSubset(modelID, undefined, 'no-walls') } catch (_) {}
    }

    setWallsVisible(next)

  } catch (e) { console.error('toggleWalls:', e.message) }
}, [currentModel, categoryIds, wallsVisible])

   // ── Togggle concrete only ─────────────────────────────────────
   const toggleConcreteOnly = useCallback(async () => {
  if (!currentModel || !viewerRef.current) return
  
  const modelID = currentModel.modelID
  const mgr = viewerRef.current.IFC.loader.ifcManager
  const scene = getScene()
  const next = !concreteOnly
  console.log('footings ids:', categoryIds['footings']?.length, categoryIds['footings'])
  const { IFCSITE } = await import('web-ifc')
  const siteIds = await mgr.getAllItemsOfType(modelID, IFCSITE, false)
 for (const id of siteIds) {
  const site = await mgr.getItemProperties(modelID, id)
  console.log('IfcSite:', JSON.stringify(site, null, 2))
}
  try {
  if (next) {
  const { IFCRELASSOCIATESMATERIAL } = await import('web-ifc')
  const allIds = Object.values(categoryIds).flat()
  
  console.log('primer beam props:', await mgr.getItemProperties(modelID, categoryIds['beams'][0]))
  console.log('primer slab props:', await mgr.getItemProperties(modelID, categoryIds['slabs'][0]))

  const concreteIds = []
  for (const id of allIds) {
    try {
      const ma = await mgr.getMaterialsProperties(modelID, id, false)
      const matName = ma?.[0]?.Name?.value ?? 
                      ma?.[0]?.ForLayerSet?.LayerSetName?.value ?? ''
      const low = matName.toLowerCase()
      if (low.includes('concret') || low.includes('hormig')) {
        concreteIds.push(id)
      }
    } catch(_) {}
  }

  // Agregar fundaciones
  for (const id of (categoryIds['footings'] ?? [])) {
    if (!concreteIds.includes(id)) concreteIds.push(id)
  }

  console.log('concrete ids total:', concreteIds.length)
  setConcreteElementIds(concreteIds)

  if (!concreteIds.length) return

  mgr.createSubset({ modelID, ids: concreteIds, scene, removePrevious: true, customID: 'concrete-only' })
  const subset = mgr.getSubset(modelID, undefined, 'concrete-only')
  const subsetUUID = subset?.uuid
  scene.children.forEach(c => {
    if (c.modelID === modelID) c.visible = c.uuid === subsetUUID
  })
    } else {
      scene.children.forEach(c => { if (c.modelID === modelID) c.visible = true })
      try { mgr.removeSubset(modelID, undefined, 'concrete-only') } catch (_) {}
      setConcreteElementIds([])
    }
     
    setConcreteOnly(next)

  } catch (e) { console.error('toggleConcreteOnly:', e.message) }
}, [currentModel, concreteOnly, categoryIds])
 

  // ── Handle IFC file ─────────────────────────────────────
  const handleFile = async (file) => {
    if (!file || !viewerRef.current) return
    setLoading(true)
    setFileSize((file.size / 1024 / 1024).toFixed(1) + ' MB')
    setFileName(file.name)
    setWallsVisible(true); setEstadoIds({}); setRemitos([]); setSelectedEstado(null)
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
    setCamionPos(null); setCamionDist(null); setCamionEstado('en_ruta')
    const url = URL.createObjectURL(file)
    try {
      const model = await viewerRef.current.IFC.loadIfcUrl(url)
      setCurrentModel(model); setLoading(false)
      setTimeout(async () => {
        try {
          const box = new THREE.Box3().setFromObject(model)
          const ctrl = viewerRef.current.context.ifcCamera.cameraControls
          await ctrl.fitToBox(box, true)
          const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
          ctrl.setLookAt(c.x, c.y + Math.max(s.x, s.y, s.z), c.z + Math.max(s.x, s.y, s.z) * 2, c.x, c.y, c.z, true)
        } catch (e) { console.log('cam:', e.message) }
        try {
          const sp = await uploadToStorage(file)
          await scanModel(model.modelID, file.name, sp)
        } catch (e) { console.error('scan:', e) }
      }, 2000)
    } catch (err) {
      alert('Error al cargar: ' + err.message); setLoading(false); URL.revokeObjectURL(url)
    }
  }
  

  // ── Chat IA ─────────────────────────────────────────────
  const sendMessage = async () => {
    if (!chatInput.trim() || !modelData || chatLoading) return
    const q = chatInput.trim(); setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', text: q }])
    setChatLoading(true)
    try {
      const res = await fetch(API_URL + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, model_data: modelData }) })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', text: data.answer }])
    } catch (_) { setChatMessages(prev => [...prev, { role: 'assistant error', text: 'Error al conectar con el servidor.' }]) }
    setChatLoading(false)
  }

  const totalCatIds = Object.values(categoryIds).flat().length
  const remitosFiltered = selectedEstado ? remitos.filter(r => r.estado === selectedEstado) : remitos
  const gpsBannerColor = camionEstado === 'proximo' ? '#FFC107' : camionEstado === 'entregado' ? '#4CAF50' : '#607D8B'
  const gpsBannerText = camionEstado === 'proximo'
    ? `🚚 Camión a ${camionDist?.toFixed(1)} km — ¡Próxima entrega!`
    : camionEstado === 'entregado' ? '✅ Entrega completada en obra'
    : `🚚 En ruta · ${camionDist?.toFixed(1) ?? '...'} km a la obra`

  const sidebarTabs = [
    ['categorias', 'Modelo'],
    ['remitos', 'Remitos'],
    ['dashboard', '📊 BI'],
  ]
  console.log('concreteElementIds:', concreteElementIds.length)
  console.log('beams en concrete:', categoryIds['beams']?.filter(id => concreteElementIds.includes(id))?.length)
  console.log('slabs en concrete:', categoryIds['slabs']?.filter(id => concreteElementIds.includes(id))?.length)
  console.log('muestra concreteElementIds:', concreteElementIds.slice(0, 5))
  console.log('muestra beams ids:', categoryIds['beams']?.slice(0, 5))
  console.log('muestra slabs ids:', categoryIds['slabs']?.slice(0, 5))
  console.log('render - concreteOnly:', concreteOnly, 'concreteElementIds:', concreteElementIds.length, 'currentCat:', currentCat)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <header className="header">
        <div className="logo">
          <img src="/logo.png" alt="BIM AI" style={{ height: 36 }} />
          <span className="logo-text">BIM AI</span>
        </div>
        <nav className="nav-links">
          <a href="#" className="nav-link">Inicio</a>
          <a href="#" className="nav-link">Proyectos</a>
          <a href="#" className="nav-link">Documentación</a>
          {lastSync
            ? <span style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 600 }}>⚡ Speckle · {lastSync}</span>
            : <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>⚡ Conectando Speckle...</span>
          }
          <button className="btn-contact">Contacto</button>
        </nav>
      </header>

      <div className="main-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">
              {activeTab === 'dashboard' && speckleStats.total > 0 ? (projectName || 'Speckle Dashboard') : 'Estructura del Modelo'}
            </div>
            <div className="sidebar-subtitle">
              {activeTab === 'dashboard' ? `${speckleStats.total} elementos · ${speckleStats.avance}% avance` : fileName || 'Sin modelo cargado'}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
              {sidebarTabs.map(([k, l]) => (
                <button key={k} onClick={() => setActiveTab(k)} style={{
                  flex: 1, padding: '0.3rem 0.2rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontSize: '0.72rem', fontWeight: 600,
                  background: activeTab === k ? 'var(--primary)' : 'var(--border)',
                  color: activeTab === k ? 'white' : 'var(--text-gray)'
                }}>{l}</button>
              ))}
            </div>
          </div>

          <div className="sidebar-content">
            {camionPos && activeTab !== 'dashboard' && (
              <div style={{ background: gpsBannerColor, color: 'white', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}>
                {gpsBannerText}
                <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '0.2rem', opacity: 0.9 }}>
                  📍 {PLANTA.nombre} → {OBRA.nombre}
                </div>
              </div>
            )}

            {/* TAB MODELO */}
            {activeTab === 'categorias' && (<>
              <div className="tree-section">
                <div className="tree-section-title">Categorías</div>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <div key={key} className={`cat-item tree-item${currentCat === key ? ' active' : ''}`}
                   onClick={async () => { if (!currentModel) return; setCurrentCat(key); await highlightCategory(key) }}>
                    <span>{cat.label}</span>
                    <span className="cat-count">
                    {key === 'all'
                    ? (concreteOnly ? concreteElementIds.length : totalCatIds)
                    : concreteOnly
                     ? (categoryIds[key]?.filter(id => concreteElementIds.includes(id))?.length ?? 0)
                     : (categoryIds[key]?.length ?? 0)}
                    </span>
                  </div>
                ))}
              </div>

              {currentModel && (
               <div className="tree-section">
                <div className="tree-section-title">Visibilidad</div>
                  <div className={`cat-item tree-item${!wallsVisible ? ' active' : ''}`} onClick={toggleWalls}>
                 <span>{wallsVisible ? '👁 Muros visibles' : '🚫 Muros ocultos'}</span>
               <span className="cat-count">{categoryIds['walls']?.length ?? 0}</span>
           </div>
          </div>
          )}

             {currentModel && (
               <div className="tree-section">
                 <div className="tree-section-title">Material</div>
                   <div className={`cat-item tree-item${concreteOnly ? ' active' : ''}`} onClick={toggleConcreteOnly}>
                 <span>{concreteOnly ? '🧱 Solo hormigón' : '👁 Todos los materiales'}</span>
               </div>
             </div>
            )}
              {currentModel && Object.keys(estadoIds).length > 0 && (
                <div className="tree-section">
                  <div className="tree-section-title">Estado de Obra</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-gray)', padding: '0 0.5rem 0.5rem', lineHeight: 1.4 }}>
                    Clic para colorear en modelo
                  </div>
                  {Object.entries(ESTADOS_IFC).map(([key, est]) => (
                    <div key={key} className={`cat-item tree-item${selectedEstado === key ? ' active' : ''}`}
                      onClick={() => handleEstadoClick(key)} style={{ paddingLeft: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: est.color, display: 'inline-block', flexShrink: 0 }} />
                        {est.icon} {est.label}
                      </span>
                      <span className="cat-count">{estadoIds[key]?.length ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="chat-panel">
                <div className="chat-header">
                  <span className="chat-title">💬 Chat IA</span>
                  <span className="chat-status">{modelData ? 'Modelo listo' : 'Sin modelo'}</span>
                </div>
                <div className="chat-messages">
                  {chatMessages.map((m, i) => <div key={i} className={`chat-message ${m.role}`}>{m.text}</div>)}
                  {chatLoading && <div className="chat-message assistant">Analizando...</div>}
                </div>
                <div className="chat-input-row">
                  <input className="chat-input" value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder={modelData ? 'Pregunta sobre el modelo...' : 'Carga un modelo primero'}
                    disabled={!modelData || chatLoading} />
                  <button className="chat-send-btn" onClick={sendMessage} disabled={!modelData || chatLoading}>➤</button>
                </div>
              </div>
            </>)}

            {/* TAB REMITOS */}
            {activeTab === 'remitos' && (
              <div className="tree-section">
                <div className="tree-section-title">
                  {selectedEstado ? `Remitos — ${ESTADOS_IFC[selectedEstado]?.label}` : 'Todos los remitos'}
                  {selectedEstado && (
                    <span onClick={() => { setSelectedEstado(null); colorearEstado(null, []) }}
                      style={{ cursor: 'pointer', marginLeft: '0.5rem', color: 'var(--text-gray)', fontWeight: 400 }}>✕ ver todos</span>
                  )}
                </div>
                {remitosFiltered.length === 0 && (
                  <div style={{ color: 'var(--text-gray)', fontSize: '0.85rem', padding: '0.5rem' }}>Sin remitos</div>
                )}
                {remitosFiltered.map((r, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem', background: 'white', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', alignItems: 'center' }}>
                      <strong>{r.nro}</strong>
                      <span style={{
                        background: r.estado === 'entregado' ? '#e8f5e9' : '#fff8e1',
                        color: r.estado === 'entregado' ? '#2e7d32' : '#f57f17',
                        padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600
                      }}>{ESTADOS_IFC[r.estado].icon} {ESTADOS_IFC[r.estado].label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem', color: 'var(--text-gray)' }}>
                      <span>📅 {r.fecha} {r.hora}</span>
                      <span>🏗 {r.resistencia} · {r.asentamiento}</span>
                      <span>🚚 {r.patente}</span>
                      <span>📦 {r.m3} m³</span>
                      <span style={{ gridColumn: '1/-1' }}>👤 {r.chofer}</span>
                      <span style={{ gridColumn: '1/-1', fontSize: '0.7rem', color: '#bbb' }}>ID IFC: {r.elementoId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB DASHBOARD BI */}
            {activeTab === 'dashboard' && (
              <>
                {speckleLoading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 12 }}>Cargando desde Speckle...</div>
                  </div>
                ) : speckleError ? (
                  <div style={{ padding: 12, background: '#fee2e2', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
                    ⚠️ {speckleError}
                    <button onClick={() => loadSpeckle(import.meta.env.VITE_SPECKLE_PROJECT_ID, import.meta.env.VITE_SPECKLE_MODEL_ID)}
                      style={{ display: 'block', marginTop: 8, padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <SpeckleDashboard
                    elementos={speckleEls}
                    stats={speckleStats}
                    lastSync={lastSync}
                    projectName={projectName}
                    onEstadoChange={handleSpeckleEstadoChange}
                  />
                )}
              </>
            )}
          <div className="info-cards">
  {(() => {
    const catCount = currentCat && currentCat !== 'all'
      ? (concreteOnly
          ? (categoryIds[currentCat]?.filter(id => concreteElementIds.includes(id))?.length ?? 0)
          : (categoryIds[currentCat]?.length ?? 0))
      : null
    const showCat = catCount !== null && catCount > 0
    const label = showCat ? CATEGORIES[currentCat]?.label : concreteOnly ? 'Hormigón' : 'Modelo'
    return <>
      <div className="info-card">
        <div className="info-card-label">Elementos {label}</div>
        <div className="info-card-value">
          {showCat ? catCount : concreteOnly ? concreteElementIds.length : ifcStats.total.toLocaleString()}
        </div>
      </div>
      <div className="info-card">
        <div className="info-card-label">Volumen {label}</div>
        <div className="info-card-value">
          {showCat && catVolume.total > 0
            ? catVolume.total.toFixed(2)
            : ifcStats.volume > 0 ? ifcStats.volume.toFixed(1) : '0'}
          <small style={{ fontSize: '1rem' }}> m³</small>
        </div>
      </div>
      <div className="info-card">
        <div className="info-card-label">Archivo</div>
        <div className="info-card-value" style={{ fontSize: '1.2rem' }}>{fileSize}</div>
      </div>
    </>
  })()}
</div>
        </div>
          <div className="viewer-container" style={{ position: 'relative' }}>
            <div id="viewer-canvas" style={{ position: 'absolute', inset: 0 }} />

            {!currentModel && !loading && (
              <div className="upload-state" style={{ position: 'absolute', inset: 0, zIndex: 10 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}>
                <div className="upload-card">
                  <div className="upload-illustration">
                    <img src="/upload-illustration.svg" alt="" style={{ width: 100 }} />
                  </div>
                  <div className="upload-title">Carga tu modelo IFC</div>
                  <div className="upload-description">Arrastrá tu archivo aquí o hacé clic para seleccionar</div>
                  <button className="upload-button">Seleccionar archivo</button>
                  <div className="upload-formats">Formatos soportados: .ifc</div>
                </div>
                <input ref={fileInputRef} type="file" accept=".ifc" style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
            )}

            {loading && (
              <div className="loading-overlay" style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex' }}>
                <div className="loading-content">
                  <div className="loading-spinner" />
                  <div className="loading-text">Cargando modelo...</div>
                </div>
              </div>
            )}

            {currentModel && (
              <div className="viewer-controls">
                <button className="control-btn" title="Zoom +" onClick={() => viewerRef.current?.context.ifcCamera.cameraControls.zoom(1.5, true)}>＋</button>
                <button className="control-btn" title="Zoom -" onClick={() => viewerRef.current?.context.ifcCamera.cameraControls.zoom(-1.5, true)}>－</button>
                <div className="control-divider" />
                <button className="control-btn" title="Frente" onClick={() => {
                  const ctrl = viewerRef.current?.context.ifcCamera.cameraControls
                  const box = new THREE.Box3().setFromObject(currentModel)
                  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
                  ctrl.setLookAt(c.x, c.y, c.z + s.z * 2, c.x, c.y, c.z, true)
                }}>⬜</button>
                <button className="control-btn" title="Arriba" onClick={() => {
                  const ctrl = viewerRef.current?.context.ifcCamera.cameraControls
                  const box = new THREE.Box3().setFromObject(currentModel)
                  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
                  ctrl.setLookAt(c.x, c.y + s.y * 2, c.z, c.x, c.y, c.z, true)
                }}>🔲</button>
                <button className="control-btn" title="Lateral" onClick={() => {
                  const ctrl = viewerRef.current?.context.ifcCamera.cameraControls
                  const box = new THREE.Box3().setFromObject(currentModel)
                  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
                  ctrl.setLookAt(c.x + s.x * 2, c.y, c.z, c.x, c.y, c.z, true)
                }}>▭</button>
                <button className="control-btn" title="Encuadrar" onClick={async () => {
                  const box = new THREE.Box3().setFromObject(currentModel)
                  await viewerRef.current?.context.ifcCamera.cameraControls.fitToBox(box, true)
                }}>⊙</button>
              </div>
            )}
          </div>
        </div>
      </div>
      
    </div>
  )
}