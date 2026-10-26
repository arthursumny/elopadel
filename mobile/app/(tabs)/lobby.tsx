import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Search,
  Users,
  User,
  Shield,
  Clock,
  Calendar,
  MapPin,
  CheckCircle,
  XCircle,
  Radio,
  UserPlus,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import { Button } from '../../src/components/Button';
import { matchmakingApi } from '../../src/api/matchmaking';
import type {
  ActiveMatchSearch,
  CourtSide,
  MatchmakingClub,
  MatchMode,
} from '../../src/api/types';
import { clubsForMatchmakingLocation, isMatchmakingLocationProofFresh, MatchmakingLocationError, resolveCurrentMatchmakingLocation, type MatchmakingLocationProof } from '../../src/hooks/matchmaking-location';

function normalizeLocality(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function locationMatchesSearch(location: MatchmakingLocationProof, search: ActiveMatchSearch, clubs: MatchmakingClub[]) {
  if (normalizeLocality(location.city) !== normalizeLocality(search.city)) return false;
  const selectedClub = clubs.find((club) => club.id === search.clubId);
  if (selectedClub) return clubsForMatchmakingLocation(clubs, location).some((club) => club.id === selectedClub.id);
  const cityClubs = clubs.filter((club) => normalizeLocality(club.city) === normalizeLocality(search.city));
  return cityClubs.length === 0 || clubsForMatchmakingLocation(clubs, location).length > 0;
}

// Generate next 14 calendar dates for quick selection
function getAvailableDates(): Array<{ dateString: string; label: string; weekday: string }> {
  const dates = [];
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    dates.push({
      dateString,
      label: `${d.getDate()} ${months[d.getMonth()]}`,
      weekday: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : days[d.getDay()],
    });
  }
  return dates;
}

