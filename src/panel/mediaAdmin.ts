import { supabase } from '../lib/supabaseClient'
import type { Project } from '../lib/projects'

export type MediaAssetRecord = {
  key: string
  storage_path: string | null
  bucket: string
  content_type: string | null
  updated_at: string
}

export type MediaGroupRecord = {
  id: string
  group_key: string
  sort_order: number
  storage_path: string
  label: string | null
  bucket: string
  content_type: string | null
  updated_at: string
}

/** Un "archivo" del panel: puede venir de media_assets o de media_groups. */
export type Slot = {
  uid: string // 'a:<key>' | 'g:<id>'
  kind: 'asset' | 'group'
  ref: string // key (asset) o id (group)
  title: string
  label: string | null
  storage_path: string | null
  bucket: string
  content_type: string | null
  updated_at: string
  folder: string
  order: number
}

export type Folder = { name: string; title: string; slots: Slot[] }

const FOLDER_TITLES: Record<string, string> = {
  portada: 'Portada',
  navorbital: 'Navegación orbital',
  vtiproyecto: 'Video tour',
  fotorenders: 'Foto renders',
  recorrido360: 'Recorrido 360',  
}
const FOLDER_ORDER = Object.keys(FOLDER_TITLES)

const SUFFIX: Record<string, string> = { idle: 'idle', trans: 'transición', rev: 'reversa' }

/** Último segmento de la ruta. */
export function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

/** Nombre sin el prefijo de timestamp que agrega el panel ("1788284130504-"). */
export function baseName(pathOrName: string): string {
  return fileName(pathOrName).replace(/^\d{13}-/, '')
}

/** Código del archivo: "3", "4R", "10R", "FOTO1"… o null si no sigue la convención. */
export function codeOf(pathOrName: string): string | null {
  const n = baseName(pathOrName).trim()
  const num = n.match(/^(\d+)(R?)(?=[\s_.-])/i)
  if (num) return `${Number(num[1])}${num[2].toUpperCase()}`
  const foto = n.match(/^foto[\s_-]*(\d+)/i)
  if (foto) return `FOTO${Number(foto[1])}`
  return null
}

function codeOrder(path: string | null): number {
  const code = path ? codeOf(path) : null
  if (!code) return 9999
  const m = code.match(/(\d+)(R?)$/)
  return m ? Number(m[1]) * 2 + (m[2] ? 1 : 0) : 9999
}

const KEY_TITLES: Record<string, string> = {
  'image.recorrido360': 'Imagen 360',
}


function assetTitle(key: string): string {
  if (KEY_TITLES[key]) return KEY_TITLES[key]
  const parts = key.replace(/^video\.(masterplan\.)?(positions\.)?/, '').split('.')
  const last = parts.pop() ?? ''
  return [...parts, SUFFIX[last] ?? last].join(' ')
}

export function isVideoSlot(slot: Slot): boolean {
  if (slot.content_type) return slot.content_type.startsWith('video')
  return /\.(mp4|webm|mov)$/i.test(slot.storage_path ?? '')
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video') || /\.(mp4|webm|mov)$/i.test(file.name)
}

export function publicUrl(slot: Slot): string | null {
  if (!slot.storage_path) return null
  const { data } = supabase.storage.from(slot.bucket).getPublicUrl(slot.storage_path)
  return `${data.publicUrl}?v=${Date.parse(slot.updated_at) || 0}`
}

