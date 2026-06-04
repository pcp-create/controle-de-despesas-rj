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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabaseReady, setSupabaseReady] = useState(false);

  const supabase = createClient();

  // Verificar se o cliente Supabase está pronto
  useEffect(() => {
    if (supabase) {
      setSupabaseReady(true);
    } else {
      // Retry after a short delay if supabase isn't ready
      const timer = setTimeout(() => {
        setSupabaseReady(!!createClient());
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [supabase]);

  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Erro ao buscar perfil:", error);
      return null;
    }

    return data as Profile;
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !supabaseReady) {
      setLoading(false);
      return;
    }

    // Verificar sessão atual
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }
      
      setLoading(false);
    };

    getSession();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, supabaseReady, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase não está disponível" };
    
    setLoading(true);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      return { error: error.message };
    }

    if (data.user) {
      setUser(data.user);
      const profileData = await fetchProfile(data.user.id);
      
      if (!profileData?.ativo) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setLoading(false);
        return { error: "Usuário inativo. Contate o administrador." };
      }
      
      setProfile(profileData);
    }

    setLoading(false);
    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!user) return { error: "Usuário não autenticado" };
    if (!supabase) return { error: "Supabase não está disponível" };

    const { error } = await supabase
      .from("profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      return { error: error.message };
    }

    // Atualizar estado local
    const profileData = await fetchProfile(user.id);
    setProfile(profileData);

    return { error: null };
  };

  const changePassword = async (newPassword: string) => {
    if (!supabase) return { error: "Supabase não está disponível" };
    
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
