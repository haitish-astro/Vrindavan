import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useOutlet } from 'react-router'
import { MotionConfig } from 'motion/react'
import { AppProvider, useApp } from './app/AppContext'
import { loadApi, type Api } from './data/api'
import { welcomedToday } from './lib/local'
import { Layout } from './components/Layout'
import { Button, ErrorNote, Spinner } from './components/ui'
import { Feather } from './components/Decor'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Home from './pages/Home'
import Memories from './pages/Memories'
import MemoryForm from './pages/MemoryForm'
import MemoryDetail from './pages/MemoryDetail'
import Story from './pages/Story'
import World from './pages/World'
import Settings from './pages/Settings'
import Letters from './pages/Letters'
import LetterView from './pages/LetterView'
import LetterCompose from './pages/LetterCompose'
import Chat from './pages/Chat'
import Doodle from './pages/Doodle'
import { ChatProvider } from './app/ChatContext'
import { CursorGlow } from './components/CursorGlow'
import Chess from './pages/Chess'

export default function App() {
  // undefined = starting up, null = Supabase is not configured
  const [api, setApi] = useState<Api | null | undefined>(undefined)

  useEffect(() => {
    loadApi()
      .then(setApi)
      .catch(() => setApi(null))
  }, [])

  if (api === undefined) return <Centered><Spinner label="Opening the gates…" /></Centered>
  if (api === null) return <SetupNeeded />

  return (
    <MotionConfig reducedMotion="user">
      <CursorGlow />
      <AppProvider api={api}>
        <HashRouter>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route element={<Gate />}>
              <Route index element={<Home />} />
              <Route path="memories" element={<Memories />} />
              <Route path="memories/new" element={<MemoryForm />} />
              <Route path="memories/:id" element={<MemoryDetail />} />
              <Route path="memories/:id/edit" element={<MemoryForm />} />
              <Route path="story" element={<Story />} />
              <Route path="world" element={<World />} />
              <Route path="settings" element={<Settings />} />
              <Route path="letters" element={<Letters />} />
              <Route path="letters/new" element={<LetterCompose />} />
              <Route path="letters/:id" element={<LetterView />} />
              <Route path="letters/:id/edit" element={<LetterCompose />} />
              <Route path="chat" element={<Chat />} />
              <Route path="doodle" element={<Doodle />} />
              <Route path="chess" element={<Chess />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AppProvider>
    </MotionConfig>
  )
}

/** Everything personal lives behind this gate: signed in AND one of the two members. */
function Gate() {
  const { user, world, worldError, reloadWorld, signOut } = useApp()
  // Captured here so a page can finish fading out before the next one appears.
  const outlet = useOutlet()

  if (user === undefined) return <Centered><Spinner label="Opening the gates…" /></Centered>
  if (user === null) return <Navigate to="/welcome" replace />
  if (!welcomedToday()) return <Navigate to="/welcome" replace />

  if (worldError) {
    return (
      <Centered>
        <ErrorNote message={worldError} onRetry={reloadWorld} />
      </Centered>
    )
  }
  if (world === undefined) return <Centered><Spinner label="Finding our little world…" /></Centered>
  if (world === null) {
    return (
      <Centered>
        <div className="paper flex max-w-sm flex-col items-center gap-3 p-8 text-center">
          <Feather className="h-24" />
          <h1 className="text-3xl text-peacock-deep">This garden is private</h1>
          <p className="text-ink-soft">
            You are signed in as <span className="font-semibold break-all">{user.email}</span>, but this little
            world belongs to two other hearts.
          </p>
          <Button variant="soft" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Centered>
    )
  }

  return (
    <ChatProvider>
      <Layout>{outlet}</Layout>
    </ChatProvider>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>
}

function SetupNeeded() {
  return (
    <Centered>
      <div className="paper flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <Feather className="h-24" />
        <h1 className="text-3xl text-peacock-deep">Almost ready</h1>
        <p className="text-ink-soft">
          Our Little Vrindavan has not been connected to its Supabase project yet. Add{' '}
          <code className="rounded bg-parchment px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-parchment px-1">VITE_SUPABASE_ANON_KEY</code> as described in the README,
          then build again.
        </p>
      </div>
    </Centered>
  )
}
