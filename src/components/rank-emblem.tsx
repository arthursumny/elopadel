import { cn } from '@/lib/utils';

export function RankEmblem({ label, size = 'md', accent = 'cyan' }: { label: string; size?: 'sm' | 'md' | 'lg'; accent?: string }) {
  const sizeClass = size === 'lg' ? 'h-[106px] w-[106px] text-[26px]' : size === 'sm' ? 'h-10 w-10 text-[10px]' : 'h-[72px] w-[72px] text-[17px]';
  const accentClass = accent === 'gold' ? 'from-amber-200 via-amber-400 to-orange-500 text-amber-950' : accent === 'lime' ? 'from-lime via-lime-300 to-cyan text-ink' : accent === 'violet' ? 'from-violet-300 via-violet-500 to-cyan text-white' : 'from-cyan via-cyan-300 to-blue-500 text-ink';
  return <div className={cn('relative grid rotate-45 place-items-center rounded-[24%] bg-gradient-to-br shadow-[0_0_35px_rgba(76,226,209,.18)]', accentClass, sizeClass)}><span className="-rotate-45 text-center font-black leading-[.9]">{label.replace('ª ', 'ª\n').split('\n').map((part, index) => <span key={index} className="block">{part}</span>)}</span><span className="pointer-events-none absolute inset-[5px] rounded-[20%] border border-black/20" /></div>;
}
