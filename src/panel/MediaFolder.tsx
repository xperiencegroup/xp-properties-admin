import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import MediaCard from './MediaCard'
import type { Folder, Slot } from './mediaAdmin'
import type { PendingDrop } from './ProjectPanel'
import type { Project } from '../lib/projects'
import './MediaFolder.css'

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer.types).includes('Files')
}

export default function MediaFolder({
  project,
  folder,
  onDropFiles,
  onLabelSaved,
}: {
  project: Project
  folder: Folder
  onDropFiles: (p: PendingDrop) => void
  onLabelSaved: () => void
}) {
  const [open, setOpen] = useState(true)
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return
    depth.current += 1
    setOver(true)
  }
  function onDragLeave() {
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setOver(false)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    if ((e.nativeEvent as globalThis.DragEvent & { handledByCard?: boolean }).handledByCard) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onDropFiles({ files, scope: folder.slots })
  }

  const videos = folder.slots.filter((s) => (s.content_type ?? '').startsWith('video')).length
  const count = folder.slots.length

  return (
    <section
      className={`media-folder ${over ? 'is-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        className="media-folder__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="media-folder__arrow" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="media-folder__title">{folder.title}</span>
        <span className="media-folder__meta mono">
          {folder.name}/ — {count} {count === 1 ? 'archivo' : 'archivos'}
          {videos > 0 && videos < count ? `, ${videos} videos` : ''}
        </span>
      </button>

      {over && (
        <div className="media-folder__drop-hint mono">
          Suelta para reemplazar en {folder.title}
        </div>
      )}

      {open && (
        <div className="media-folder__grid">
          {folder.slots.map((slot: Slot) => (
            <MediaCard
              key={slot.uid}
              project={project}
              slot={slot}
              onFiles={(files) => onDropFiles({ files, scope: folder.slots, target: slot })}
              onLabelSaved={onLabelSaved}
            />
          ))}
        </div>
      )}
    </section>
  )
}
