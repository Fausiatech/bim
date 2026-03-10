import { supabase } from '../supabase'

/**
 * Trae todos los proyectos IFC guardados por el usuario
 */
export async function fetchProyectosGuardados(userId) {
  const { data, error } = await supabase
    .from('ifc_analyses')
    .select('id, file_name, storage_path, concrete_volume, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) { console.error('fetchProyectosGuardados:', error.message); return [] }
  return data ?? []
}

/**
 * Devuelve la URL pública de un archivo en Supabase Storage
 */
export function getIfcUrl(storagePath) {
  const { data } = supabase.storage
    .from('ifc-models')
    .getPublicUrl(storagePath)
  return data.publicUrl
}