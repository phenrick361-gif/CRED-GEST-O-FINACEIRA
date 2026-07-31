import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { email, password, nome } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // TEMPORÁRIO: quando false, o usuário é criado já confirmado (login imediato, sem e-mail).
    // Quando o SMTP estiver funcionando, defina REQUIRE_EMAIL_CONFIRMATION=true
    // para voltar a exigir a confirmação por e-mail (e-mail de confirmação será enviado).
    const requireEmailConfirmation = process.env.REQUIRE_EMAIL_CONFIRMATION === 'true'

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Supabase não configurado (faltam env vars)' }, { status: 500 })
    }

    // Tenta criar com service_role (permite criar sem confirmação de e-mail)
    if (serviceRoleKey) {
      try {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          // false → usuário já confirmado (modo temporário). true → envia e-mail de confirmação.
          email_confirm: !requireEmailConfirmation,
          user_metadata: { nome: nome || '' },
        })
        if (error) {
          return NextResponse.json({ error: error.message, details: error }, { status: 500 })
        }
        return NextResponse.json({
          user: data.user,
          session: null,
          confirmed: !requireEmailConfirmation,
        })
      } catch (adminErr: any) {
        return NextResponse.json({ error: adminErr?.message || 'Erro no admin createUser' }, { status: 500 })
      }
    }

    // Sem service_role — chama a API do Supabase diretamente (fetch bruto)
    const body = JSON.stringify({
      email,
      password,
      data: { nome: nome || '' },
      email_redirect_to: new URL('/auth/callback', request.url).toString(),
    })

    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body,
    })

    const text = await response.text()
    let result: any = {}
    if (text) {
      try {
        result = JSON.parse(text)
      } catch {
        result = { raw: text }
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: result.msg || result.error || result.error_description || JSON.stringify(result),
          code: result.error_code || result.code,
          status: response.status,
          full: result,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ user: result?.user ?? null, session: result?.session ?? null })
  } catch (caught: any) {
    return NextResponse.json({ error: caught?.message || 'Erro interno do servidor' }, { status: 500 })
  }
}
