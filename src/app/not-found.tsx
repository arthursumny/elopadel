import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Brand } from '@/components/app-shell';

export default function NotFound() {
  return (
    <main className="app-gradient grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-lg">
        <Brand />
        <section className="glass mt-10 rounded-3xl p-7 text-center sm:p-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan/10 text-cyan">
            <SearchX size={26} aria-hidden="true" />
          </span>
          <p className="eyebrow mt-7">Erro 404</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-.05em]">Essa página saiu da quadra.</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-soft">
            O endereço não existe ou foi movido. Volte para o início e continue de onde parou.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/" className="flex items-center justify-center gap-2 rounded-xl bg-lime px-5 py-3 text-xs font-black text-ink transition hover:bg-lime-300">
              <ArrowLeft size={15} aria-hidden="true" /> Voltar ao início
            </Link>
            <Link href="/login" className="rounded-xl border border-white/[.12] bg-white/[.04] px-5 py-3 text-xs font-bold text-white/80 transition hover:border-lime/30 hover:text-lime">
              Entrar na conta
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
