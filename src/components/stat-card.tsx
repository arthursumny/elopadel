import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

export function StatCard({ label, value, detail, icon: Icon, accent = 'lime', trend }: { label: string; value: string; detail?: string; icon: LucideIcon; accent?: 'lime' | 'cyan' | 'coral'; trend?: string }) {
  const colors = { lime: 'text-lime bg-lime/10', cyan: 'text-cyan bg-cyan/10', coral: 'text-coral bg-coral/10' };
  return <div className="glass rounded-2xl p-5"><div className="flex items-start justify-between"><span className={cn('grid h-9 w-9 place-items-center rounded-xl', colors[accent])}><Icon size={17} /></span>{trend && <span className="flex items-center gap-1 text-[10px] font-bold text-lime"><ArrowUpRight size={13} /> {trend}</span>}</div><p className="mt-5 text-[11px] font-semibold uppercase tracking-[.13em] text-white/35">{label}</p><div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl font-black tracking-tight">{value}</strong>{detail && <span className="text-xs text-white/35">{detail}</span>}</div></div>;
}

function cn(...values: Array<string | undefined>) { return values.filter(Boolean).join(' '); }
