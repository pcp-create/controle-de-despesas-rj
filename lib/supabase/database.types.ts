export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          email: string
          usuario: string
          perfil: 'tecnico' | 'gestor' | 'financeiro' | 'administrador'
          ativo: boolean
          gestor_id: string | null
          primeiro_acesso: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nome: string
          email: string
          usuario: string
          perfil: 'tecnico' | 'gestor' | 'financeiro' | 'administrador'
          ativo?: boolean
          gestor_id?: string | null
          primeiro_acesso?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string
          usuario?: string
          perfil?: 'tecnico' | 'gestor' | 'financeiro' | 'administrador'
          ativo?: boolean
          gestor_id?: string | null
          primeiro_acesso?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tipos_despesa: {
        Row: {
          id: string
          nome: string
          descricao: string | null
          limite_maximo: number | null
          limite_ocorrencias_diarias: number | null
          exige_comprovante: boolean
          documento_padrao: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          descricao?: string | null
          limite_maximo?: number | null
          limite_ocorrencias_diarias?: number | null
          exige_comprovante?: boolean
          documento_padrao?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          descricao?: string | null
          limite_maximo?: number | null
          limite_ocorrencias_diarias?: number | null
          exige_comprovante?: boolean
          documento_padrao?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      cartoes: {
        Row: {
          id: string
          user_id: string
          banco: string
          bandeira: string
          ultimos_digitos: string
          apelido: string | null
          is_padrao: boolean
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          banco: string
          bandeira: string
          ultimos_digitos: string
          apelido?: string | null
          is_padrao?: boolean
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          banco?: string
          bandeira?: string
          ultimos_digitos?: string
          apelido?: string | null
          is_padrao?: boolean
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      despesas: {
        Row: {
          id: string
          tecnico_id: string
          tipo_despesa_id: string
          cartao_id: string | null
          cliente: string
          numero_os: string
          valor: number
          documento: string | null
          observacao: string | null
          comprovante_nome: string | null
          comprovante_url: string | null
          data_despesa: string
          status_aprovacao: 'AguardandoGestor' | 'AprovadoGestor' | 'Reprovado'
          status_erp: 'Rascunho' | 'EnviadoAguardandoGestor' | 'AprovadoGestorERPAtualizado' | 'ErroEnvioERP' | 'ErroAtualizarERP'
          gestor_aprovador_id: string | null
          justificativa_reprovacao: string | null
          data_envio: string | null
          data_aprovacao: string | null
          erp_id: string | null
          erp_payload: Json | null
          erp_resposta: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tecnico_id: string
          tipo_despesa_id: string
          cartao_id?: string | null
          cliente: string
          numero_os: string
          valor: number
          documento?: string | null
          observacao?: string | null
          comprovante_nome?: string | null
          comprovante_url?: string | null
          data_despesa: string
          status_aprovacao?: 'AguardandoGestor' | 'AprovadoGestor' | 'Reprovado'
          status_erp?: 'Rascunho' | 'EnviadoAguardandoGestor' | 'AprovadoGestorERPAtualizado' | 'ErroEnvioERP' | 'ErroAtualizarERP'
          gestor_aprovador_id?: string | null
          justificativa_reprovacao?: string | null
          data_envio?: string | null
          data_aprovacao?: string | null
          erp_id?: string | null
          erp_payload?: Json | null
          erp_resposta?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tecnico_id?: string
          tipo_despesa_id?: string
          cartao_id?: string | null
          cliente?: string
          numero_os?: string
          valor?: number
          documento?: string | null
          observacao?: string | null
          comprovante_nome?: string | null
          comprovante_url?: string | null
          data_despesa?: string
          status_aprovacao?: 'AguardandoGestor' | 'AprovadoGestor' | 'Reprovado'
          status_erp?: 'Rascunho' | 'EnviadoAguardandoGestor' | 'AprovadoGestorERPAtualizado' | 'ErroEnvioERP' | 'ErroAtualizarERP'
          gestor_aprovador_id?: string | null
          justificativa_reprovacao?: string | null
          data_envio?: string | null
          data_aprovacao?: string | null
          erp_id?: string | null
          erp_payload?: Json | null
          erp_resposta?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      auditoria: {
        Row: {
          id: string
          user_id: string
          acao: string
          entidade: string | null
          entidade_id: string | null
          detalhes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          acao: string
          entidade?: string | null
          entidade_id?: string | null
          detalhes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          acao?: string
          entidade?: string | null
          entidade_id?: string | null
          detalhes?: string | null
          created_at?: string
        }
      }
    }
  }
}
