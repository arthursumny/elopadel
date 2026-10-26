export default function Loading() {
  return (
    <div className="app-gradient min-h-screen px-5 py-7 sm:px-8" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="mx-auto max-w-[1440px]">
        <div className="flex items-center justify-between border-b border-white/[.07] pb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-lime/20" />
            <div className="h-4 w-28 rounded bg-white/[.08]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-white/[.05]" />
            <div className="h-10 w-24 rounded-xl bg-white/[.05]" />
          </div>
        </div>

        <div className="mt-10 space-y-8">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded bg-lime/15" />
            <div className="h-9 w-full max-w-md rounded-lg bg-white/[.08]" />
            <div className="h-4 w-full max-w-xl rounded bg-white/[.05]" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            <div className="h-72 rounded-3xl border border-white/[.06] bg-white/[.035]" />
            <div className="h-72 rounded-3xl border border-white/[.06] bg-white/[.025]" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-32 rounded-2xl border border-white/[.06] bg-white/[.025]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
