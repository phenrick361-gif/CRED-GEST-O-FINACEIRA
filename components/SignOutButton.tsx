'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  return <button className="btn btn-dark w-full" style={{borderColor:'rgba(212,175,55,0.2)', fontSize:13}} onClick={async()=>{ await createClient().auth.signOut(); router.replace('/login'); router.refresh(); }}><span style={{fontSize:14}}>🚪</span> Sair</button>;
}
