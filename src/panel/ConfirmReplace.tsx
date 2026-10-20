import { useEffect, useMemo, useState } from 'react'
import { baseName, isVideoFile, isVideoSlot, matchFile, publicUrl, replaceMedia } from './mediaAdmin'
import type { PendingDrop } from './ProjectPanel'
import type { Project } from '../lib/projects'
import './ConfirmReplace.css'

type RowState = 'idle' | 'uploading' | 'done' | 'error'

type Row = {
  file: File
  target: string // uid del slot destino ('' = sin elegir)
  reason: 'tarjeta' | 'nombre' | 'número' | 'único' | null
  state: RowState
  error: string | null
}

export default function ConfirmReplace({
  project,
  pending,
  onCancel,
  onDone,
}: {
  project: Project
  pending: PendingDrop
  onCancel: () => void
  onDone: (count: number) => void
}) {
  const { scope, target } = pending
  const files = target ? pending.files.slice(0, 1) : pending.files

  const [rows, setRows] = useState<Row[]>(() =>
    files.map((file): Row => {
      const m = target ? null : matchFile(file, scope)
      return {
        file,
        target: target?.uid ?? m?.slot.uid ?? '',
        reason: target ? 'tarjeta' : m?.reason ?? null,
        state: 'idle',
        error: null,
      }
    }),
  )
  const [running, setRunning] = useState(false)

  // Las vistas previas se crean en un efecto: así StrictMode (que monta dos veces en DEV)
  // no revoca las URLs mientras todavía se están mostrando.
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !running && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onCancel])

  const slotByUid = useMemo(() => new Map(scope.map((s) => [s.uid, s])), [scope])

  // Validaciones por fila
  const problems = rows.map((r, i) => {
    const slot = slotByUid.get(r.target)
    if (!slot) return 'Elige qué archivo se reemplaza.'
    if (isVideoSlot(slot) !== isVideoFile(r.file))
      return isVideoSlot(slot) ? 'Este espacio es de video; el archivo es una imagen.' : 'Este espacio es de imagen; el archivo es un video.'
    if (rows.some((o, j) => j !== i && o.target === r.target))
      return 'Dos archivos apuntan al mismo destino.'
    return null
  })
  const pendingRows = rows.filter((r) => r.state !== 'done')
  const canConfirm = !running && pendingRows.length > 0 && rows.every((r, i) => r.state === 'done' || !problems[i])

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function confirm() {
    setRunning(true)
    let ok = rows.filter((r) => r.state === 'done').length
    let failed = false
    for (const [i, r] of rows.entries()) {
      if (r.state === 'done') continue
      const slot = slotByUid.get(r.target)!
      setRow(i, { state: 'uploading', error: null })
      try {
        await replaceMedia(project, slot, r.file)
        setRow(i, { state: 'done' })
        ok++
      } catch (e) {
        failed = true
        setRow(i, { state: 'error', error: e instanceof Error ? e.message : 'Error al subir' })
      }
    }
    setRunning(false)
    if (!failed) onDone(ok)
  }

  const single = rows.length === 1

  return (
    <div className="confirm-replace" role="dialog" aria-modal="true" aria-labelledby="confirm-replace-title">
      <div className="confirm-replace__panel">
        <h2 id="confirm-replace-title" className="confirm-replace__title">
          {single ? 'Reemplazar archivo' : `Reemplazar ${rows.length} archivos`}
        </h2>
        <p className="confirm-replace__lead">
          El archivo actual se borrará y el sitio mostrará el nuevo de inmediato. No se puede deshacer.
        </p>

        <ul className="confirm-replace__rows">
          {rows.map((r, i) => {
            const slot = slotByUid.get(r.target)
            const current = slot ? publicUrl(slot) : null
            const fileIsVideo = isVideoFile(r.file)
            return (
              <li key={i} className={`confirm-replace__row is-${r.state}`}>
                <figure className="confirm-replace__media">
                  {current && slot && isVideoSlot(slot) && <video src={`${current}#t=0.5`} muted preload="metadata" />}
                  {current && slot && !isVideoSlot(slot) && <img src={current} alt="" />}
                  {!current && <span className="confirm-replace__blank" />}
                  <figcaption className="mono">Actual</figcaption>
                </figure>

                <span className="confirm-replace__arrow" aria-hidden>
                  ▸
                </span>

                <figure className="confirm-replace__media">
                  {!previews[i] ? (
                    <span className="confirm-replace__blank" />
                  ) : fileIsVideo ? (
                    <video src={previews[i]} muted autoPlay loop playsInline />
                  ) : (
                    <img src={previews[i]} alt="" />
                  )}
                  <figcaption className="mono">Nuevo</figcaption>
                </figure>

                <div className="confirm-replace__info">
                  <span className="confirm-replace__file mono">{r.file.name}</span>
                  <span className="confirm-replace__size mono">{(r.file.size / 1024 / 1024).toFixed(1)} MB</span>

                  {(r.reason === 'tarjeta' || r.reason === 'único') && slot ? (
                    <span className="confirm-replace__target">
                      Reemplaza a <strong>{slot.title}</strong>
                      <span className="mono"> ({baseName(slot.storage_path ?? '')})</span>
                    </span>
                  ) : (
                    <label className="confirm-replace__select">
                      <span>Reemplaza a</span>
                      <select
                        value={r.target}
                        disabled={running || r.state === 'done'}
                        onChange={(e) => setRow(i, { target: e.target.value, reason: null })}
                      >
                        <option value="">Elegir…</option>
                        {scope.map((s) => (
                          <option key={s.uid} value={s.uid}>
                            {s.title} — {baseName(s.storage_path ?? '')}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {r.reason === 'nombre' && (
                    <span className="confirm-replace__note">Ya existe un archivo con el mismo nombre: se sobrescribirá.</span>
                  )}
                  {r.reason === 'número' && (
                    <span className="confirm-replace__note">Detectado por el número del archivo. Revisa que sea el correcto.</span>
                  )}

                  {r.state === 'idle' && problems[i] && <span className="confirm-replace__error">{problems[i]}</span>}
                  {r.state === 'uploading' && <span className="confirm-replace__progress mono">Subiendo…</span>}
                  {r.state === 'done' && <span className="confirm-replace__ok mono">Actualizado</span>}
                  {r.state === 'error' && <span className="confirm-replace__error">{r.error}</span>}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="confirm-replace__actions">
          <button className="confirm-replace__cancel" onClick={onCancel} disabled={running}>
            Cancelar
          </button>
          <button className="confirm-replace__confirm" onClick={confirm} disabled={!canConfirm}>
            {running ? 'Subiendo…' : single ? 'Reemplazar' : `Reemplazar ${pendingRows.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