export function buildFolders(assets: MediaAssetRecord[], groups: MediaGroupRecord[]): Folder[] {
  const slots: Slot[] = [
    ...assets.map((a) => ({
      uid: `a:${a.key}`,
      kind: 'asset' as const,
      ref: a.key,
      title: assetTitle(a.key),
      label: null,
      storage_path: a.storage_path,
      bucket: a.bucket,
      content_type: a.content_type,
      updated_at: a.updated_at,
      folder: a.storage_path?.split('/')[0] ?? 'sin-carpeta',
      order: codeOrder(a.storage_path),
    })),
    ...groups.map((g) => ({
      uid: `g:${g.id}`,
      kind: 'group' as const,
      ref: g.id,
      title: g.label || `Elemento ${g.sort_order + 1}`,
      label: g.label,
      storage_path: g.storage_path,
      bucket: g.bucket,
      content_type: g.content_type,
      updated_at: g.updated_at,
      folder: g.storage_path.split('/')[0] || 'sin-carpeta',
      order: g.sort_order,
    })),
  ]

  const byFolder = new Map<string, Slot[]>()
  for (const s of slots) {
    if (!byFolder.has(s.folder)) byFolder.set(s.folder, [])
    byFolder.get(s.folder)!.push(s)
  }

  const rank = (n: string) => {
    const i = FOLDER_ORDER.indexOf(n)
    return i === -1 ? 99 : i
  }

  return [...byFolder.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, list]) => ({
      name,
      title: FOLDER_TITLES[name] ?? name,
      slots: list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
}

export type Match = { slot: Slot; reason: 'nombre' | 'número' | 'único' }

/** Busca a qué archivo de la carpeta corresponde el archivo soltado. */
export function matchFile(file: File, slots: Slot[]): Match | null {
  const name = baseName(file.name).toLowerCase()
  const byName = slots.find((s) => s.storage_path && baseName(s.storage_path).toLowerCase() === name)
  if (byName) return { slot: byName, reason: 'nombre' }

  const code = codeOf(file.name)
  if (code) {
    const byCode = slots.filter((s) => s.storage_path && codeOf(s.storage_path) === code)
    if (byCode.length === 1) return { slot: byCode[0], reason: 'número' }
  }

  // Carpeta con un solo archivo (ej. Recorrido 360): no hay nada que elegir.
  if (slots.length === 1) return { slot: slots[0], reason: 'único' }
  return null
}

/** Lee los archivos de un proyecto (sus dos tablas de media). */
export async function loadProjectMedia(project: Project): Promise<Folder[]> {
  const [a, g] = await Promise.all([
    supabase.from(project.assets_table).select('*').order('key'),
    supabase.from(project.groups_table).select('*').order('group_key').order('sort_order'),
  ])
  const err = a.error ?? g.error
  if (err) throw err
  return buildFolders((a.data ?? []) as MediaAssetRecord[], (g.data ?? []) as MediaGroupRecord[])
}

/** Sube el archivo nuevo, actualiza la tabla y borra el anterior ("último gana"). */
export async function replaceMedia(project: Project, slot: Slot, file: File): Promise<void> {
  const folder = slot.storage_path?.split('/').slice(0, -1).join('/') || slot.folder || 'misc'
  const newPath = `${folder}/${Date.now()}-${file.name}`
  const contentType = file.type || (isVideoFile(file) ? 'video/mp4' : 'image/jpeg')

  const { error: upErr } = await supabase.storage
    .from(slot.bucket)
    .upload(newPath, file, { contentType })
  if (upErr) throw upErr

  const values = {
    storage_path: newPath,
    content_type: contentType,
    updated_at: new Date().toISOString(),
  }
  const { error: dbErr } =
    slot.kind === 'asset'
      ? await supabase.from(project.assets_table).update(values).eq('key', slot.ref)
      : await supabase.from(project.groups_table).update(values).eq('id', slot.ref)

  if (dbErr) {
    // La tabla no cambió: se borra el archivo recién subido para no dejar huérfanos.
    await supabase.storage.from(slot.bucket).remove([newPath])
    throw dbErr
  }

  if (slot.storage_path && slot.storage_path !== newPath) {
    await supabase.storage.from(slot.bucket).remove([slot.storage_path])
  }
}

export async function updateLabel(project: Project, slot: Slot, label: string): Promise<void> {
  const { error } = await supabase
    .from(project.groups_table)
    .update({ label: label.trim() === '' ? null : label.trim(), updated_at: new Date().toISOString() })
    .eq('id', slot.ref)
  if (error) throw error
}
