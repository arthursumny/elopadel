'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import {
  buildLocationOptions,
  clubIdForLocation,
  clubNameFor,
  clubsForLocation,
  locationKey,
  parseLocationKey,
  type ProfileCity,
  type ProfileClub,
  type ProfileEditSnapshot,
} from '@/lib/profile-edit-ui';

type FormState = { city: string; state: string; country: string; clubId: string };

function formFrom(profile: ProfileEditSnapshot): FormState {
  return { city: profile.city, state: profile.state, country: profile.country, clubId: profile.clubId ?? '' };
}

export function ProfileEditor({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: ProfileEditSnapshot, pendingClubName: string | null) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profile, setProfile] = useState<ProfileEditSnapshot | null>(null);
  const [cities, setCities] = useState<ProfileCity[]>([]);
  const [clubs, setClubs] = useState<ProfileClub[]>([]);
  const [form, setForm] = useState<FormState>({ city: '', state: '', country: 'Brasil', clubId: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const cityRef = useRef<HTMLSelectElement>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');

    Promise.all([
      fetch('/api/me/profile', { cache: 'no-store' }),
      fetch('/api/clubs', { cache: 'no-store' }),
    ])
      .then(async ([profileResponse, catalogResponse]) => {
        const profileData = await profileResponse.json().catch(() => ({}));
        const catalogData = await catalogResponse.json().catch(() => ({}));
        if (!profileResponse.ok) throw new Error(profileData.error ?? 'Não foi possível carregar seu perfil.');
        if (!catalogResponse.ok) throw new Error(catalogData.error ?? 'Não foi possível carregar as cidades e clubes.');
        if (!profileData.profile) throw new Error('Não foi possível carregar seu perfil.');
        if (cancelled) return;
        setProfile(profileData.profile as ProfileEditSnapshot);
        setCities(Array.isArray(catalogData.cities) ? catalogData.cities : []);
        setClubs(Array.isArray(catalogData.clubs) ? catalogData.clubs : []);
        setForm(formFrom(profileData.profile as ProfileEditSnapshot));
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, retryToken]);

  useEffect(() => {
    if (!open || loading || loadError) return;
    cityRef.current?.focus();
  }, [open, loading, loadError]);

  useEffect(() => {
    if (saveError) saveErrorRef.current?.focus();
  }, [saveError]);

  const location = form;
  const locationOptions = buildLocationOptions(cities, location);
  const availableClubs = clubsForLocation(clubs, location);
  const selectedClub = availableClubs.find((club) => club.id === form.clubId);
  const selectedClubName = selectedClub?.name ?? (profile?.currentClub?.id === form.clubId ? profile.currentClub.name : null);
  const pendingName = profile ? clubNameFor(profile, clubs) ?? (profile.clubId ? 'Clube aguardando aprovação' : null) : null;

  function changeLocation(value: string) {
    const parsed = parseLocationKey(value);
    if (!parsed) return;
    setForm((current) => ({ ...parsed, clubId: clubIdForLocation(current.clubId, parsed, clubs) }));
    setSaveError('');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          city: form.city,
          state: form.state,
          country: form.country,
          clubId: form.clubId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(data.error ?? 'Não foi possível salvar seu perfil.');
        return;
      }
      if (!data.profile) {
        setSaveError('Não foi possível confirmar a atualização do perfil.');
        return;
      }
      onSaved(data.profile as ProfileEditSnapshot, clubNameFor(data.profile as ProfileEditSnapshot, clubs));
      onClose();
      router.refresh();
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      eyebrow="Seu perfil"
      title="Editar perfil"
      description="Atualize sua cidade e seu clube principal."
      size="md"
      closeOnBackdrop={false}
      closeLabel="Fechar edição de perfil"
      footer={
        !loading && !loadError ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/[.12] px-4 py-3 text-xs font-bold text-white/75 transition hover:text-white disabled:opacity-50">Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={saving || !form.city} aria-busy={saving} className="flex items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink transition hover:bg-lime-300 disabled:opacity-50">
              {saving ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Salvando...</> : <><Check size={14} aria-hidden="true" /> Salvar alterações</>}
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/[.12] px-4 py-3 text-xs font-bold text-white/75 hover:text-white">Fechar</button>
          </div>
        )
      }
    >
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-soft"><Loader2 size={17} className="animate-spin text-lime" aria-hidden="true" /> Carregando perfil...</div>
      ) : loadError ? (
        <div className="space-y-4 py-4">
          <p role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-sm font-semibold text-coral">{loadError}</p>
          <button type="button" onClick={() => setRetryToken((current) => current + 1)} className="flex items-center gap-2 rounded-xl border border-white/[.12] px-4 py-3 text-xs font-bold text-white/75 hover:text-lime"><RefreshCw size={14} aria-hidden="true" /> Tentar novamente</button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="flex items-start gap-3 rounded-2xl border border-cyan/15 bg-cyan/[.04] p-4">
            <MapPin size={17} className="mt-0.5 shrink-0 text-cyan" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-white/85">{profile?.currentClub ? `Clube principal atual: ${profile.currentClub.name}` : 'Sem clube principal aprovado.'}</p>
              {profile?.clubStatus === 'pending' && pendingName && (
                <p className="mt-1 text-xs leading-relaxed text-soft">Vínculo aguardando aprovação: {pendingName}. O novo clube precisa aprovar seu vínculo.</p>
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-white/70">Cidade</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3 focus-within:border-lime/40">
              <select
                ref={cityRef}
                id="profile-editor-city"
                name="city"
                value={locationKey(location)}
                onChange={(event) => changeLocation(event.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
              >
                {locationOptions.map((option) => (
                  <option key={locationKey(option)} value={locationKey(option)} className="bg-[#121820]">
                    {option.city} - {option.state}{option.country !== 'Brasil' ? `, ${option.country}` : ''}{option.clubCount === 0 ? ' (sem clubes ativos)' : ''}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-white/70">Clube principal</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3 focus-within:border-lime/40">
              <select
                id="profile-editor-club"
                name="clubId"
                value={form.clubId}
                onChange={(event) => { setForm((current) => ({ ...current, clubId: event.target.value })); setSaveError(''); }}
                className="w-full bg-transparent text-sm text-white outline-none"
              >
                <option value="" className="bg-[#121820]">Sem clube principal</option>
                {availableClubs.map((club) => <option key={club.id} value={club.id} className="bg-[#121820]">{club.name} — {club.city}/{club.state}</option>)}
                {form.clubId && !selectedClub && (
                  <option value={form.clubId} className="bg-[#121820]">{selectedClubName ?? 'Clube selecionado'}</option>
                )}
              </select>
            </span>
          </label>

          <p className="text-xs leading-relaxed text-meta">
            {form.clubId === '' ? 'Sem clube principal. Vínculos aprovados continuam no seu histórico.' : form.clubId === profile?.currentClub?.id ? 'Este é seu clube principal aprovado.' : 'A troca pode gerar uma solicitação de vínculo.'}
          </p>

          {saveError && <p ref={saveErrorRef} id="profile-editor-save-error" tabIndex={-1} role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-sm font-semibold text-coral outline-none focus:ring-2 focus:ring-coral/40 focus:ring-offset-2 focus:ring-offset-[#121820]">{saveError}</p>}
        </form>
      )}
    </Dialog>
  );
}
