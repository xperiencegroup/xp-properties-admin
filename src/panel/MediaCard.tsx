import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { baseName, codeOf, isVideoSlot, publicUrl, updateLabel } from './mediaAdmin'
import type { Slot } from './mediaAdmin'
import type { Project } from '../lib/projects'
import './MediaCard.css'

export default function MediaCard({
  project,
  slot,
  onFiles,
  onLabelSaved,
}: {
  project: Project
  slot: Slot
  onFiles: (files: File[]) => void
  onLabelSaved: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [over, setOver] = useState(false)
  const [label, setLabel] = useState(slot.label ?? '')
  const [savingLabel, setSavingLabel] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)

  const url = publicUrl(slot)
  const video = isVideoSlot(slot)
  const code = slot.storage_path ? codeOf(slot.storage_path) : null
  const labelChanged = label.trim() !== (slot.label ?? '')

  function onDrop(e: DragEvent) {
    e.preventDefault()
    ;(e.nativeEvent as globalThis.DragEvent & { handledByCard?: boolean }).handledByCard = true
    depth.current = 0
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFiles([file])
  }

  async function saveLabel() {
    setSavingLabel(true)
    setLabelError(null)
    try {
      await updateLabel(project, slot, label)
      onLabelSaved()
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : 'No se pudo guardar la etiqueta')
    } finally {
      setSavingLabel(false)
    }
  }

  return (
    <article
      className={`media-card ${over ? 'is-over' : ''}`}
      onDragEnter={() => {
        depth.current += 1
        setOver(true)
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <button
        className="media-card__thumb"
        onClick={() => inputRef.current?.click()}
        title="Elegir un archivo para reemplazar este"
      >
        {url && video && (
          <video src={`${url}#t=0.5`} preload="metadata" muted playsInline />
        )}
        {url && !video && <img src={url} alt="" loading="lazy" />}
        {!url && <span className="media-card__empty mono">Vacío</span>}
        {code && <span className="media-card__code mono">{code}</span>}
        <span className="media-card__replace mono">{over ? 'Soltar aquí' : 'Reemplazar'}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="video/mp4,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFiles([f])
          e.target.value = ''
        }}
      />

      <div className="media-card__body">
        <span className="media-card__title">{slot.title}</span>
        <span className="media-card__file mono" title={slot.storage_path ?? ''}>
          {slot.storage_path ? baseName(slot.storage_path) : 'Sin archivo'}
        </span>

        {slot.kind === 'group' && (
          <div className="media-card__label">
            <input
              type="text"
              value={label}
              placeholder="Etiqueta (opcional)"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && labelChanged && saveLabel()}
            />
            {labelChanged && (
              <button onClick={saveLabel} disabled={savingLabel}>
                {savingLabel ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
        )}
        {labelError && <span className="media-card__error">{labelError}</span>}
      </div>
    </article>
  )
}
