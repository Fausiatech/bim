import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { useSpeckle } from './hooks/useSpeckle'
import { useGps } from './hooks/useGps'
import { useIfc } from './hooks/useIfc.jsx'
import Sidebar from './components/Sidebar'
import ViewerArea from './components/ViewerArea'
import { API_URL } from './constants'
import './App.css'
import { supabase } from './supabase'
import { adjudicarCotizacion } from './utils/adjudicarCotizacion'
import { fetchProyectosGuardados, getIfcUrl } from './utils/cargarProyectoGuardado'
import LoginForm from './components/LoginForm'
import { usePedidosStats } from './hooks/usePedidosStats'

// ── Eliminado: generarRemitos() random ──────────────────────
// Los remitos ahora se crean en Supabase al adjudicar una cotización

export default function App() {
  const viewerRef    = useRef(null)
  const fileInputRef = useRef(null)
  const [categoryLabels, setCategoryLabels] = useState({})

  const [currentModel,      setCurrentModel]      = useState(null)
  const [currentCat,        setCurrentCat]        = useState('all')
  const [categoryIds,       setCategoryIds]        = useState({})
  const [modelData,         setModelData]          = useState(null)
  const [currentUser,       setCurrentUser]        = useState(null)
  const [loading,           setLoading]            = useState(false)
  const [ifcStats,          setIfcStats]           = useState({ total: 0, volume: 0, concrete: 0, steel: 0, none: 0 })
  const [fileSize,          setFileSize]           = useState('')
  const [fileName,          setFileName]           = useState('')
  const [chatMessages,      setChatMessages]       = useState([])
  const [chatInput,         setChatInput]          = useState('')
  const [chatLoading,       setChatLoading]        = useState(false)
  const [wallsVisible,      setWallsVisible]       = useState(true)
  const [concreteOnly,      setConcreteOnly]       = useState(false)
  const [estadoIds,         setEstadoIds]          = useState({})
  const [activeTab,         setActiveTab]          = useState('categorias')
  const [selectedEstado,    setSelectedEstado]     = useState(null)
  const [remitos,           setRemitos]            = useState([])
  const [elementFloor,      setElementFloor]       = useState({})
  const [proyectosGuardados, setProyectosGuardados] = useState([])
  const [currentStoragePath, setCurrentStoragePath] = useState(null)

  // ── Hooks ────────────────────────────────────────────────
  const { camionPos, camionDist, camionEstado, iniciarGPS, resetGPS } = useGps()

  const { elementos: speckleEls, loading: speckleLoading, error: speckleError,
          lastSync, load: loadSpeckle,
          setElementos: setSpeckleEls } = useSpeckle()
  
  const { stats: realStats, pedidos: pedidosStats, fetchPedidos } = usePedidosStats(ifcStats, currentUser) 
  
  const { scanModel, colorearEstado, highlightCategory,
          toggleWalls, toggleConcreteOnly, handleEstadoClick,
          elementFloorRef, concreteIdsRef, colorearPedidosDesdeSupabase,globalIdMapRef} = useIfc({
    viewerRef, currentModel, categoryIds, wallsVisible, concreteOnly,
    selectedEstado, setSelectedEstado, setCategoryIds, setIfcStats,
    setEstadoIds,
    setRemitos,   // ahora solo se usa para cargar remitos reales desde Supabase
    setModelData, setChatMessages,
    iniciarGPS,
    setActiveTab, supabase, currentUser,
    currentCat, setWallsVisible, setConcreteOnly, setCategoryLabels
  })

  // ── Speckle ──────────────────────────────────────────────
  useEffect(() => {
    loadSpeckle(
      import.meta.env.VITE_SPECKLE_PROJECT_ID,
      import.meta.env.VITE_SPECKLE_MODEL_ID
    )
  }, [loadSpeckle])

  const handleSpeckleEstadoChange = useCallback((id, estado) => {
    setSpeckleEls(prev => prev.map(e => e.id === id ? { ...e, estado } : e))
  }, [setSpeckleEls])

  // ── Supabase auth ─────────────────────────────────────────
  useEffect(() => {
    // Sesión activa al montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setCurrentUser(u)
      if (u) {
      fetchProyectosGuardados(u.id).then(proyectos => {
        setProyectosGuardados(proyectos)
        if (proyectos?.length) {
          // Esperar que el viewer esté inicializado
          console.log('proyectos al cargar:', proyectos)
          setTimeout(() => {
            handleCargarProyectoGuardado(proyectos[0])
          }, 1000)
        }
      })
    }
  })

    // Escuchar cambios de sesión (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setCurrentUser(u)
      if (u) cargarProyectosGuardados(u.id)
      else { setProyectosGuardados([]); setCurrentStoragePath(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Proyectos guardados en Storage ───────────────────────
  const cargarProyectosGuardados = async (userId) => {
    const proyectos = await fetchProyectosGuardados(userId)
    setProyectosGuardados(proyectos)
  }

  // Cargar un IFC guardado sin que el usuario vuelva a subir el archivo
  const handleCargarProyectoGuardado = async (proyecto) => {
  if (!viewerRef.current) return
  setLoading(true)
  setFileName(proyecto.file_name)
  setWallsVisible(true); setEstadoIds({}); setRemitos([]); setSelectedEstado(null)
  resetGPS()
  try {
    const url = getIfcUrl(proyecto.storage_path)
    const model = await viewerRef.current.IFC.loadIfcUrl(url)
    try {
  const { IFCSPACE } = await import('web-ifc')
  const mgr = viewerRef.current.IFC.loader.ifcManager
  const scene = viewerRef.current.context.getScene()
  const spaceIds = await mgr.getAllItemsOfType(model.modelID, IFCSPACE, false)
  if (spaceIds?.length) {
    // Crear subset invisible sin material
    mgr.createSubset({
      modelID: model.modelID,
      ids: spaceIds,
      scene,
      removePrevious: true,
      customID: 'hide-spaces',
    })
    // Ocultar el subset
    const subset = mgr.getSubset(model.modelID, undefined, 'hide-spaces')
    if (subset) subset.visible = false
  }
} catch(e) { console.warn('hideSpaces:', e.message) }
    setCurrentModel(model)
    setCurrentModel(model)
    setCurrentStoragePath(proyecto.storage_path)
    setLoading(false)
    setTimeout(async () => {
      try {
        const box = new THREE.Box3().setFromObject(model)
        const ctrl = viewerRef.current.context.ifcCamera.cameraControls
        await ctrl.fitToBox(box, true)
        const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
        ctrl.setLookAt(c.x, c.y + Math.max(s.x, s.y, s.z), c.z + Math.max(s.x, s.y, s.z) * 2, c.x, c.y, c.z, true)
      } catch (e) { console.log('cam:', e.message) }
      try {
        await scanModel(model.modelID, proyecto.file_name, proyecto.storage_path)
        setElementFloor(elementFloorRef.current)
        await colorearPedidosDesdeSupabase(model.modelID)
      } catch (e) {
        console.error('scan:', e)
      } finally {
        setLoading(false)
      }
    }, 2000)
  } catch (err) {
    alert('Error al cargar proyecto: ' + err.message)
    setLoading(false)
  }
}
  // ── Supabase storage (upload nuevo archivo) ──────────────
  const uploadToStorage = async (file) => {
    if (!currentUser) return null
    const path = `${currentUser.id}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage
      .from('ifc-models').upload(path, file, { upsert: false })
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
    // Refrescar lista de proyectos guardados
    await cargarProyectosGuardados(currentUser.id)
  }

  // ── IFC viewer init ──────────────────────────────────────
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
  }, [])

  // ── Handle IFC file (nuevo upload) ──────────────────────
  const handleFile = async (file) => {
    if (!file || !viewerRef.current) return
    setLoading(true)
    setFileSize((file.size / 1024 / 1024).toFixed(1) + ' MB')
    setFileName(file.name)
    setWallsVisible(true); setEstadoIds({}); setRemitos([]); setSelectedEstado(null)
    resetGPS()
    const url = URL.createObjectURL(file)
    try {
      const model = await viewerRef.current.IFC.loadIfcUrl(url)
      try {
  const { IFCSPACE } = await import('web-ifc')
  const mgr = viewerRef.current.IFC.loader.ifcManager
  const scene = viewerRef.current.context.getScene()
  const spaceIds = await mgr.getAllItemsOfType(model.modelID, IFCSPACE, false)
  if (spaceIds?.length) {
    // Crear subset invisible sin material
    mgr.createSubset({
      modelID: model.modelID,
      ids: spaceIds,
      scene,
      removePrevious: true,
      customID: 'hide-spaces',
    })
    // Ocultar el subset
    const subset = mgr.getSubset(model.modelID, undefined, 'hide-spaces')
    if (subset) subset.visible = false
  }
} catch(e) { console.warn('hideSpaces:', e.message) }
      setCurrentModel(model)
      setLoading(false)
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
          setCurrentStoragePath(sp)
          await scanModel(model.modelID, file.name, sp)
          setElementFloor(elementFloorRef.current)
          // ifcStats.concrete ya se setea dentro de scanModel vía setIfcStats ✓
        } catch (e) { console.error('scan:', e) }
      }, 2000)
    } catch (err) {
      alert('Error al cargar: ' + err.message)
      setLoading(false)
      URL.revokeObjectURL(url)
    }
  }
 const handleAdjudicarCotizacion = useCallback(async ({ cotizacion, pedido, userOverride }) => {
  const activeUser = userOverride ?? currentUser
  if (!activeUser) return alert('Sesión expirada')
  try {
    const remito = await adjudicarCotizacion({
      cotizacion, pedido, user: activeUser,
      ifcViewer: null
    })
    if (pedido.elementos_ifc?.length) {
      const ids = pedido.elementos_ifc.flatMap(e => e.ids)
     
      colorearEstado('adjudicado', ids)
    }
    setRemitos(prev => [remito, ...prev])
    setActiveTab('remitos')
  } catch (err) {
    console.error(err)
    alert('Error al adjudicar: ' + err.message)
  }
}, [currentUser, currentModel, colorearEstado])
  // ── Cambio de estado de piezas desde Sidebar/Marketplace ─
  const handlePedidoEstado = useCallback((ids, estado) => {
    colorearEstado(estado, ids)
    if (estado === 'en_camino') iniciarGPS()
    // Los remitos ya no se generan acá — se crean al adjudicar cotización
  }, [colorearEstado, iniciarGPS])

  // ── Chat IA ──────────────────────────────────────────────
  const sendMessage = async () => {
    if (!chatInput.trim() || !modelData || chatLoading) return
    const q = chatInput.trim(); setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', text: q }])
    setChatLoading(true)
    try {
      const res = await fetch(API_URL + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, model_data: modelData })
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', text: data.answer }])
    } catch (_) {
      setChatMessages(prev => [...prev, { role: 'assistant error', text: 'Error al conectar con el servidor.' }])
    }
    setChatLoading(false)
  }

  // ── Derived values ───────────────────────────────────────
  const totalCatIds     = Object.values(categoryIds).flat().length
  const remitosFiltered = selectedEstado ? remitos.filter(r => r.estado === selectedEstado) : remitos
   
  if (!currentUser && !loading) return <LoginForm />

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>


      <div className="main-container">
        <Sidebar
          className={activeTab === 'dashboard' ? 'sidebar-bi' : ''}
          activeTab={activeTab} setActiveTab={setActiveTab}
          currentModel={currentModel} fileName={fileName}
          categoryIds={categoryIds} totalCatIds={totalCatIds}
          currentCat={currentCat} setCurrentCat={setCurrentCat}
          highlightCategory={highlightCategory}
          wallsVisible={wallsVisible} toggleWalls={toggleWalls}
          concreteOnly={concreteOnly} toggleConcreteOnly={toggleConcreteOnly}
          estadoIds={estadoIds} selectedEstado={selectedEstado}
          handleEstadoClick={handleEstadoClick} colorearEstado={colorearEstado}
          modelData={modelData} chatMessages={chatMessages}
          chatInput={chatInput} setChatInput={setChatInput}
          chatLoading={chatLoading} sendMessage={sendMessage}
          remitosFiltered={remitosFiltered}
          camionPos={camionPos} camionDist={camionDist} camionEstado={camionEstado}
          speckleEls={speckleEls} speckleLoading={speckleLoading} speckleError={speckleError}
          speckleStats={realStats} lastSync={lastSync}
          pedidosStats={pedidosStats}
          loadSpeckle={loadSpeckle} handleSpeckleEstadoChange={handleSpeckleEstadoChange}
          onSelectionChange={(ids) => console.log('seleccionados:', ids)}
          elementFloor={elementFloor}
          concreteIds={concreteIdsRef.current}
          onPedidoEstado={handlePedidoEstado}
          // Nuevas props
          user={currentUser}
          ifcViewer={viewerRef}
          ifcStats={ifcStats}
          onAdjudicarCotizacion={handleAdjudicarCotizacion}
          proyectosGuardados={proyectosGuardados}
          onCargarProyectoGuardado={handleCargarProyectoGuardado}
          globalIdMap={globalIdMapRef.current}
        />

        <ViewerArea
          currentModel={currentModel}
          loading={loading}
          fileInputRef={fileInputRef}
          handleFile={handleFile}
          ifcStats={ifcStats}
          fileSize={fileSize}
          speckleStats={realStats}
          viewerRef={viewerRef}
        />
      </div>

    </div>
  )
}