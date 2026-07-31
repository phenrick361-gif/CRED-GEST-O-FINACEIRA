import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedPrefixes = ['/dashboard', '/clientes', '/novo-emprestimo', '/contratos', '/relatorios', '/calculadora', '/configuracoes'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: Array<{ name: string; value: string; options: any }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedRoute = protectedPrefixes.some((prefix) => path.startsWith(prefix));
  const authRoute = ['/login', '/signup'].includes(path);

  if (protectedRoute && !user) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = '/login';
    nextUrl.searchParams.set('next', path);
    return NextResponse.redirect(nextUrl);
  }
  if (authRoute && user) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = '/dashboard';
    return NextResponse.redirect(nextUrl);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
