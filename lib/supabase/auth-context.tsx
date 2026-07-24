"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Perfil = "funcionario" | "gestor" | "financeiro" | "administrador";

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
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (_userId: string) => {
    try {
      const res = await fetch("/api/get-profile");
      if (!res.ok) {
        console.error("[v0] Erro ao buscar perfil - status:", res.status);
        return null;
      }
      const { profile } = await res.json();
      return profile as Profile;
    } catch (err) {
      console.error("[v0] Erro ao buscar perfil:", err);
      return null;
    }
  }, []);

  // Inicializar autenticação
  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const initAuth = async () => {
      try {
        // Tentar obter sessão existente
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          if (isMounted && profileData) {
            setProfile(profileData);
          }
        }
      } catch (err) {
        console.error("[v0] Erro ao inicializar auth:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Timeout de segurança
    const timeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 5000);

    initAuth();

    // Listener para mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          
          if (!isMounted) return;
          
          if (profileData) {
            if (profileData.ativo) {
              setProfile(profileData);
            } else {
              // Inativo - fazer logout
              await supabase.auth.signOut();
              setUser(null);
              setProfile(null);
            }
          }
          setLoading(false);
        } else if (event === "SIGNED_OUT" || !session?.user) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // v2: login via /api/login com setSession
  const signIn = async (usuario: string, password: string) => {
    try {
      // Validar credenciais e criar sessão via API server-side
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { error: data.error ?? "Usuário ou senha inválidos" };
      }

      // Usar setSession com os tokens retornados pelo servidor
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (error) {
        return { error: "Erro ao iniciar sessão" };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao fazer login" };
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("[v0] Erro ao fazer logout:", err);
    }
  };

  const updateProfile = async (data: Partial<Profile>) => {
    const supabase = createClient();
    if (!user) return { error: "Usuário não autenticado" };

    try {
      const { error } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", user.id);

      if (error) {
        return { error: error.message };
      }

      const updated = await fetchProfile(user.id);
      if (updated) {
        setProfile(updated);
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
        signOut,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

