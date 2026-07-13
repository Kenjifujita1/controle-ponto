import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './store/auth'
import { MARCA } from './branding'
import MarcarPonto from './pages/MarcarPonto'
import Login from './pages/Login'

// Painel admin carregado sob demanda (não pesa na tela de marcação)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Funcionarios = lazy(() => import('./pages/admin/Funcionarios'))
const Locais = lazy(() => import('./pages/admin/Locais'))
const Equipes = lazy(() => import('./pages/admin/Equipes'))
const Relatorios = lazy(() => import('./pages/admin/Relatorios'))
const Gestores = lazy(() => import('./pages/admin/Gestores'))
const Monitor = lazy(() => import('./pages/admin/Monitor'))
const Configuracoes = lazy(() => import('./pages/admin/Configuracoes'))

function Carregando() {
  return <div className="p-8 text-center text-neutral-400">Carregando…</div>
}

function Protegido({ children }: { children: JSX.Element }) {
  const { perfil, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (!perfil) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const carregarSessao = useAuth((s) => s.carregarSessao)
  useEffect(() => {
    carregarSessao()
    document.title = MARCA
  }, [carregarSessao])

  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        {/* Tela pública de marcação (quiosque / celular do funcionário) */}
        <Route path="/" element={<MarcarPonto />} />
        <Route path="/login" element={<Login />} />

        {/* Área administrativa protegida */}
        <Route
          path="/admin"
          element={
            <Protegido>
              <AdminLayout />
            </Protegido>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="funcionarios" element={<Funcionarios />} />
          <Route path="equipes" element={<Equipes />} />
          <Route path="locais" element={<Locais />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="gestores" element={<Gestores />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
