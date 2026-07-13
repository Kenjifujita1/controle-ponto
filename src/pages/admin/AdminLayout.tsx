import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { HANDLE, MARCA } from '../../branding'

const baseLinks = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/monitor', label: 'Monitor' },
  { to: '/admin/funcionarios', label: 'Funcionários' },
  { to: '/admin/equipes', label: 'Equipes' },
  { to: '/admin/locais', label: 'Unidades' },
  { to: '/admin/relatorios', label: 'Relatórios' },
]

export default function AdminLayout() {
  const { perfil, sair, alterarSenha } = useAuth()
  const nav = useNavigate()
  const [trocaSenha, setTrocaSenha] = useState(false)

  const links = perfil?.papel === 'admin'
    ? [...baseLinks, { to: '/admin/gestores', label: 'Gestores' }, { to: '/admin/configuracoes', label: 'Config' }]
    : baseLinks

  async function logout() {
    await sair()
    nav('/login')
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-24 pt-6 md:pb-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{MARCA}{HANDLE && <span className="text-neutral-500 font-normal"> · {HANDLE}</span>}</h1>
          <p className="text-sm text-neutral-400">
            {perfil?.nome} · {perfil?.papel === 'admin' ? 'Administrador' : 'Supervisor'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost py-2" onClick={() => setTrocaSenha(true)}>
            Alterar senha
          </button>
          <button className="btn-ghost py-2" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-neutral-800 bg-black/95 py-2 backdrop-blur md:static md:mb-6 md:justify-start md:gap-2 md:border-none md:bg-transparent md:py-0">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={(l as { end?: boolean }).end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-white text-black' : 'text-neutral-300 hover:bg-neutral-800'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <main>
        <Outlet />
      </main>

      {trocaSenha && <ModalSenha onFechar={() => setTrocaSenha(false)} alterar={alterarSenha} />}
    </div>
  )
}

function ModalSenha({ onFechar, alterar }: { onFechar: () => void; alterar: (s: string) => Promise<void> }) {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 6) return setMsg('A senha deve ter ao menos 6 caracteres.')
    if (senha !== confirma) return setMsg('As senhas não conferem.')
    setSalvando(true)
    setMsg('')
    try {
      await alterar(senha)
      setMsg('✓ Senha alterada com sucesso!')
      setTimeout(onFechar, 1200)
    } catch (err) {
      setMsg((err as Error).message || 'Erro ao alterar senha')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h3 className="text-lg font-semibold text-white">Alterar minha senha</h3>
        <div>
          <label className="label">Nova senha</label>
          <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <div>
          <label className="label">Confirmar nova senha</label>
          <input className="input" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
        </div>
        {msg && <p className="text-sm text-neutral-300">{msg}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onFechar}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
