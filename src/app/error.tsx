'use client';

import Link from 'next/link';
import { ArrowLeft, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Brand } from '@/components/app-shell';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="app-gradient grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-lg">
        <Brand />
        <section className="glass mt-10 rounded-3xl p-7 text-center sm:p-10" role="alert">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral/10 text-coral">
            <TriangleAlert size={26} aria-hidden="true" />
          </span>
          <p className="eyebrow mt-7 text-coral">Algo saiu do ritmo</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-.05em]">Não foi possível carregar esta tela.</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-soft">
            Pode ser uma instabilidade momentânea. Tente novamente; se continuar, volte para o início.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => retry()} className="flex items-center justify-center gap-2 rounded-xl bg-lime px-5 py-3 text-xs font-black text-ink transition hover:bg-lime-300">
              <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
            </button>
            <Link href="/" className="flex items-center justify-center gap-2 rounded-xl border border-white/[.12] bg-white/[.04] px-5 py-3 text-xs font-bold text-white/80 transition hover:border-lime/30 hover:text-lime">
              <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
