import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { EMAIL_DOMAIN, login, logout, useSession } from './lib/auth'
import { loadMyProjects } from './lib/projects'
import type { Project } from './lib/projects'
import ProjectPanel from './panel/ProjectPanel'
import './App.css'

function getProjectFromUrl() {
  return new URLSearchParams(window.location.search).get('p')
}

function setProjectInUrl(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('p', id)
  window.history.replaceState(null, '', url)
}

function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await login(username, password))
    setBusy(false)
  }

  return (
    <div className="login">
      <form className="login__panel" onSubmit={submit}>
        <h1 className="login__title">Xperience Properties</h1>
        <p className="login__lead">Administra los archivos de tus proyectos.</p>

        <label className="login__field">
          <span>Usuario</span>
          <div className="login__user">
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <span className="mono">{EMAIL_DOMAIN}</span>
          </div>
        </label>

        <label className="login__field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="login__error">{error}</p>}

        <button className="login__submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default function App() {
  const { session, ready } = useSession()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [current, setCurrent] = useState<string | null>(getProjectFromUrl())
  const [error, setError] = useState<string | null>(null)

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      setProjects(null)
      return
    }
    loadMyProjects(userId)
      .then((list) => {
        setProjects(list)
        setCurrent((c) => (c && list.some((p) => p.id === c) ? c : list[0]?.id ?? null))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar proyectos'))
  }, [userId])

  // Evita que el navegador abra el archivo si se suelta fuera de una carpeta
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  useEffect(() => {
    if (current) setProjectInUrl(current)
  }, [current])

  if (!ready) return null
  if (!session) return <LoginScreen />

  const project = projects?.find((p) => p.id === current) ?? null

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__marca mono">Xperience Properties</span>
          {projects && projects.length > 0 && (
            <nav className="app__projects" aria-label="Proyectos">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`app__project ${p.id === current ? 'is-active' : ''}`}
                  onClick={() => setCurrent(p.id)}
                  aria-current={p.id === current}
                >
                  {p.nombre}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="app__session">
          <span className="app__email mono">{session.user.email}</span>
          <button className="app__logout" onClick={() => logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="app__main">
        {error && <p className="app__status app__status--error">{error}</p>}
        {!error && projects === null && <p className="app__status">Cargando proyectos…</p>}
        {projects && projects.length === 0 && (
          <p className="app__status">
            Tu cuenta no administra ningún proyecto. Pide que te den de alta en la tabla de admins del proyecto.
          </p>
        )}
        {project && (
          <>
            <div className="app__intro">
              <h1 className="app__title">{project.nombre}</h1>
              <p className="app__hint">
                Arrastra un archivo sobre su carpeta o directamente sobre el archivo que quieres reemplazar.
              </p>
            </div>
            <ProjectPanel key={project.id} project={project} />
          </>
        )}
      </main>
    </div>
  )
}
