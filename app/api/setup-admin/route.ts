import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Esta rota cria o usuário administrador inicial
// REMOVER APÓS USO - é uma rota de setup única

const SUPABASE_URL = "https://xyvupybgnvzzdrpkfuwb.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ 
      error: "SUPABASE_SERVICE_ROLE_KEY não configurada",
      instruction: "Adicione a Service Role Key nas variáveis de ambiente do projeto"
    }, { status: 500 })
  }

  // Criar cliente admin com service role key
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Criar usuário administrador
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: 'administrador@rjcompressores.com.br',
      password: 'Admin@123',
      email_confirm: true,
      user_metadata: {
        nome: 'Administrador',
        usuario: 'admin',
        perfil: 'administrador'
      }
    })

    if (error) {
      // Se usuário já existe, tentar atualizar a senha
      if (error.message.includes('already been registered')) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = users?.users?.find(u => u.email === 'administrador@rjcompressores.com.br')
        
        if (existingUser) {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUser.id,
            { password: 'Admin@123' }
          )
          
          if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 400 })
          }
          
          return NextResponse.json({ 
            success: true, 
            message: "Senha do administrador atualizada!",
            credentials: {
              email: "administrador@rjcompressores.com.br",
              password: "Admin@123"
            }
          })
        }
      }
      
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      message: "Usuário administrador criado com sucesso!",
      userId: data.user?.id,
      credentials: {
        email: "administrador@rjcompressores.com.br",
        password: "Admin@123"
      }
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
