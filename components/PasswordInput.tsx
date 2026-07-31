'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, InputHTMLAttributes } from 'react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  containerClassName?: string;
}

export default function PasswordInput({ containerClassName = '', className = '', ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className={`relative ${containerClassName}`}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={className}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-gold hover:text-gold-light transition-colors duration-200 bg-transparent hover:bg-transparent focus:bg-transparent cursor-pointer p-1 flex items-center justify-center border-0 outline-none focus:outline-none focus-visible:outline-none shadow-none appearance-none z-10"
        tabIndex={-1}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}
