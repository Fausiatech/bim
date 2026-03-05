import * as THREE from 'three'

export default function ViewerArea({
  currentModel,
  loading,
  fileInputRef,
  handleFile,
  ifcStats,
  fileSize,
  speckleStats,
  viewerRef,
}) {
  return (
    <div className="viewer-area">
      {currentModel && (
        <div className="info-cards">
          <div className="info-card">
            <div className="info-card-label">Total elementos</div>
            <div className="info-card-value">{ifcStats.total.toLocaleString()}</div>
          </div>
          <div className="info-card">
            <div className="info-card-label">Volumen hormigón</div>
            <div className="info-card-value">{ifcStats.volume > 0 ? ifcStats.volume.toFixed(1) : '0'} <small style={{ fontSize: '1rem' }}>m³</small></div>
          </div>
          <div className="info-card">
            <div className="info-card-label">Hormigón detectado</div>
            <div className="info-card-value">{ifcStats.concrete}</div>
          </div>
          <div className="info-card">
            <div className="info-card-label">Archivo</div>
            <div className="info-card-value" style={{ fontSize: '1.2rem' }}>{fileSize}</div>
          </div>
          {speckleStats.total > 0 && (
            <div className="info-card" style={{ borderTop: '3px solid #22c55e' }}>
              <div className="info-card-label">Avance Speckle</div>
              <div className="info-card-value" style={{ color: '#22c55e' }}>{speckleStats.avance}%</div>
            </div>
          )}
        </div>
      )}

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
  )
}