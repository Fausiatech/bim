export const CATEGORIES = {
  all:      { label: 'Todo',        codes: [160246688, 3303938423, 3732776249, 2233826070, 3875453745, 753842376], color: null },
  beams:    { label: 'Vigas',       codes: [160246688],                          color: '#2196F3' },
  columns:  { label: 'Columnas',    codes: [3303938423],                         color: '#F44336' },
  slabs:    { label: 'Losas',       codes: [3732776249, 1410488051, 2533272240], color: '#4CAF50' },
  footings: { label: 'Fundaciones', codes: [2233826070],                         color: '#FF9800' },
  members:  { label: 'Miembros',    codes: [3875453745],                         color: '#9C27B0' },
  walls:    { label: 'Muros',       codes: [753842376],                          color: '#607D8B' },
}

export const ESTADOS_IFC = {
  entregado: { label: 'Entregado', color: '#4CAF50', three: 0x4CAF50, icon: '✅' },
  en_camino: { label: 'En camino', color: '#FFC107', three: 0xFFC107, icon: '🚚' },
  pendiente: { label: 'Pendiente', color: '#F44336', three: 0xF44336, icon: '🔴' },
}

export const OBRA   = { lat: -31.4167, lng: -64.1833, nombre: 'Obra Av. Colón 1200, Córdoba' }
export const PLANTA = { lat: -31.3500, lng: -64.2200, nombre: 'Hormigonera Norte Cba' }

export const RESISTENCIAS = ['H-17', 'H-21', 'H-25', 'H-30', 'H-35']
export const PATENTES     = ['AA 123 BB', 'CC 456 DD', 'EE 789 FF', 'GG 012 HH']
export const CHOFERES     = ['García, Carlos', 'López, Mario', 'Fernández, Juan', 'Rodríguez, Pedro']

export const API_URL = 'http://localhost:8000'