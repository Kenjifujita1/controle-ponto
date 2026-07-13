import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

interface AuthState {
  perfil: Perfil | null
  carregando: boolean
  carregarSessao: () => Promise<void>
  entrar: (email: string, senha: string) => Promise<void>
  alterarSenha: (novaSenha: string) => Promise<void>
  sair: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  perfil: null,
  carregando: true,
  carregarSessao: async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      set({ perfil: null, carregando: false })
      return
    }
    const { data: perfil } = await supabase
      .from('ponto_perfis')
      .select('id, nome, papel')
      .eq('id', data.user.id)
      .single()
    set({ perfil: (perfil as Perfil) ?? null, carregando: false })
  },
  entrar: async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    const { data } = await supabase.auth.getUser()
    const { data: perfil } = await supabase
      .from('ponto_perfis')
      .select('id, nome, papel')
      .eq('id', data.user!.id)
      .single()
    set({ perfil: (perfil as Perfil) ?? null })
  },
  alterarSenha: async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) throw error
  },
  sair: async () => {
    await supabase.auth.signOut()
    set({ perfil: null })
  },
}))
