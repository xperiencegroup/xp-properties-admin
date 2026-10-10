import { supabase } from './supabaseClient'

export type Project = {
  id: string
  nombre: string
  assets_table: string
  groups_table: string
  admins_table: string
  bucket: string
  sort_order: number
  activo: boolean
}

/** Proyectos activos del registro donde el usuario está dado de alta como admin. */
export async function loadMyProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('xp_properties_master')
    .select('*')
    .eq('activo', true)
    .order('sort_order')
  if (error) throw error

  const projects = (data ?? []) as Project[]
  const checks = await Promise.all(
    projects.map((p) =>
      supabase.from(p.admins_table).select('user_id').eq('user_id', userId).maybeSingle(),
    ),
  )
  return projects.filter((_, i) => !checks[i].error && checks[i].data)
}
