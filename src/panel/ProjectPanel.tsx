import { useCallback, useEffect, useState } from 'react'
import MediaFolder from './MediaFolder'
import ConfirmReplace from './ConfirmReplace'
import { loadProjectMedia } from './mediaAdmin'
import type { Folder, Slot } from './mediaAdmin'
import type { Project } from '../lib/projects'
import './ProjectPanel.css'

export type PendingDrop = { files: File[]; scope: Slot[]; target?: Slot }

export default function ProjectPanel({ project }: { project: Project }) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDrop | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setFolders(await loadProjectMedia(project))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleDone(count: number) {
    setPending(null)
    setToast(count === 1 ? '1 archivo actualizado' : `${count} archivos actualizados`)
    await load()
  }

  return (
    <>
      {loading && <p className="project-panel__status">Cargando archivos de {project.nombre}…</p>}
      {loadError && (
        <p className="project-panel__status project-panel__status--error">
          No se pudieron cargar los archivos: {loadError}
        </p>
      )}
      {!loading && !loadError && folders.length === 0 && (
        <p className="project-panel__status">Este proyecto todavía no tiene archivos registrados.</p>
      )}

      {!loading && (
        <div className="project-panel__folders">
          {folders.map((f) => (
            <MediaFolder
              key={f.name}
              project={project}
              folder={f}
              onDropFiles={setPending}
              onLabelSaved={load}
            />
          ))}
        </div>
      )}

      {pending && (
        <ConfirmReplace
          project={project}
          pending={pending}
          onCancel={() => {
            setPending(null)
            load()
          }}
          onDone={handleDone}
        />
      )}

      {toast && (
        <div className="project-panel__toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
