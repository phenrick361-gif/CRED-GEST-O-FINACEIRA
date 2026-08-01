import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
export default function Page(){ return (
  <Suspense fallback={null}>
    <AuthForm mode="forgot" />
  </Suspense>
); }
