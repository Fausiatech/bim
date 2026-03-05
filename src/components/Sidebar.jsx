import SpeckleDashboard from './SpeckleDashboard'
import { CATEGORIES, ESTADOS_IFC, OBRA, PLANTA } from '../constants'

export default function Sidebar({
  // tabs
  activeTab, setActiveTab,
  // modelo
  currentModel, fileName,
  categoryIds, totalCatIds,
  currentCat, setCurrentCat,
  highlightCategory,
  // visibilidad
  wallsVisible, toggleWalls,
  concreteOnly, toggleConcreteOnly,
  // estados
  estadoIds, selectedEstado,
  handleEstadoClick, colorearEstado,
  // chat
  modelData, chatMessages, chatInput, setChatInput,
  chatLoading, sendMessage,
  // remitos
  remitosFiltered,
  // GPS
  camionPos, camionDist, camionEstado,
  // speckle
  speckleEls, speckleLoading, speckleError,
  speckleStats, lastSync, projectName,
  loadSpeckle, handleSpeckleEstadoChange,
}) {
  const gpsBannerColor = camionEstado === 'proximo' ? '#FFC107' : camionEstado === 'entregado' ? '#4CAF50' : '#607D8B'
  const gpsBannerText = camionEstado === 'proximo'
    ? `🚚 Camión a ${camionDist?.toFixed(1)} km — ¡Próxima entrega!`
    : camionEstado === 'entregado' ? '✅ Entrega completada en obra'
    : `🚚 En ruta · ${camionDist?.toFixed(1) ?? '...'} km a la obra`

  const sidebarTabs = [
    ['categorias', 'Modelo'],
    ['remitos',    'Remitos'],
    ['dashboard',  '📊 BI'],
  ]

  return (
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
                <span className="cat-count">{key === 'all' ? totalCatIds : (categoryIds[key]?.length ?? 0)}</span>
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
                <span onClick={() => { colorearEstado(null, []) }}
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

      </div>
    </aside>
  )
}
          
         