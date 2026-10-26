import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trophy,
  Users,
  Check,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import { Button } from '../../src/components/Button';
import { matchesApi } from '../../src/api/matches';
import {
  validateBestOfThreeScores,
  calculateQuorumState,
} from '../../src/lib/matchValidation';
import type {
  MatchDetails,
  MatchParticipant,
  SetScore,
} from '../../src/api/types';

export default function MatchRoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Score submission state (Best of 3 sets)
  const [set1A, setSet1A] = useState<string>('6');
  const [set1B, setSet1B] = useState<string>('4');
  const [set2A, setSet2A] = useState<string>('6');
  const [set2B, setSet2B] = useState<string>('3');
  const [set3A, setSet3A] = useState<string>('');
  const [set3B, setSet3B] = useState<string>('');
  const [selectedWinner, setSelectedWinner] = useState<'A' | 'B'>('A');

  // Load match details
  const fetchMatch = useCallback(async () => {
    if (!id) return;
    try {
      const data = await matchesApi.getMatch(id);
      setMatch(data);

      // Prepopulate score inputs if match already has sets
      if (data?.sets && data.sets.length >= 2) {
        setSet1A(String(data.sets[0].a));
        setSet1B(String(data.sets[0].b));
        setSet2A(String(data.sets[1].a));
        setSet2B(String(data.sets[1].b));
        if (data.sets[2]) {
          setSet3A(String(data.sets[2].a));
          setSet3B(String(data.sets[2].b));
        }
        if (data.winner) {
          setSelectedWinner(data.winner);
        }
      }
    } catch (err) {
      console.warn('[MatchRoom] Erro ao carregar partida:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMatch();
    const interval = setInterval(() => {
      fetchMatch();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMatch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMatch();
    setRefreshing(false);
  }, [fetchMatch]);

  // Current participant in this match
  const currentParticipant = useMemo(() => {
    if (!match?.participants || !user) return null;
    return (
      match.participants.find(
        (p) =>
          p.isCurrentPlayer ||
          p.userId === user.id ||
          (user.handle && p.handle?.toLowerCase() === user.handle.toLowerCase())
      ) || null
    );
  }, [match?.participants, user]);

  // Quorum and Divergence Calculation
  const quorum = useMemo(() => {
    if (!match) {
      return {
        isQuorumMet: false,
        isDisputed: false,
        totalVotes: 0,
        votesA: 0,
        votesB: 0,
        hasBothTeams: false,
        teamsRepresentedCount: 0,
      };
    }
    return calculateQuorumState(match.participants, match.winner);
  }, [match]);

  const isDisputed = match?.status === 'disputed' || quorum.isDisputed;
  const isValidated = match?.status === 'validated' || quorum.isQuorumMet;

  // Split participants into Team A and Team B
  const teamA = useMemo(
    () => match?.participants.filter((p) => p.team === 'A') || [],
    [match?.participants]
  );
  const teamB = useMemo(
    () => match?.participants.filter((p) => p.team === 'B') || [],
    [match?.participants]
  );

  // Phase 1: Acceptance Action
  const handleAcceptance = async (decision: 'accept' | 'decline') => {
    if (!id) return;
    setActionLoading(true);
    try {
      const res = await matchesApi.acceptMatch(id, decision);
      Alert.alert(
        decision === 'accept' ? 'Confirmado' : 'Partida Recusada',
        res.message || (decision === 'accept' ? 'Presença confirmada!' : 'Partida cancelada.')
      );
      await fetchMatch();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao registrar aceite.');
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 2: Check-in Action
  const handleCheckIn = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await matchesApi.checkIn(id);
      Alert.alert('Sucesso', 'Sua presença na quadra foi registrada!');
      await fetchMatch();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível confirmar presença.');
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 3: Score Submission Action
  const handleSubmitScore = async () => {
    if (!id) return;

    const s1A = parseInt(set1A, 10);
    const s1B = parseInt(set1B, 10);
    const s2A = parseInt(set2A, 10);
    const s2B = parseInt(set2B, 10);

    const sets: SetScore[] = [
      { a: isNaN(s1A) ? -1 : s1A, b: isNaN(s1B) ? -1 : s1B },
      { a: isNaN(s2A) ? -1 : s2A, b: isNaN(s2B) ? -1 : s2B },
    ];

    if (set3A.trim() !== '' || set3B.trim() !== '') {
      const s3A = parseInt(set3A, 10);
      const s3B = parseInt(set3B, 10);
      sets.push({ a: isNaN(s3A) ? -1 : s3A, b: isNaN(s3B) ? -1 : s3B });
    }

    // Client-side validation before sending
    const validation = validateBestOfThreeScores(sets, selectedWinner);
    if (!validation.valid) {
      Alert.alert('Placar Inválido', validation.error || 'Verifique os games informados.');
      return;
    }

    setActionLoading(true);
    try {
      await matchesApi.submitScore(id, { sets, winner: selectedWinner });
      Alert.alert('Placar Enviado', 'O resultado foi submetido para validação dos 4 jogadores.');
      await fetchMatch();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao enviar placar.');
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 4: Vote Score Action
  const handleVote = async (winner: 'A' | 'B') => {
    if (!id) return;
    setActionLoading(true);
    try {
      await matchesApi.voteScore(id, winner);
      Alert.alert('Voto Registrado', `Você confirmou a vitória da Dupla ${winner}.`);
      await fetchMatch();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao registrar voto.');
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 4: Dispute Action
  const handleDispute = async () => {
    if (!id) return;
    Alert.alert(
      'Contestar Resultado',
      'Tem certeza de que deseja abrir uma contestação? A partida será travada em análise e nenhuma alteração de MMR será realizada até auditoria do clube.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Contestar Partida',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await matchesApi.disputeMatch(id, 'Divergência reportada pelo jogador.');
              Alert.alert('Contestação Registrada', 'O resultado foi congelado para análise.');
              await fetchMatch();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao contestar resultado.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Gripo Court Auto-Booking & Deep Link
  const [bookingCourt, setBookingCourt] = useState(false);
  const [bookedCourtInfo, setBookedCourtInfo] = useState<{ courtName?: string; scheduleId?: number } | null>(null);

  const handleOpenGripo = () => {
    const url = match?.gripoUrl || 'https://gripo.com.br';
    Linking.openURL(url).catch(() => {
      Alert.alert('Erro', 'Não foi possível abrir o link da reserva de quadra.');
    });
  };

  const handleAutoBookGripo = async () => {
    if (!id) return;
    setBookingCourt(true);
    try {
      const res = await matchesApi.bookGripoCourt(id);
      if (res.ok) {
        setBookedCourtInfo({ courtName: res.courtName, scheduleId: res.scheduleId });
        Alert.alert(
          'Reserva Confirmada!',
          res.message || `Quadra ${res.courtName || ''} reservada com sucesso no Gripo.`
        );
      } else {
        Alert.alert(
          'Atenção',
          res.message || 'Não foi possível reservar automaticamente. Deseja abrir o Gripo para reservar manualmente?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir no Gripo', onPress: handleOpenGripo },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Reserva Automática',
        err?.message || 'Não foi possível concluir a reserva automática no Gripo. Deseja abrir o Gripo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir no Gripo', onPress: handleOpenGripo },
        ]
      );
    } finally {
      setBookingCourt(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={styles.matchIdText}>Partida #{id?.slice(0, 8)}</Text>
          <Text style={styles.headerSub}>
            {match?.club || 'Clube de Padel'} • {match?.city || ''}
          </Text>
        </View>

        <View
          style={[
            styles.modeBadge,
            match?.mode === 'ranked' ? styles.modeRanked : styles.modeFriendly,
          ]}
        >
          <Text
            style={[
              styles.modeBadgeText,
              match?.mode === 'ranked' ? { color: '#c9ff4a' } : { color: '#4ce2d1' },
            ]}
          >
            {match?.mode === 'ranked' ? 'Ranqueada' : 'Amistosa'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#c9ff4a"
            colors={['#c9ff4a']}
          />
        }
      >
        {/* =========================================================================
            STATUS BANNER
           ========================================================================= */}
        {isDisputed ? (
          <GlassCard variant="neon-coral" style={styles.statusBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={24} color="#ff836b" />
              <View style={{ flex: 1 }}>
                <Text style={styles.disputeTitle}>Resultado em Análise — Divergência</Text>
                <Text style={styles.disputeSub}>
                  Houve conflito nos votos ou contestação registrada. O MMR foi congelado e o caso foi encaminhado para auditoria da diretoria.
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : isValidated ? (
          <GlassCard variant="neon-lime" style={styles.statusBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Trophy size={24} color="#c9ff4a" />
              <View style={{ flex: 1 }}>
                <Text style={styles.validatedTitle}>Partida Validada com Sucesso!</Text>
                <Text style={styles.validatedSub}>
                  Quorum de 3 votos atingido com ambas as duplas representadas. MMR atualizado!
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : match?.status === 'confirming' ? (
          <GlassCard variant="elevated" style={styles.statusBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Clock size={20} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerHeading}>
                  Fase de Confirmação ({match.acceptedCount}/4)
                </Text>
                <Text style={styles.bannerSub}>
                  A partida inicia quando os 4 participantes aceitarem o jogo.
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : (
          <GlassCard variant="elevated" style={styles.statusBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Users size={20} color="#4ce2d1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerHeading}>
                  Presenças na Quadra ({match?.attendanceCount || 0}/4)
                </Text>
                <Text style={styles.bannerSub}>
                  {match?.attendanceCount === 4
                    ? 'Os quatro jogadores estão na quadra. Bom jogo!'
                    : 'Confirme sua presença ao chegar no clube.'}
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* =========================================================================
            TEAMS DISPLAY: DUPLA A vs DUPLA B
           ========================================================================= */}
        <GlassCard style={styles.teamsContainer}>
          {/* Team A */}
          <View style={styles.teamSection}>
            <Text style={styles.teamTitle}>Dupla A</Text>
            {teamA.map((p) => {
              const isMe = p.id === currentParticipant?.id || p.isCurrentPlayer;
              const hasAccepted = p.matchAcceptance === 'accepted';
              const hasCheckedIn =
                p.attendance === 'claimed-present' || p.attendance === 'present';

              return (
                <View key={p.id} style={styles.playerRow}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {p.name?.slice(0, 2).toUpperCase() || 'PA'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {p.name} {isMe && <Text style={{ color: '#c9ff4a' }}>(Você)</Text>}
                    </Text>
                    <Text style={styles.playerHandle}>{p.handle}</Text>
                    <View style={styles.playerStatusTags}>
                      <Text
                        style={[
                          styles.playerMiniTag,
                          hasAccepted ? styles.tagSuccess : styles.tagPending,
                        ]}
                      >
                        {hasAccepted ? '✓ Aceitou' : 'Aguardando'}
                      </Text>
                      {hasCheckedIn && (
                        <Text style={[styles.playerMiniTag, styles.tagCyan]}>
                          Presença OK
                        </Text>
                      )}
                    </View>
                  </View>
                  <RankEmblem label={p.tier} size="sm" />
                </View>
              );
            })}
          </View>

          {/* VS Divider */}
          <View style={styles.vsDivider}>
            <View style={styles.vsLine} />
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.vsLine} />
          </View>

          {/* Team B */}
          <View style={styles.teamSection}>
            <Text style={styles.teamTitle}>Dupla B</Text>
            {teamB.map((p) => {
              const isMe = p.id === currentParticipant?.id || p.isCurrentPlayer;
              const hasAccepted = p.matchAcceptance === 'accepted';
              const hasCheckedIn =
                p.attendance === 'claimed-present' || p.attendance === 'present';

              return (
                <View key={p.id} style={styles.playerRow}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {p.name?.slice(0, 2).toUpperCase() || 'PB'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {p.name} {isMe && <Text style={{ color: '#c9ff4a' }}>(Você)</Text>}
                    </Text>
                    <Text style={styles.playerHandle}>{p.handle}</Text>
                    <View style={styles.playerStatusTags}>
                      <Text
                        style={[
                          styles.playerMiniTag,
                          hasAccepted ? styles.tagSuccess : styles.tagPending,
                        ]}
                      >
                        {hasAccepted ? '✓ Aceitou' : 'Aguardando'}
                      </Text>
                      {hasCheckedIn && (
                        <Text style={[styles.playerMiniTag, styles.tagCyan]}>
                          Presença OK
                        </Text>
                      )}
                    </View>
                  </View>
                  <RankEmblem label={p.tier} size="sm" />
                </View>
              );
            })}
          </View>
        </GlassCard>

        {/* =========================================================================
            GRIPO COURT BOOKING INTEGRATION
           ========================================================================= */}
        <GlassCard variant="elevated" style={styles.gripoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.gripoTitle}>
                {bookedCourtInfo?.courtName
                  ? `Quadra Reservada: ${bookedCourtInfo.courtName}`
                  : 'Reserva de Quadra no Gripo'}
              </Text>
              <Text style={styles.gripoSub}>
                {bookedCourtInfo
                  ? 'A reserva desta partida está confirmada no clube via Gripo.'
                  : 'Reserve a quadra automaticamente pelo app ou abra o Gripo manualmente.'}
              </Text>
            </View>
            <Shield size={20} color="#c9ff4a" />
          </View>

          {bookedCourtInfo ? (
            <View style={[styles.confirmedBox, { marginTop: 12 }]}>
              <CheckCircle size={18} color="#c9ff4a" />
              <Text style={styles.confirmedBoxText}>
                Quadra {bookedCourtInfo.courtName || ''} garantida para a partida!
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Button
                variant="lime"
                size="sm"
                style={{ flex: 1 }}
                loading={bookingCourt}
                onPress={handleAutoBookGripo}
              >
                Reservar Automático
              </Button>
              <Button
                variant="ghost"
                size="sm"
                style={{ flex: 1 }}
                onPress={handleOpenGripo}
              >
                Abrir no Gripo
              </Button>
            </View>
          )}
        </GlassCard>

        {/* =========================================================================
            PHASE 1: 4-PLAYER ACCEPTANCE FLOW
           ========================================================================= */}
        {match?.status === 'confirming' && (
          <GlassCard style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Confirmação de Participação</Text>
            {currentParticipant?.matchAcceptance === 'accepted' ? (
              <View style={styles.confirmedBox}>
                <CheckCircle size={20} color="#c9ff4a" />
                <Text style={styles.confirmedBoxText}>
                  Você confirmou sua participação. Aguardando demais jogadores.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.actionExplainer}>
                  Confirme que você comparecerá ao clube para disputar esta partida.
                </Text>
                <View style={styles.actionBtnRow}>
                  <Button
                    variant="lime"
                    size="md"
                    style={{ flex: 1 }}
                    loading={actionLoading}
                    onPress={() => handleAcceptance('accept')}
                  >
                    Vou Jogar
                  </Button>
                  <Button
                    variant="coral"
                    size="md"
                    style={{ flex: 1 }}
                    loading={actionLoading}
                    onPress={() => handleAcceptance('decline')}
                  >
                    Não Posso Ir
                  </Button>
                </View>
              </>
            )}
          </GlassCard>
        )}

        {/* =========================================================================
            PHASE 2: ATTENDANCE CHECK-IN (On Court)
           ========================================================================= */}
        {(match?.status === 'confirmed' || match?.status === 'full' || match?.status === 'result-pending') && (
          <GlassCard style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Presença na Quadra (Check-in)</Text>
            {currentParticipant?.attendance === 'claimed-present' ||
            currentParticipant?.attendance === 'present' ? (
              <View style={styles.confirmedBox}>
                <CheckCircle size={20} color="#4ce2d1" />
                <Text style={[styles.confirmedBoxText, { color: '#4ce2d1' }]}>
                  Sua presença na quadra foi registrada com sucesso!
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.actionExplainer}>
                  Ao chegar no clube, confirme sua presença presencial para liberar o placar.
                </Text>
                <Button
                  variant="lime"
                  size="md"
                  fullWidth
                  loading={actionLoading}
                  onPress={handleCheckIn}
                >
                  Estou na Quadra
                </Button>
              </>
            )}
          </GlassCard>
        )}

        {/* =========================================================================
            PHASE 3: BEST-OF-3 SCORE SUBMISSION FORM
           ========================================================================= */}
        {!isValidated && !isDisputed && (
          <GlassCard style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Placar Oficial (Melhor de Três Sets)</Text>
            <Text style={styles.actionExplainer}>
              Informe os games disputados em cada set e a dupla vencedora:
            </Text>

            {/* Set 1 Inputs */}
            <View style={styles.setInputRow}>
              <Text style={styles.setNumberLabel}>1º Set</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set1A}
                onChangeText={setSet1A}
                placeholder="6"
                placeholderTextColor="#7f8b9c"
              />
              <Text style={styles.scoreDivider}>x</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set1B}
                onChangeText={setSet1B}
                placeholder="4"
                placeholderTextColor="#7f8b9c"
              />
            </View>

            {/* Set 2 Inputs */}
            <View style={styles.setInputRow}>
              <Text style={styles.setNumberLabel}>2º Set</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set2A}
                onChangeText={setSet2A}
                placeholder="6"
                placeholderTextColor="#7f8b9c"
              />
              <Text style={styles.scoreDivider}>x</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set2B}
                onChangeText={setSet2B}
                placeholder="3"
                placeholderTextColor="#7f8b9c"
              />
            </View>

            {/* Set 3 Inputs (Tiebreak set) */}
            <View style={styles.setInputRow}>
              <Text style={styles.setNumberLabel}>3º Set (se houver)</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set3A}
                onChangeText={setSet3A}
                placeholder="—"
                placeholderTextColor="#7f8b9c"
              />
              <Text style={styles.scoreDivider}>x</Text>
              <TextInput
                style={styles.gameInput}
                keyboardType="numeric"
                value={set3B}
                onChangeText={setSet3B}
                placeholder="—"
                placeholderTextColor="#7f8b9c"
              />
            </View>

            {/* Winner Selection */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Dupla Vencedora</Text>
            <View style={styles.winnerBtnRow}>
              <TouchableOpacity
                style={[
                  styles.winnerSelectBtn,
                  selectedWinner === 'A' && styles.winnerSelectedLime,
                ]}
                onPress={() => setSelectedWinner('A')}
              >
                <Text
                  style={[
                    styles.winnerText,
                    selectedWinner === 'A' && styles.winnerTextBlack,
                  ]}
                >
                  Vitória Dupla A
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.winnerSelectBtn,
                  selectedWinner === 'B' && styles.winnerSelectedCyan,
                ]}
                onPress={() => setSelectedWinner('B')}
              >
                <Text
                  style={[
                    styles.winnerText,
                    selectedWinner === 'B' && styles.winnerTextBlack,
                  ]}
                >
                  Vitória Dupla B
                </Text>
              </TouchableOpacity>
            </View>

            <Button
              variant="lime"
              size="md"
              fullWidth
              style={{ marginTop: 16 }}
              loading={actionLoading}
              onPress={handleSubmitScore}
            >
              Enviar Placar para Votação
            </Button>
          </GlassCard>
        )}

        {/* =========================================================================
            PHASE 4: 3-VOTE QUORUM VOTING & DISPUTE HANDLING
           ========================================================================= */}
        {match?.status === 'result-pending' && !isDisputed && (
          <GlassCard variant="elevated" style={styles.actionSection}>
            <Text style={styles.sectionHeading}>Validação por Quorum (3 Votos)</Text>
            <Text style={styles.actionExplainer}>
              Para validação de rating, são necessários pelo menos 3 votos com ambas as duplas representadas.
            </Text>

            {/* Quorum Progress */}
            <View style={styles.quorumStatusBox}>
              <Text style={styles.quorumCounterText}>
                Votos Confirmados: {quorum.totalVotes} de 3 necessários
              </Text>
              <Text style={styles.quorumTeamsText}>
                {quorum.hasBothTeams
                  ? '✓ Ambas as duplas representadas'
                  : 'Falta representação de ambas as duplas'}
              </Text>
            </View>

            {/* Voting Buttons */}
            {currentParticipant?.confirmation !== 'confirmed' ? (
              <View style={{ marginTop: 14, gap: 10 }}>
                <Text style={styles.fieldLabel}>Qual resultado você confirma?</Text>
                <View style={styles.actionBtnRow}>
                  <Button
                    variant="lime"
                    size="md"
                    style={{ flex: 1 }}
                    loading={actionLoading}
                    onPress={() => handleVote('A')}
                  >
                    Confirmar Dupla A
                  </Button>
                  <Button
                    variant="cyan"
                    size="md"
                    style={{ flex: 1 }}
                    loading={actionLoading}
                    onPress={() => handleVote('B')}
                  >
                    Confirmar Dupla B
                  </Button>
                </View>
              </View>
            ) : (
              <View style={[styles.confirmedBox, { marginTop: 12 }]}>
                <Check size={18} color="#c9ff4a" />
                <Text style={styles.confirmedBoxText}>
                  Seu voto ({currentParticipant.resultWinner ? `Dupla ${currentParticipant.resultWinner}` : 'Confirmado'}) foi computado.
                </Text>
              </View>
            )}

            {/* Dispute trigger button */}
            <TouchableOpacity
              onPress={handleDispute}
              style={styles.disputeTrigger}
              activeOpacity={0.7}
            >
              <Text style={styles.disputeTriggerText}>
                Contestar resultado / Há divergência
              </Text>
            </TouchableOpacity>
          </GlassCard>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2430',
  },
  backButton: {
    padding: 4,
  },
  headerTitles: {
    flex: 1,
    marginLeft: 10,
  },
  matchIdText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerSub: {
    fontSize: 12,
    color: '#7f8b9c',
    marginTop: 1,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeRanked: {
    backgroundColor: 'rgba(201, 255, 74, 0.15)',
  },
  modeFriendly: {
    backgroundColor: 'rgba(76, 226, 209, 0.15)',
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 50,
  },
  statusBanner: {
    padding: 16,
    marginBottom: 16,
  },
  disputeTitle: {
    color: '#ff836b',
    fontSize: 15,
    fontWeight: '900',
  },
  disputeSub: {
    color: '#ff836b',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  validatedTitle: {
    color: '#c9ff4a',
    fontSize: 15,
    fontWeight: '900',
  },
  validatedSub: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  bannerHeading: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  bannerSub: {
    color: '#7f8b9c',
    fontSize: 12,
    marginTop: 2,
  },
  teamsContainer: {
    padding: 16,
    marginBottom: 16,
  },
  teamSection: {
    gap: 8,
  },
  teamTitle: {
    color: '#c9ff4a',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    padding: 10,
  },
  avatarMini: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  playerName: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  playerHandle: {
    color: '#7f8b9c',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  playerStatusTags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  playerMiniTag: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagSuccess: {
    backgroundColor: 'rgba(201, 255, 74, 0.15)',
    color: '#c9ff4a',
  },
  tagPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
  },
  tagCyan: {
    backgroundColor: 'rgba(76, 226, 209, 0.15)',
    color: '#4ce2d1',
  },
  vsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  vsLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#26303d',
  },
  vsText: {
    color: '#7f8b9c',
    fontWeight: '900',
    fontSize: 12,
  },
  gripoCard: {
    padding: 14,
    marginBottom: 16,
  },
  gripoTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  gripoSub: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 2,
  },
  actionSection: {
    padding: 16,
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
  },
  actionExplainer: {
    fontSize: 12,
    color: '#7f8b9c',
    marginBottom: 14,
    lineHeight: 16,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(201, 255, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 74, 0.25)',
    borderRadius: 8,
    padding: 12,
  },
  confirmedBoxText: {
    color: '#c9ff4a',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  setInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  setNumberLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  gameInput: {
    width: 60,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 8,
  },
  scoreDivider: {
    color: '#7f8b9c',
    fontSize: 16,
    marginHorizontal: 10,
    fontWeight: '700',
  },
  fieldLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  winnerBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  winnerSelectBtn: {
    flex: 1,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  winnerSelectedLime: {
    backgroundColor: '#c9ff4a',
    borderColor: '#c9ff4a',
  },
  winnerSelectedCyan: {
    backgroundColor: '#4ce2d1',
    borderColor: '#4ce2d1',
  },
  winnerText: {
    color: '#7f8b9c',
    fontSize: 12,
    fontWeight: '800',
  },
  winnerTextBlack: {
    color: '#090b10',
    fontWeight: '900',
  },
  quorumStatusBox: {
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  quorumCounterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  quorumTeamsText: {
    color: '#4ce2d1',
    fontSize: 11,
    fontWeight: '600',
  },
  disputeTrigger: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  disputeTriggerText: {
    color: '#ff836b',
    fontSize: 12,
    fontWeight: '700',
  },
});
