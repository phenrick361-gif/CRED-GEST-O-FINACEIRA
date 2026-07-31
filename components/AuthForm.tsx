'use client';

import Link from 'next/link';
import { FormEvent, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, User, Mail, Lock, ShieldCheck, Shield, Sparkles, ArrowLeft, CheckCircle, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import PasswordInput from '@/components/PasswordInput';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

// Tipos de erro específicos
type AuthError = {
  code: string;
  message: string;
  details?: any;
};

function getAuthErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'invalid_email':
      return 'Formato de e-mail inválido.';
    case 'user_already_exists':
      return 'Este e-mail já está cadastrado.';
    case 'user_not_found':
      return 'E-mail não encontrado.';
    case 'email_not_confirmed':
      return 'Por favor, confirme seu e-mail antes de fazer login.';
    case 'password_policy':
    case 'weak_password':
      return 'A senha não atende aos requisitos de segurança.';
    case 'rate_limit_exceeded':
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas de envio. Aguarde alguns minutos e tente novamente.';
    case 'email_address_not_authorized':
    case 'email_not_authorized':
      return 'Não foi possível enviar o e-mail de confirmação. Verifique a configuração de envio do sistema.';
    case 'network_error':
      return 'Erro de conexão. Verifique sua internet e tente novamente.';
    case 'server_error':
    case 'signup_disabled':
      return 'Erro no servidor. Tente novamente mais tarde.';
    case 'too_many_attempts':
      return 'Muitas tentativas falhas. Aguarde antes de tentar novamente.';
    case 'validation_error':
      return error.message || 'Formato de e-mail inválido.';
    default:
      return error.message || 'Ocorreu um erro inesperado. Tente novamente.';
  }
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(input: string): string {
  return input.trim();
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const search = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(''); setMessage(''); setFieldErrors({});

    // Validação de campos antes de chamar a API
    const validationErrors: Record<string, string> = {};
    
    if (mode === 'signup' && !name.trim()) {
      validationErrors.name = 'Nome é obrigatório';
    }
    
    if (!validateEmail(email)) {
      validationErrors.email = 'Formato de e-mail inválido';
    }
    
    if (mode === 'login' || mode === 'signup' || mode === 'reset') {
      if (!password) {
        validationErrors.password = 'Senha é obrigatória';
      } else if (password.length < 8) {
        validationErrors.password = 'A senha deve ter pelo menos 8 caracteres';
      }
    }
    
    if ((mode === 'signup' || mode === 'reset') && password !== confirm) {
      validationErrors.confirm = 'As senhas não coincidem';
    }

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    
    try {
      if (mode === 'login') {
        const { error, data } = await supabase.auth.signInWithPassword({
          email: sanitizeInput(email),
          password: sanitizeInput(password)
        });
        
        if (error) {
          throw error;
        }
        
        // Verificar se o e-mail foi confirmado
        if (data.user && !data.user.email_confirmed_at) {
          setMessage('Por favor, confirme seu e-mail para acessar sua conta.');
          return;
        }
        
        router.replace(search.get('next') || '/dashboard');
        router.refresh();
      } else if (mode === 'signup') {
        if (password.length < 8) {
          throw new Error('Use uma senha com pelo menos 8 caracteres.');
        }
        if (password !== confirm) {
          throw new Error('As senhas não coincidem.');
        }
        
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: sanitizeInput(email),
            password: sanitizeInput(password),
            nome: sanitizeInput(name),
          }),
        });
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Erro ao criar conta');
        }
        
        if (result.session) {
          router.replace('/dashboard');
          router.refresh();
        } else if (result.user && result.confirmed === true) {
          // Modo temporário: usuário criado já confirmado (sem e-mail) → login imediato
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: sanitizeInput(email),
            password: sanitizeInput(password),
          });
          if (!signInError) {
            router.replace('/dashboard');
            router.refresh();
            return;
          }
          setSignupSuccess(true);
          setSignupEmail(sanitizeInput(email));
          setMessage('Conta criada com sucesso!');
        } else if (result.user) {
          setSignupSuccess(true);
          setSignupEmail(sanitizeInput(email));
          setMessage('Conta criada com sucesso!');
        }
      } else if (mode === 'forgot') {
        if (!validateEmail(email)) {
          throw new Error('Formato de e-mail inválido.');
        }
        
        const { error } = await supabase.auth.resetPasswordForEmail(sanitizeInput(email), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        
        if (error) {
          throw error;
        }
        
        setMessage('Enviamos o link de recuperação, caso o e-mail esteja cadastrado.');
      } else if (mode === 'reset') {
        if (password.length < 8) {
          throw new Error('Use uma senha com pelo menos 8 caracteres.');
        }
        if (password !== confirm) {
          throw new Error('As senhas não coincidem.');
        }
        
        const { error } = await supabase.auth.updateUser({ 
          password: sanitizeInput(password) 
        });
        
        if (error) {
          throw error;
        }
        
        setMessage('Senha alterada com sucesso.');
        setTimeout(() => router.replace('/dashboard'), 900);
      }
    } catch (caught) {
      const err = caught as any;
      console.error('[AUTH ERROR]', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        details: err?.details,
        name: err?.name,
        stack: err?.stack,
        fullError: err
      });

      if (caught instanceof TypeError && caught.message === 'Failed to fetch') {
        setError('Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.');
      } else if (caught instanceof Error) {
        const code = err.code || (typeof err.status === 'number' ? String(err.status) : err.status);
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('sending confirmation email') || msg.includes('smtp') || msg.includes('mailer')) {
          setError(
            'Serviço de e-mail do Supabase não configurado. ' +
            'Vá em Supabase Dashboard > Authentication > Settings e desative "Enable email confirmation" ' +
            'OU configure SMTP. Detalhe: ' + (err.message || '')
          );
        } else if (code && typeof code === 'string') {
          setError(getAuthErrorMessage({ code, message: err.message }));
        } else {
          if (msg.includes('rate limit') || msg.includes('too many requests')) {
            setError('Muitas tentativas de envio. Aguarde alguns minutos e tente novamente.');
          } else if (msg.includes('not authorized')) {
            setError('Não foi possível enviar o e-mail de confirmação. Verifique a configuração de envio do sistema.');
          } else if (msg.includes('network') || msg.includes('fetch')) {
            setError('Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.');
          } else if (msg.includes('already registered') || msg.includes('already exists')) {
            setError('Este e-mail já está cadastrado.');
          } else {
            const statusInfo = err.status ? ` (HTTP ${err.status})` : '';
            setError((err.message || 'Não foi possível concluir a operação. Tente novamente.') + statusInfo);
          }
        }
      } else {
        setError('Não foi possível concluir a operação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (cooldown > 0 && !cooldownRef.current) {
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [cooldown]);

  async function handleResend() {
    setResendLoading(true);
    setResendError('');
    setResendSuccess('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: signupEmail
      });
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Resend error:', error);
        }
        const err = error as any;
        const code = err.code || err.status;
        if (code && typeof code === 'string') {
          setResendError(getAuthErrorMessage({ code, message: err.message }));
        } else {
          const msg = err.message?.toLowerCase() || '';
          if (msg.includes('rate limit') || msg.includes('too many requests')) {
            setResendError('Muitas tentativas de envio. Aguarde alguns minutos e tente novamente.');
          } else {
            setResendError(err.message || 'Erro ao reenviar e-mail. Tente novamente.');
          }
        }
        return;
      }
      setResendSuccess('E-mail reenviado com sucesso.');
      setCooldown(60);
    } catch (caught) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Resend error:', caught);
      }
      setResendError('Erro ao reenviar e-mail. Tente novamente.');
    } finally {
      setResendLoading(false);
    }
  }

  const titles: Record<Mode, [string, string]> = {
    login: ['Entrar no CRED', 'Acesse sua conta com e-mail e senha.'],
    signup: ['Criar nova conta', 'Dê o primeiro passo para uma gestão financeira inteligente e segura.'],
    forgot: ['Recuperar senha', 'Receba um link seguro por e-mail.'],
    reset: ['Criar nova senha', 'Escolha uma senha forte para sua conta.']
  };
  const [title, subtitle] = titles[mode];

  const isSignup = mode === 'signup';

  if (isSignup && signupSuccess) {
    return (
      <main className="auth-shell">
        <section className="auth-card" style={{ textAlign: 'center' }}>
          <div className="brand">
            <div className="brand-mark">🍀</div>
            <h1>CRED</h1>
            <p>Gestão financeira</p>
          </div>
          <div style={{ margin: '8px 0 4px' }}>
            <CheckCircle size={40} style={{ color: 'var(--green)' }} />
          </div>
          <h2 style={{ fontSize: 20, margin: '8px 0' }}>Conta criada!</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            Enviamos um e-mail de confirmação para <strong style={{ color: 'var(--gold-light)' }}>{signupEmail}</strong>.
          </p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Clique no link enviado para ativar sua conta e começar a usar o CRED.
          </p>

          <div style={{ marginBottom: 16 }}>
            <button
              className="btn btn-gold"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={resendLoading || cooldown > 0}
              onClick={handleResend}
            >
              <RefreshCw size={16} className={resendLoading ? 'spin-icon' : ''} />
              {resendLoading ? 'Enviando...' : cooldown > 0 ? `Reenviar (${cooldown}s)` : 'Reenviar e-mail'}
            </button>
          </div>

          {resendError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', padding: '10px 14px', borderRadius: 12, fontSize: 13, marginBottom: 12, textAlign: 'left' }}>
              {resendError}
            </div>
          )}
          {resendSuccess && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC', padding: '10px 14px', borderRadius: 12, fontSize: 13, marginBottom: 12 }}>
              {resendSuccess}
            </div>
          )}

          <div className="auth-links" style={{ justifyContent: 'center' }}>
            <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Voltar para o login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">🍀</div>
          <h1>CRED</h1>
          <p>Gestão financeira</p>
        </div>
        <h2>{title}</h2>
        <p className={isSignup ? 'text-gold-light/80 text-sm font-medium tracking-wide' : 'muted'}>{subtitle}</p>
        <form onSubmit={submit} className="space-y-5">
          {isSignup && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
              <input 
                className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                  fieldErrors.name 
                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                    : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                }`}
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                placeholder="Seu nome completo" 
              />
              {fieldErrors.name && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.name}</p>}
            </div>
          )}
          
          {mode !== 'reset' && (
            isSignup ? (
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <input 
                className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                  fieldErrors.email 
                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                    : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                }`}
                type="email" 
                  value={email} 
                  onChange={(e) => setEmail(sanitizeInput(e.target.value))} 
                  required 
                  placeholder="você@email.com" 
                />
                {fieldErrors.email && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.email}</p>}
              </div>
            ) : (
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <input 
                  className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                    fieldErrors.email 
                      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                      : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                  }`}
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(sanitizeInput(e.target.value))} 
                  required 
                  placeholder="você@email.com" 
                />
                {fieldErrors.email && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.email}</p>}
              </div>
            )
          )}
          
          {(mode === 'login' || isSignup || mode === 'reset') && (
            isSignup ? (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <PasswordInput
                  className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                    fieldErrors.password 
                      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                      : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                  }`}
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  placeholder="Crie uma senha segura" 
                  autoComplete="new-password"
                />
                {fieldErrors.password && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.password}</p>}
              </div>
            ) : (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <PasswordInput
                  className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                    fieldErrors.password 
                      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                      : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                  }`}
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  placeholder={mode === 'login' ? 'Digite sua senha' : 'Crie uma senha segura'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {fieldErrors.password && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.password}</p>}
              </div>
            )
          )}
          
          {(isSignup || mode === 'reset') && (
            isSignup ? (
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <PasswordInput
                  className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                    fieldErrors.confirm 
                      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                      : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                  }`}
                  value={confirm} 
                  onChange={(e) => setConfirm(e.target.value)} 
                  required 
                  placeholder="Repita a senha" 
                  autoComplete="new-password"
                />
                {fieldErrors.confirm && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.confirm}</p>}
              </div>
            ) : (
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/50 w-5 h-5 pointer-events-none" />
                <PasswordInput
                  className={`w-full bg-[#111827] border-2 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 outline-none transition-all duration-300 ${
                    fieldErrors.confirm 
                      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                      : 'border-gold/40 focus:border-gold focus:ring-2 focus:ring-gold/20'
                  }`}
                  value={confirm} 
                  onChange={(e) => setConfirm(e.target.value)} 
                  required 
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
                {fieldErrors.confirm && <p className="text-red-400 text-xs mt-1.5 ml-1 font-medium">{fieldErrors.confirm}</p>}
              </div>
            )
          )}
          
          {error && <div className={isSignup ? 'bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-2xl text-sm font-medium' : 'error'}>{error}</div>}
          {!signupSuccess && message && <div className={isSignup ? 'bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-2xl text-sm font-medium' : 'success'}>{message}</div>}
          
          {isSignup && (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Shield className="w-3.5 h-3.5 text-gold/50" />
                Dados protegidos
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Sparkles className="w-3.5 h-3.5 text-gold/50" />
                Criptografia SSL
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5 text-gold/50" />
                Privacidade total
              </span>
            </div>
          )}
          
          <button 
            className="btn btn-gold w-full"
            disabled={loading}
          >
            {loading ? 'Aguarde...' : 
             mode === 'login' ? 'Entrar' : 
             isSignup ? 'Criar conta' : 
             mode === 'forgot' ? 'Enviar link' : 'Salvar nova senha'}
          </button>
        </form>
        
        <div className="auth-links">
          {mode !== 'login' && <Link href="/login">Já tenho conta</Link>}
          {mode === 'login' && (
            <>
              <Link href="/signup">Criar conta</Link>
              <Link href="/forgot-password">Esqueci a senha</Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
