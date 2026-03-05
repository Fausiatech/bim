import { useRef, useState, useCallback, useEffect } from 'react'
import { OBRA, PLANTA } from '../constants'

function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function interpolar(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

export function useGps() {
  const gpsIntervalRef = useRef(null)
  const gpsProgressRef = useRef(0)

  const [camionPos,    setCamionPos]    = useState(null)
  const [camionDist,   setCamionDist]   = useState(null)
  const [camionEstado, setCamionEstado] = useState('en_ruta')

  const iniciarGPS = useCallback(() => {
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
    gpsProgressRef.current = 0
    gpsIntervalRef.current = setInterval(() => {
      gpsProgressRef.current = Math.min(gpsProgressRef.current + 0.008, 1)
      const pos  = interpolar(PLANTA, OBRA, gpsProgressRef.current)
      const dist = distKm(pos, OBRA)
      setCamionPos(pos)
      setCamionDist(dist)
      if (dist <= 6) setCamionEstado('proximo')
      if (gpsProgressRef.current >= 1) {
        setCamionEstado('entregado')
        clearInterval(gpsIntervalRef.current)
      }
    }, 1000)
  }, [])

  const resetGPS = useCallback(() => {
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
    setCamionPos(null)
    setCamionDist(null)
    setCamionEstado('en_ruta')
  }, [])

  useEffect(() => () => {
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
  }, [])

  return { camionPos, camionDist, camionEstado, iniciarGPS, resetGPS }
}