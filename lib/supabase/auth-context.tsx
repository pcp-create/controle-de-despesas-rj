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

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("[v0] Erro ao buscar perfil:", error);
        return null;
      }

      return data as Profile;
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
        } else {
          // Sem sessão, fazer auto-login
          console.log("[v0] Sem sessão, tentando auto-login...");
          const { error } = await supabase.auth.signInWithPassword({
            email: "administrador@rjcompressores.com.br",
            password: "317622",
          });
          
          if (error) {
            console.error("[v0] Erro no auto-login:", error);
          } else {
            console.log("[v0] Auto-login bem-sucedido");
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
        console.log("[v0] onAuthStateChange - event:", event, "user:", session?.user?.id);
        
        if (!isMounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          console.log("[v0] SIGNED_IN - fetching profile for:", session.user.id);
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          console.log("[v0] Profile data:", profileData ? "found" : "null");
          
          if (!isMounted) return;
          
          if (profileData) {
            if (profileData.ativo) {
              console.log("[v0] User active, setting profile");
              setProfile(profileData);
            } else {
              console.log("[v0] User inactive, signing out");
              // Inativo - fazer logout
              await supabase.auth.signOut();
              setUser(null);
              setProfile(null);
            }
          } else {
            console.log("[v0] Profile is null after fetch");
          }
          setLoading(false);
        } else if (event === "SIGNED_OUT" || !session?.user) {
          console.log("[v0] SIGNED_OUT");
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

  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Email not confirmed")) {
          return { error: "Email não confirmado" };
        }
        if (error.message.includes("Invalid login") || error.message.includes("Invalid credentials")) {
          return { error: "Email ou senha incorretos" };
        }
        return { error: error.message };
      }

      // Listener vai carregar perfil e atualizar estado
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