export default function LobbyScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    partnerId?: string;
    partnerName?: string;
    partnerHandle?: string;
    partnerTier?: string;
  }>();

  // Active search polling state
  const [activeSearch, setActiveSearch] = useState<ActiveMatchSearch | null>(null);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [partyType, setPartyType] = useState<'solo' | 'duo'>('solo');
  const [mode, setMode] = useState<MatchMode>('ranked');
  const [sidePreference, setSidePreference] = useState<CourtSide>('any');
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const available = getAvailableDates();
    return available.length > 0 ? [available[0].dateString] : [];
  });
  const [timeFrom, setTimeFrom] = useState<string>('18:00');
  const [timeTo, setTimeTo] = useState<string>('22:00');
  // Friendly city is intentionally independent from the GPS-derived ranked city.
  const [city, setCity] = useState<string>(user?.city || 'São Paulo');
  const [clubs, setClubs] = useState<MatchmakingClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [rankedLocation, setRankedLocation] = useState<MatchmakingLocationProof | null>(null);
  const [readyLocation, setReadyLocation] = useState<{ city: string; state: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const locationRequestLock = useRef(false);
  const submitLock = useRef(false);

  // Partner selection state
  const [partner, setPartner] = useState<{
    id: string;
    name: string;
    handle: string;
    tier: string;
  } | null>(null);

  // Update partner if coming back from invite-partner modal
  useEffect(() => {
    if (params.partnerId && params.partnerName) {
      setPartner({
        id: params.partnerId,
        name: params.partnerName,
        handle: params.partnerHandle || '',
        tier: params.partnerTier || '5ª I',
      });
      setPartyType('duo');
    }
  }, [params.partnerId, params.partnerName, params.partnerHandle, params.partnerTier]);

  // Radar Animation for searching state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (activeSearch?.status === 'searching') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeSearch?.status, pulseAnim]);

  // Fetch search status
  const fetchStatus = useCallback(async () => {
    try {
      const search = await matchmakingApi.getSearchStatus();
      setActiveSearch(search);

      // Auto-navigate if match found
      if (search?.status === 'matched' && search.matchId) {
        router.push(`/match/${search.matchId}`);
      }
    } catch (err) {
      console.warn('[Lobby] Falha ao consultar status de busca:', err);
    } finally {
      setLoadingSearch(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
    // Poll every 4 seconds if in active lobby or searching
    const interval = setInterval(() => {
      fetchStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    let cancelled = false;
    matchmakingApi.getClubs()
      .then(({ clubs: availableClubs }) => {
        if (!cancelled) setClubs(availableClubs || []);
      })
      .catch(() => {
        if (!cancelled) setClubs([]);
      })
      .finally(() => {
        if (!cancelled) setClubsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Toggle date selection
  const toggleDate = (dateString: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateString)
        ? prev.length > 1
          ? prev.filter((d) => d !== dateString)
          : prev
        : [...prev, dateString].sort()
    );
  };

  const resolveAndShowRankedLocation = async () => {
    if (locationRequestLock.current) return null;
    locationRequestLock.current = true;
    setLocationLoading(true);
    setLocationError('');
    setSubmitError('');
    try {
      const nextLocation = await resolveCurrentMatchmakingLocation();
      setRankedLocation(nextLocation);
      setReadyLocation({ city: nextLocation.city, state: nextLocation.state });
      setSelectedClubId((current) => clubsForMatchmakingLocation(clubs, nextLocation).some((club) => club.id === current) ? current : '');
      return nextLocation;
    } catch (error) {
      const message = error instanceof MatchmakingLocationError ? error.message : error instanceof Error ? error.message : 'Não foi possível validar sua localização. Tente novamente.';
      setLocationError(message);
      setRankedLocation(null);
      return null;
    } finally {
      locationRequestLock.current = false;
      setLocationLoading(false);
    }
  };

  const changeMode = (nextMode: MatchMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setRankedLocation(null);
    setLocationError('');
    setSelectedClubId('');
  };

  // Start Search / Send Duo Invite
  const handleStartSearch = async () => {
    if (submitLock.current) return;
    if (selectedDates.length === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos uma data para buscar.');
      return;
    }

    if (partyType === 'duo' && !partner) {
      Alert.alert('Atenção', 'Selecione seu parceiro de dupla antes de buscar.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      let locationProof: MatchmakingLocationProof | null = null;
      if (mode === 'ranked') {
        locationProof = isMatchmakingLocationProofFresh(rankedLocation) ? rankedLocation : await resolveAndShowRankedLocation();
        if (!locationProof) return;
      }
      const searchCity = mode === 'ranked' ? locationProof!.city : city.trim() || user?.city || 'São Paulo';
      const validClubId = mode === 'ranked'
        ? locationProof && clubsForMatchmakingLocation(clubs, locationProof).some((club) => club.id === selectedClubId) ? selectedClubId : undefined
        : clubs.some((club) => club.id === selectedClubId && normalizeLocality(club.city) === normalizeLocality(searchCity)) ? selectedClubId : undefined;
      const res = await matchmakingApi.createSearch({
        partyType,
        partnerId: partyType === 'duo' ? partner?.id : undefined,
        mode,
        dates: selectedDates,
        from: timeFrom,
        to: timeTo,
        city: searchCity,
        clubId: validClubId,
        sidePreference,
        ...(mode === 'ranked' ? { locationToken: locationProof!.token } : {}),
      });
      // The proof is used only for this immediate request and stays in memory.
      setRankedLocation(null);

      if (res.matched && res.matchId) {
        router.push(`/match/${res.matchId}`);
      } else {
        await fetchStatus();
      }
    } catch (err: any) {
      const message = err.message || 'Não foi possível iniciar a busca.';
      setSubmitError(message);
      if (mode === 'ranked' && /localiza|cidade|gps|precisa|expirad/i.test(message)) setRankedLocation(null);
    } finally {
      setRankedLocation(null);
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  // Cancel Active Search
  const handleCancelSearch = async () => {
    setSubmitting(true);
    try {
      await matchmakingApi.cancelSearch(activeSearch?.id);
      setActiveSearch(null);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cancelar busca.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Duo Readiness
  const handleToggleReady = async () => {
    if (!activeSearch || submitLock.current) return;
    const nextReady = !activeSearch.myReady;
    submitLock.current = true;
    setSubmitting(true);
    setLocationError('');
    setSubmitError('');
    if (nextReady && activeSearch.mode === 'ranked') setReadyLocation(null);
    try {
      let locationToken: string | undefined;
      if (nextReady && activeSearch.mode === 'ranked') {
        const location = await resolveCurrentMatchmakingLocation();
        setReadyLocation({ city: location.city, state: location.state });
        if (!locationMatchesSearch(location, activeSearch, clubs)) {
          setLocationError(`Sua localização atual é ${location.city} — ${location.state}, mas o saguão é de ${activeSearch.city}. A dupla só pode iniciar a busca na mesma cidade e UF. Volte à cidade do saguão ou cancele e crie outro.`);
          return;
        }
        locationToken = location.token;
      }
      await matchmakingApi.setReady(activeSearch.id, nextReady, sidePreference, locationToken);
      await fetchStatus();
    } catch (err: any) {
      const message = err.message || 'Falha ao alterar prontidão.';
      setLocationError(message);
      setSubmitError(message);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const datesList = getAvailableDates();
  const visibleClubs = mode === 'ranked'
    ? rankedLocation ? clubsForMatchmakingLocation(clubs, rankedLocation) : []
    : clubs.filter((club) => normalizeLocality(club.city) === normalizeLocality(city));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header with Player Summary */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.title}>Saguão Competitivo</Text>
            <Text style={styles.subtitle}>Encontre partidas de Padel</Text>
          </View>
          <View style={styles.userBadge}>
            <RankEmblem label={user?.tier || '6ª II'} size="sm" />
          </View>
        </View>

        {/* =========================================================================
            STATE 1: MATCH FORMED (status === 'matched')
           ========================================================================= */}
        {activeSearch?.status === 'matched' && activeSearch.matchId && (
          <GlassCard variant="neon-lime" style={styles.stateCard}>
            <CheckCircle size={36} color="#c9ff4a" style={{ marginBottom: 12 }} />
            <Text style={styles.stateHeading}>Partida Formada!</Text>
            <Text style={styles.stateSub}>
              Os 4 participantes foram definidos e a sala de jogo está pronta.
            </Text>
            <Button
              variant="lime"
              size="lg"
              fullWidth
              style={{ marginTop: 16 }}
              onPress={() => router.push(`/match/${activeSearch.matchId}`)}
            >
              Entrar na Sala da Partida
            </Button>
          </GlassCard>
        )}

        {/* =========================================================================
            STATE 2: SEARCHING RADAR (status === 'searching')
           ========================================================================= */}
        {activeSearch?.status === 'searching' && (
          <GlassCard variant="elevated" style={styles.stateCard}>
            <Animated.View
              style={[
                styles.radarCircle,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Radio size={40} color="#c9ff4a" />
            </Animated.View>

            <Text style={styles.stateHeading}>Buscando Adversários...</Text>
            <Text style={styles.stateSub}>
              Procurando jogadores no seu nível de MMR em {activeSearch.city}.
            </Text>

            <View style={styles.searchSummaryBox}>
              <Text style={styles.summaryText}>
                Modo: <Text style={styles.summaryHighlight}>{activeSearch.mode === 'ranked' ? 'Ranqueada' : 'Amistosa'}</Text>
              </Text>
              <Text style={styles.summaryText}>
                Formação: <Text style={styles.summaryHighlight}>{activeSearch.partyType === 'duo' ? 'Dupla' : 'Solo'}</Text>
              </Text>
              <Text style={styles.summaryText}>
                Lado: <Text style={styles.summaryHighlight}>{activeSearch.sidePreference}</Text>
              </Text>
            </View>

            <Button
              variant="coral"
              size="md"
              fullWidth
              style={{ marginTop: 16 }}
              loading={submitting}
              onPress={handleCancelSearch}
            >
              Cancelar Busca
            </Button>
          </GlassCard>
        )}

        {/* =========================================================================
            STATE 3: DUO LOBBY READINESS (status === 'lobby')
           ========================================================================= */}
        {activeSearch?.status === 'lobby' && (
          <GlassCard variant="elevated" style={styles.stateCard}>
            <Users size={32} color="#4ce2d1" style={{ marginBottom: 8 }} />
            <Text style={styles.stateHeading}>Saguão da Dupla</Text>
            <Text style={styles.stateSub}>
              Aguardando ambos os parceiros confirmarem prontidão para iniciar a busca.
            </Text>

            {/* 2/2 Indicator */}
            <View style={styles.duoReadinessRow}>
              {/* Player 1 (You) */}
              <View style={[styles.playerReadyBox, activeSearch.myReady && styles.readyActive]}>
                <Text style={styles.playerReadyName} numberOfLines={1}>
                  {user?.displayName || 'Você'}
                </Text>
                <Text style={styles.playerReadyHandle}>Você</Text>
                <Text style={[styles.readyStatus, activeSearch.myReady ? styles.textLime : styles.textMuted]}>
                  {activeSearch.myReady ? '✓ Pronto' : 'Aguardando'}
                </Text>
              </View>

              {/* Player 2 (Partner) */}
              <View style={[styles.playerReadyBox, activeSearch.partnerReady && styles.readyActive]}>
                <Text style={styles.playerReadyName} numberOfLines={1}>
                  {activeSearch.partnerName || 'Parceiro'}
                </Text>
                <Text style={styles.playerReadyHandle}>{activeSearch.partnerHandle || '@dupla'}</Text>
                <Text style={[styles.readyStatus, activeSearch.partnerReady ? styles.textLime : styles.textMuted]}>
                  {activeSearch.partnerReady ? '✓ Pronto' : 'Aguardando'}
                </Text>
              </View>
            </View>

              <View style={styles.readinessCounter}>
              <Text style={styles.counterText}>
                {Number(Boolean(activeSearch.myReady)) + Number(Boolean(activeSearch.partnerReady))} de 2 prontos
              </Text>
            </View>

            {activeSearch.mode === 'ranked' && (
              <View style={[styles.locationCard, { marginTop: 14, width: '100%' }]}>
                <Text style={styles.locationHeading}>Confirmação da cidade</Text>
                <Text style={styles.locationHelp}>Ao confirmar prontidão, vamos verificar seu GPS atual. Os dois integrantes precisam validar a mesma cidade e UF deste saguão antes de buscar adversários.</Text>
                {readyLocation && (
                  <View style={styles.locationVerified}>
                    <Text style={styles.locationCity}>Localização detectada: {readyLocation.city} — {readyLocation.state}</Text>
                    <View style={styles.attributionRow}>
                      <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.geoapify.com').catch(() => Alert.alert('Link indisponível', 'Não foi possível abrir o site da Geoapify.')); }}>
                        <Text style={styles.attributionLink}>Geoapify</Text>
                      </TouchableOpacity>
                      <Text style={styles.attributionSeparator}> · </Text>
                      <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => Alert.alert('Link indisponível', 'Não foi possível abrir os créditos do OpenStreetMap.')); }}>
                        <Text style={styles.attributionLink}>© OpenStreetMap</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {locationError ? <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text> : null}
              </View>
            )}

            <Button
              variant={activeSearch.myReady ? 'secondary' : 'lime'}
              size="lg"
              fullWidth
              style={{ marginTop: 14 }}
              loading={submitting}
              onPress={handleToggleReady}
            >
              {activeSearch.myReady ? 'Retirar Confirmação' : 'Confirmar Prontidão'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              fullWidth
              style={{ marginTop: 10 }}
              loading={submitting}
              onPress={handleCancelSearch}
            >
              Desfazer Dupla / Cancelar
            </Button>
          </GlassCard>
        )}

        {/* =========================================================================
            STATE 4 & 5: SEARCH FORM (when idle / no active search)
           ========================================================================= */}
        {!activeSearch && (
          <>
            {/* Mode & Party Type Selectors */}
            <GlassCard style={styles.formCard}>
              <Text style={styles.fieldLabel}>Modo de Partida</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, mode === 'ranked' && styles.toggleBtnActive]}
                  onPress={() => changeMode('ranked')}
                >
                  <Shield size={16} color={mode === 'ranked' ? '#090b10' : '#7f8b9c'} />
                  <Text style={[styles.toggleText, mode === 'ranked' && styles.toggleTextActive]}>
                    Ranqueada
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, mode === 'friendly' && styles.toggleBtnActive]}
                  onPress={() => changeMode('friendly')}
                >
                  <Users size={16} color={mode === 'friendly' ? '#090b10' : '#7f8b9c'} />
                  <Text style={[styles.toggleText, mode === 'friendly' && styles.toggleTextActive]}>
                    Amistosa
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Formação</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, partyType === 'solo' && styles.toggleBtnActive]}
                  onPress={() => setPartyType('solo')}
                >
                  <User size={16} color={partyType === 'solo' ? '#090b10' : '#7f8b9c'} />
                  <Text style={[styles.toggleText, partyType === 'solo' && styles.toggleTextActive]}>
                    Fila Solo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, partyType === 'duo' && styles.toggleBtnActive]}
                  onPress={() => setPartyType('duo')}
                >
                  <Users size={16} color={partyType === 'duo' ? '#090b10' : '#7f8b9c'} />
                  <Text style={[styles.toggleText, partyType === 'duo' && styles.toggleTextActive]}>
                    Em Dupla
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Partner Section (Only in Duo) */}
              {partyType === 'duo' && (
                <View style={styles.partnerSection}>
                  <Text style={styles.fieldLabel}>Parceiro de Dupla</Text>
                  {partner ? (
                    <View style={styles.partnerSelectedCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.partnerName}>{partner.name}</Text>
                        <Text style={styles.partnerHandle}>{partner.handle}</Text>
                      </View>
                      <RankEmblem label={partner.tier} size="sm" />
                      <TouchableOpacity
                        style={styles.changePartnerBtn}
                        onPress={() => router.push('/matchmaking/invite-partner')}
                      >
                        <Text style={styles.changePartnerText}>Trocar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Button
                      variant="outline"
                      size="md"
                      fullWidth
                      style={{ marginTop: 6 }}
                      onPress={() => router.push('/matchmaking/invite-partner')}
                    >
                      <UserPlus size={16} color="#c9ff4a" style={{ marginRight: 6 }} />
                      Convidar Amigo da Lista
                    </Button>
                  )}
                </View>
              )}

              {/* Court Side Preference */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Lado de Quadra</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, sidePreference === 'left' && styles.toggleBtnActive]}
                  onPress={() => setSidePreference('left')}
                >
                  <Text style={[styles.toggleText, sidePreference === 'left' && styles.toggleTextActive]}>
                    Esquerda
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, sidePreference === 'right' && styles.toggleBtnActive]}
                  onPress={() => setSidePreference('right')}
                >
                  <Text style={[styles.toggleText, sidePreference === 'right' && styles.toggleTextActive]}>
                    Direita
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, sidePreference === 'any' && styles.toggleBtnActive]}
                  onPress={() => setSidePreference('any')}
                >
                  <Text style={[styles.toggleText, sidePreference === 'any' && styles.toggleTextActive]}>
                    Qualquer
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            {/* Dates & Schedule */}
            <GlassCard style={styles.formCard}>
              <Text style={styles.fieldLabel}>Dias Disponíveis (Múltipla Seleção)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesScroll}>
                {datesList.map((d) => {
                  const isSelected = selectedDates.includes(d.dateString);
                  return (
                    <TouchableOpacity
                      key={d.dateString}
                      style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                      onPress={() => toggleDate(d.dateString)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dateWeekday, isSelected && styles.textBlack]}>
                        {d.weekday}
                      </Text>
                      <Text style={[styles.dateLabel, isSelected && styles.textBlack]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Time Window */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Janela de Horário</Text>
              <View style={styles.timeRow}>
                <View style={styles.timeBox}>
                  <Text style={styles.timeLabel}>Início</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={timeFrom}
                    onChangeText={setTimeFrom}
                    placeholder="18:00"
                    placeholderTextColor="#7f8b9c"
                  />
                </View>
                <Text style={styles.timeSeparator}>até</Text>
                <View style={styles.timeBox}>
                  <Text style={styles.timeLabel}>Fim</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={timeTo}
                    onChangeText={setTimeTo}
                    placeholder="22:00"
                    placeholderTextColor="#7f8b9c"
                  />
                </View>
              </View>

              {mode === 'ranked' ? (
                <View style={[styles.locationCard, { marginTop: 18 }]}>
                  <View style={styles.locationHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationHeading}>Cidade da sua localização atual</Text>
                      <Text style={styles.locationHelp}>A cidade ranqueada vem do GPS. Não é possível escolher outra cidade manualmente.</Text>
                    </View>
                    <MapPin size={18} color="#4ce2d1" />
                  </View>
                  {rankedLocation ? (
                    <View style={styles.locationVerified}>
                      <Text style={styles.locationCity}>{rankedLocation.city} — {rankedLocation.state}</Text>
                      <Text style={styles.locationSmall}>Usamos sua localização apenas para confirmar a cidade desta busca.</Text>
                      <View style={styles.attributionRow}>
                        <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.geoapify.com').catch(() => Alert.alert('Link indisponível', 'Não foi possível abrir o site da Geoapify.')); }}>
                          <Text style={styles.attributionLink}>Geoapify</Text>
                        </TouchableOpacity>
                        <Text style={styles.attributionSeparator}> · </Text>
                        <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => Alert.alert('Link indisponível', 'Não foi possível abrir os créditos do OpenStreetMap.')); }}>
                          <Text style={styles.attributionLink}>© OpenStreetMap</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                  <Button variant="outline" size="md" fullWidth loading={locationLoading} disabled={submitting} style={{ marginTop: 12 }} onPress={() => { void resolveAndShowRankedLocation(); }}>
                    {rankedLocation ? 'Atualizar localização' : 'Detectar minha localização'}
                  </Button>
                  {locationError ? <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text> : null}
                  {locationError.toLowerCase().includes('permita o acesso') && (
                    <TouchableOpacity accessibilityRole="button" style={styles.settingsButton} onPress={() => { void Linking.openSettings().catch(() => Alert.alert('Configurações indisponíveis', 'Abra as configurações do aparelho e permita o acesso à localização durante o uso do app.')); }}>
                      <Text style={styles.settingsButtonText}>Abrir configurações do aparelho</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.ratingExpansion}>
                    <Text style={styles.ratingExpansionTitle}>A faixa de rating pode se ampliar enquanto espera</Text>
                    <Text style={styles.ratingExpansionText}>Começa em até 300 pontos de diferença; pode chegar a 450 após 2 min e a 600 após 5 min, sempre dentro do limite da patente. A ampliação conforme o tempo de espera dos jogadores depende da manutenção do sistema: os prazos não são garantidos e a cidade da busca não muda.</Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Cidade</Text>
                  <View style={styles.inputWrapper}>
                    <MapPin size={16} color="#7f8b9c" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      value={city}
                      onChangeText={(nextCity) => {
                        setCity(nextCity);
                        if (!clubs.some((club) => club.id === selectedClubId && normalizeLocality(club.city) === normalizeLocality(nextCity))) setSelectedClubId('');
                      }}
                      placeholder="Cidade"
                      placeholderTextColor="#7f8b9c"
                    />
                  </View>
                </>
              )}

              <View style={styles.clubsSection}>
                <Text style={styles.fieldLabel}>Clube</Text>
                {mode === 'ranked' && !rankedLocation ? (
                  <Text style={styles.locationSmall}>Confirme sua localização para ver apenas clubes da cidade e UF detectadas.</Text>
                ) : clubsLoading ? (
                  <Text style={styles.locationSmall}>Carregando clubes locais…</Text>
                ) : visibleClubs.length === 0 ? (
                  <Text style={styles.locationSmall}>{mode === 'ranked' ? 'Nenhum clube ativo disponível nesta cidade e UF.' : 'Nenhum clube ativo encontrado nesta cidade.'}</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubOptions}>
                    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !selectedClubId }} onPress={() => setSelectedClubId('')} style={[styles.clubChip, !selectedClubId && styles.clubChipSelected]}>
                      <Text style={[styles.clubChipText, !selectedClubId && styles.clubChipTextSelected]}>Qualquer clube</Text>
                    </TouchableOpacity>
                    {visibleClubs.map((club) => (
                      <TouchableOpacity key={club.id} accessibilityRole="button" accessibilityState={{ selected: selectedClubId === club.id }} onPress={() => setSelectedClubId(club.id)} style={[styles.clubChip, selectedClubId === club.id && styles.clubChipSelected]}>
                        <Text style={[styles.clubChipText, selectedClubId === club.id && styles.clubChipTextSelected]}>{club.name}{mode === 'ranked' ? ` · ${club.state}` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </GlassCard>

            {/* Submit Action */}
            <Button
              variant="lime"
              size="lg"
              fullWidth
              style={{ marginTop: 6, marginBottom: 24 }}
              loading={submitting}
              onPress={handleStartSearch}
            >
              {partyType === 'duo' ? 'Iniciar Busca em Dupla' : 'Buscar Partida Solo'}
            </Button>
            {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b10',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#7f8b9c',
    marginTop: 2,
  },
  userBadge: {
    padding: 4,
  },
  stateCard: {
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  stateHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  stateSub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  radarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(201, 255, 74, 0.15)',
    borderWidth: 2,
    borderColor: '#c9ff4a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  searchSummaryBox: {
    backgroundColor: '#161c26',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginTop: 16,
    gap: 4,
  },
  summaryText: {
    fontSize: 12,
    color: '#7f8b9c',
  },
  summaryHighlight: {
    color: '#ffffff',
    fontWeight: '700',
  },
  duoReadinessRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 16,
  },
  playerReadyBox: {
    flex: 1,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  readyActive: {
    borderColor: '#c9ff4a',
    backgroundColor: 'rgba(201, 255, 74, 0.08)',
  },
  playerReadyName: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  playerReadyHandle: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 2,
  },
  readyStatus: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  textLime: {
    color: '#c9ff4a',
  },
  textMuted: {
    color: '#7f8b9c',
  },
  readinessCounter: {
    marginTop: 12,
  },
  counterText: {
    color: '#4ce2d1',
    fontWeight: '700',
    fontSize: 13,
  },
  formCard: {
    padding: 18,
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingVertical: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#c9ff4a',
    borderColor: '#c9ff4a',
  },
  toggleText: {
    color: '#7f8b9c',
    fontWeight: '700',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#090b10',
    fontWeight: '900',
  },
  partnerSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#26303d',
  },
  partnerSelectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  partnerName: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  partnerHandle: {
    color: '#c9ff4a',
    fontSize: 11,
    marginTop: 2,
  },
  changePartnerBtn: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changePartnerText: {
    color: '#4ce2d1',
    fontWeight: '700',
    fontSize: 12,
  },
  datesScroll: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 4,
  },
  dateChip: {
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  dateChipSelected: {
    backgroundColor: '#c9ff4a',
    borderColor: '#c9ff4a',
  },
  dateWeekday: {
    color: '#7f8b9c',
    fontSize: 11,
    fontWeight: '600',
  },
  dateLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  textBlack: {
    color: '#090b10',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeBox: {
    flex: 1,
  },
  timeLabel: {
    color: '#7f8b9c',
    fontSize: 11,
    marginBottom: 4,
  },
  timeInput: {
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  timeSeparator: {
    color: '#7f8b9c',
    fontSize: 13,
    marginTop: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
  },
  locationCard: {
    backgroundColor: 'rgba(76, 226, 209, 0.045)',
    borderWidth: 1,
    borderColor: 'rgba(76, 226, 209, 0.18)',
    borderRadius: 14,
    padding: 14,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  locationHeading: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  locationHelp: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  locationVerified: {
    backgroundColor: '#10141c',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 10,
    padding: 11,
    marginTop: 12,
  },
  locationCity: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  locationSmall: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  locationError: {
    color: '#ff9b89',
    backgroundColor: 'rgba(255, 131, 107, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 131, 107, 0.2)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 17,
    padding: 10,
    marginTop: 10,
  },
  settingsButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
  },
  settingsButtonText: {
    color: '#4ce2d1',
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  attributionLink: {
    color: '#94a3b8',
    fontSize: 10,
    textDecorationLine: 'underline',
  },
  attributionSeparator: {
    color: '#64748b',
    fontSize: 10,
  },
  ratingExpansion: {
    borderTopWidth: 1,
    borderTopColor: '#26303d',
    marginTop: 14,
    paddingTop: 12,
  },
  ratingExpansionTitle: {
    color: '#c9ff4a',
    fontSize: 11,
    fontWeight: '800',
  },
  ratingExpansionText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  clubsSection: {
    marginTop: 16,
  },
  clubOptions: {
    paddingVertical: 2,
    gap: 8,
  },
  clubChip: {
    borderWidth: 1,
    borderColor: '#26303d',
    backgroundColor: '#10141c',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  clubChipSelected: {
    borderColor: 'rgba(76, 226, 209, 0.65)',
    backgroundColor: 'rgba(76, 226, 209, 0.1)',
  },
  clubChipText: {
    color: '#a3adbb',
    fontSize: 11,
    fontWeight: '700',
  },
  clubChipTextSelected: {
    color: '#4ce2d1',
  },
  submitError: {
    color: '#ff9b89',
    backgroundColor: 'rgba(255, 131, 107, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 131, 107, 0.2)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 17,
    padding: 10,
    marginBottom: 20,
  },
});
