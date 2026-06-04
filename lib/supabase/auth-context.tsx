"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Perfil = "tecnico" | "gestor" | "financeiro" | "administrador";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  usuario: string;
  perfil: Perfil;
  ativo: boolean;
  gestor_id: string | null;
  primeiro_acesso: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, userData: { nome: string; usuario: string; perfil: Perfil }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Usar useRef para controlar race conditions
  const abortControllerRef = useCallback(() => new AbortController(), []);

  const fetchProfile = useCallback(async (userId: string, signal?: AbortSignal) => {
    try {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (signal?.aborted) return null;

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        return null;
      }

      return data as Profile;
    } catch (err) {
      if (signal?.aborted) return null;
      console.error("Erro ao buscar perfil:", err);
      return null;
    }
  }, []);

  // Efeito: Carregar sessão inicial e escutar mudanças de autenticação
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const controller = new AbortController();

    // Buscar sessão inicial
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted || controller.signal.aborted) return;

        if (session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id, controller.signal);
          if (mounted && !controller.signal.aborted && profileData) {
            setProfile(profileData);
          }
        }
      } catch (err) {
        console.error("Erro ao inicializar autenticação:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Timeout de segurança: forçar saída do loading após 3 segundos
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 3000);

    initializeAuth();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted || controller.signal.aborted) return;

        if (event === "SIGNED_IN" && session?.user) {
          // Após login, buscar perfil com retry
          let profileData = null;
          let retries = 3;
          
          while (retries > 0 && !profileData) {
            profileData = await fetchProfile(session.user.id, controller.signal);
            if (!profileData) {
              await new Promise(resolve => setTimeout(resolve, 300));
              retries--;
            }
          }
          
          if (!mounted || controller.signal.aborted) return;

          if (profileData?.ativo) {
            setUser(session.user);
            setProfile(profileData);
            setLoading(false);
          } else if (profileData) {
            // Usuário inativo, fazer logout
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // Função signIn: apenas fazer login, sem bloquear com loading
  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Tratamento específico de erros
        if (error.message.includes("Email not confirmed")) {
          return { error: "Email não confirmado. Verifique sua caixa de entrada." };
        }
        if (error.message.includes("Invalid login") || error.message.includes("Invalid credentials")) {
          return { error: "Email ou senha incorretos" };
        }
        return { error: error.message };
      }

      // Adicionar pequeno delay para evitar race conditions
      // O listener onAuthStateChange vai buscar o perfil
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao fazer login" };
    }
  };

  const signUp = async (email: string, password: string, userData: { nome: string; usuario: string; perfil: Perfil }) => {
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome: userData.nome,
            usuario: userData.usuario,
            perfil: userData.perfil,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      // SignUp bem-sucedido - o listener vai lidar com o resto
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao criar conta" };
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("Erro ao fazer logout:", err);
    }
  };

  const updateProfile = async (data: Partial<Profile>) => {
    const supabase = createClient();
    if (!user) return { error: "Usuário não autenticado" };

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) {
        return { error: error.message };
      }

      // Atualizar estado local
      const profileData = await fetchProfile(user.id);
      if (profileData) {
        setProfile(profileData);
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao atualizar perfil" };
    }
  };

  const changePassword = async (newPassword: string) => {
    const supabase = createClient();
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { error: error.message };
      }

      // Marcar primeiro_acesso como false
      if (profile?.primeiro_acesso) {
        await updateProfile({ primeiro_acesso: false });
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao mudar senha" };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
