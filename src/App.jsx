import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { createClient } from '@supabase/supabase-js'
import { useSpeckle } from './hooks/useSpeckle'
import { useGps } from './hooks/useGps'
import { useIfc } from './hooks/useIfc'
import Sidebar from './components/Sidebar'
import ViewerArea from './components/ViewerArea'
import { API_URL } from './constants'
import './App.css'

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

function generarRemitos(estadoIds) {
  const RESISTENCIAS = ['H-17', 'H-21', 'H-25', 'H-30', 'H-35']
  const PATENTES     = ['AA 123 BB', 'CC 456 DD', 'EE 789 FF', 'GG 012 HH']
  const CHOFERES     = ['García, Carlos', 'López, Mario', 'Fernández, Juan', 'Rodríguez, Pedro']
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
  const viewerRef    = useRef(null)
  const fileInputRef = useRef(null)

  const [currentModel,   setCurrentModel]   = useState(null)
  const [currentCat,     setCurrentCat]     = useState('all')
  const [categoryIds,    setCategoryIds]    = useState({})
  const [modelData,      setModelData]      = useState(null)
  const [currentUser,    setCurrentUser]    = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [ifcStats,       setIfcStats]       = useState({ total: 0, volume: 0, concrete: 0, steel: 0, none: 0 })
  const [fileSize,       setFileSize]       = useState('')
  const [fileName,       setFileName]       = useState('')
  const [chatMessages,   setChatMessages]   = useState([])
  const [chatInput,      setChatInput]      = useState('')
  const [chatLoading,    setChatLoading]    = useState(false)
  const [wallsVisible,   setWallsVisible]   = useState(true)
  const [concreteOnly,   setConcreteOnly]   = useState(false)
  const [estadoIds,      setEstadoIds]      = useState({})
  const [activeTab,      setActiveTab]      = useState('categorias')
  const [selectedEstado, setSelectedEstado] = useState(null)
  const [remitos,        setRemitos]        = useState([])

  // ── Hooks ───────────────────────────────────────────────
  const { camionPos, camionDist, camionEstado, iniciarGPS, resetGPS } = useGps()

  const { elementos: speckleEls, loading: speckleLoading, error: speckleError,
          lastSync, projectName, stats: speckleStats, load: loadSpeckle,
          setElementos: setSpeckleEls } = useSpeckle()

  const { scanModel, colorearEstado, highlightCategory,
          toggleWalls, toggleConcreteOnly, handleEstadoClick } = useIfc({
    viewerRef, currentModel, categoryIds, wallsVisible, concreteOnly,
    selectedEstado, setSelectedEstado, setCategoryIds, setIfcStats,
    setEstadoIds, setRemitos, setModelData, setChatMessages,
    iniciarGPS, generarRemitos, setActiveTab, supabase, currentUser, currentCat, setWallsVisible, setConcreteOnly
  })
  // ── Speckle ─────────────────────────────────────────────
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

  

  // ── Handle IFC file ─────────────────────────────────────
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

  // ── Derived values ──────────────────────────────────────
  const totalCatIds     = Object.values(categoryIds).flat().length
  const remitosFiltered = selectedEstado ? remitos.filter(r => r.estado === selectedEstado) : remitos

  // ── Render ──────────────────────────────────────────────
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
        <Sidebar
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
          speckleStats={speckleStats} lastSync={lastSync} projectName={projectName}
          loadSpeckle={loadSpeckle} handleSpeckleEstadoChange={handleSpeckleEstadoChange}
        />

        <ViewerArea
          currentModel={currentModel}
          loading={loading}
          fileInputRef={fileInputRef}
          handleFile={handleFile}
          ifcStats={ifcStats}
          fileSize={fileSize}
          speckleStats={speckleStats}
          viewerRef={viewerRef}
        />
      </div>

    </div>
  )
}