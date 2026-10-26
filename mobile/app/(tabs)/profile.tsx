import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Trophy, Flame, MapPin, Building, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import { Button } from '../../src/components/Button';
import { historyApi } from '../../src/api/history';
import type { HistoryItem } from '../../src/api/types';

export default function ProfileScreen() {
  const { user, signOut, deleteAccount, refreshProfile, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [recentMatches, setRecentMatches] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await historyApi.getHistory();
      if (res && Array.isArray(res.items)) {
        setRecentMatches(res.items.slice(0, 5));
      }
    } catch (err) {
      console.warn('[Profile] Erro ao carregar histórico:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshProfile(), loadHistory()]);
    setRefreshing(false);
  }, [refreshProfile, loadHistory]);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir Conta',
      'Tem certeza de que deseja excluir permanentemente sua conta? Esta ação desvinculará seu login e não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir Definitivamente',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Falha ao excluir conta.');
            }
          },
        },
      ]
    );
  };

  // Derived user statistics
  const displayName = user?.displayName || 'Jogador';
  const handle = user?.handle || '@padelista';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'EP';

  const tierLabel =
    user?.rank?.tier?.label ||
    (typeof user?.tier === 'string' ? user.tier : '6ª III');

  const rawRating =
    typeof user?.rating === 'number'
      ? user.rating
      : typeof user?.rating === 'object' && user?.rating !== null
      ? user.rating.rating
      : 1500;
  const rating = Math.round(rawRating);

  const isProvisional =
    user?.provisional ??
    (typeof user?.rating === 'object' && user?.rating !== null
      ? user.rating.provisional
      : (user?.totalMatches || 0) < 5);

  const points = user?.rank?.points ?? 50;
  const maxPoints = user?.rank?.maxPoints ?? 100;
  const progressRatio = Math.min(1, Math.max(0, points / maxPoints));

  const totalMatches = user?.totalMatches ?? 0;
  const wins = user?.wins ?? 0;
  const losses = Math.max(0, totalMatches - wins);
  const winRate =
    user?.winRate ?? (totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0);
  const streak = user?.streak ?? 0;
  const seasonPoints = user?.seasonPoints ?? 0;

  return (
    <SafeAreaView style={styles.container}>
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
        {/* Header with Avatar & Details */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.displayName}>{displayName}</Text>
            <View style={styles.handleBadge}>
              <Text style={styles.handleText}>{handle}</Text>
            </View>
            <View style={styles.metaRow}>
              {(user?.city || user?.state) && (
                <View style={styles.metaItem}>
                  <MapPin size={12} color="#7f8b9c" />
                  <Text style={styles.metaText}>
                    {[user.city, user.state].filter(Boolean).join(', ')}
                  </Text>
                </View>
              )}
              {user?.club && (
                <View style={styles.metaItem}>
                  <Building size={12} color="#7f8b9c" />
                  <Text style={styles.metaText}>{user.club}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Rank & MMR Card */}
        <GlassCard variant="elevated" style={styles.rankCard}>
          <View style={styles.rankTopRow}>
            <RankEmblem label={tierLabel} size="lg" />
            <View style={styles.rankDetails}>
              <Text style={styles.tierTitle}>{tierLabel}</Text>
              <Text style={styles.mmrValue}>{rating} MMR</Text>

              {/* Calibration badge */}
              {isProvisional ? (
                <View style={[styles.statusBadge, styles.badgeAmber]}>
                  <AlertTriangle size={12} color="#f59e0b" />
                  <Text style={[styles.statusText, { color: '#f59e0b' }]}>
                    Classificação Provisória
                  </Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, styles.badgeLime]}>
                  <CheckCircle2 size={12} color="#c9ff4a" />
                  <Text style={[styles.statusText, { color: '#c9ff4a' }]}>
                    MMR Consolidado
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Division Points Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Pontos da Divisão</Text>
              <Text style={styles.progressValue}>
                {points} / {maxPoints} pts
              </Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressRatio * 100}%` },
                ]}
              />
            </View>
          </View>

          {/* Geographical Rankings */}
          {(user?.globalPosition || user?.cityPosition || user?.clubPosition) && (
            <View style={styles.geoRankRow}>
              {user?.clubPosition && (
                <View style={styles.geoBadge}>
                  <Text style={styles.geoText}>#{user.clubPosition} no clube</Text>
                </View>
              )}
              {user?.cityPosition && (
                <View style={styles.geoBadge}>
                  <Text style={styles.geoText}>#{user.cityPosition} na cidade</Text>
                </View>
              )}
              {user?.globalPosition && (
                <View style={styles.geoBadge}>
                  <Text style={styles.geoText}>#{user.globalPosition} global</Text>
                </View>
              )}
            </View>
          )}
        </GlassCard>

        {/* Stats Grid 2x2 */}
        <Text style={styles.sectionTitle}>Estatísticas Competitivas</Text>
        <View style={styles.statsGrid}>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statLabel}>Partidas</Text>
            <Text style={styles.statValue}>{totalMatches}</Text>
            <Text style={styles.statSub}>
              {wins}V • {losses}D
            </Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <Text style={styles.statLabel}>Aproveitamento</Text>
            <Text style={[styles.statValue, { color: '#c9ff4a' }]}>{winRate}%</Text>
            <Text style={styles.statSub}>Taxa de vitórias</Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.statLabel}>Sequência</Text>
              {streak > 0 && <Flame size={14} color="#ff836b" style={{ marginLeft: 4 }} />}
            </View>
            <Text style={[styles.statValue, { color: streak > 0 ? '#ff836b' : '#ffffff' }]}>
              {streak > 0 ? `${streak} V` : '-'}
            </Text>
            <Text style={styles.statSub}>Vitórias seguidas</Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.statLabel}>Temporada</Text>
              <Trophy size={14} color="#4ce2d1" style={{ marginLeft: 4 }} />
            </View>
            <Text style={[styles.statValue, { color: '#4ce2d1' }]}>{seasonPoints}</Text>
            <Text style={styles.statSub}>Pontos acumulados</Text>
          </GlassCard>
        </View>

        {/* Recent Matches */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Últimas Partidas</Text>
          <TouchableOpacity onPress={() => router.push('/history')} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.seeAllText}>Ver todas</Text>
              <ChevronRight size={14} color="#c9ff4a" />
            </View>
          </TouchableOpacity>
        </View>

        {recentMatches.length === 0 ? (
          <GlassCard style={styles.emptyRecentCard}>
            <Text style={styles.emptyRecentText}>
              {loadingHistory
                ? 'Carregando confrontos...'
                : 'Nenhuma partida registrada ainda.'}
            </Text>
          </GlassCard>
        ) : (
          recentMatches.map((m) => {
            const isWin = m.tone === 'win';
            const isLoss = m.tone === 'loss';
            const badgeColor = isWin ? '#c9ff4a' : isLoss ? '#ff836b' : '#f59e0b';
            const badgeBg = isWin
              ? 'rgba(201, 255, 74, 0.15)'
              : isLoss
              ? 'rgba(255, 131, 107, 0.15)'
              : 'rgba(245, 158, 11, 0.15)';

            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => router.push(`/match/${m.id}` as any)}
                activeOpacity={0.8}
              >
                <GlassCard style={styles.matchItem}>
                  <View style={styles.matchItemLeft}>
                    <View style={[styles.matchBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.matchBadgeText, { color: badgeColor }]}>
                        {m.result}
                      </Text>
                    </View>
                    <View style={{ marginLeft: 10 }}>
                      <Text style={styles.matchOpponent} numberOfLines={1}>
                        vs. {m.opponent}
                      </Text>
                      <Text style={styles.matchMeta}>
                        {m.score} • {m.club}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.matchItemRight}>
                    {m.delta !== null ? (
                      <Text
                        style={[
                          styles.deltaText,
                          { color: m.delta >= 0 ? '#c9ff4a' : '#ff836b' },
                        ]}
                      >
                        {m.delta > 0 ? `+${m.delta}` : `${m.delta}`} MMR
                      </Text>
                    ) : (
                      <Text style={styles.deltaNeutral}>Amistosa</Text>
                    )}
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
        )}

        {/* View Full History Button */}
        <Button
          variant="outline"
          size="md"
          fullWidth
          style={{ marginTop: 8, marginBottom: 20 }}
          onPress={() => router.push('/history')}
        >
          Ver Histórico Completo
        </Button>

        {/* Sign Out Button */}
        <Button
          variant="coral"
          size="md"
          fullWidth
          loading={authLoading}
          onPress={signOut}
        >
          Sair da Conta
        </Button>

        {/* Delete Account Button (Required by app stores) */}
        <TouchableOpacity
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
          style={{ marginTop: 16, alignItems: 'center', paddingVertical: 12 }}
        >
          <Text style={{ color: '#7f8b9c', fontSize: 13, textDecorationLine: 'underline' }}>
            Excluir minha conta
          </Text>
        </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161c26',
    borderWidth: 2,
    borderColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  handleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201, 255, 74, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 74, 0.25)',
  },
  handleText: {
    color: '#c9ff4a',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#7f8b9c',
    fontSize: 12,
  },
  rankCard: {
    padding: 18,
    marginBottom: 20,
  },
  rankTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rankDetails: {
    flex: 1,
  },
  tierTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
  mmrValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#c9ff4a',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  badgeAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  badgeLime: {
    backgroundColor: 'rgba(201, 255, 74, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 74, 0.3)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressContainer: {
    marginTop: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#7f8b9c',
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#1c2430',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#c9ff4a',
    borderRadius: 4,
  },
  geoRankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  geoBadge: {
    backgroundColor: '#161c26',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#26303d',
  },
  geoText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllText: {
    color: '#c9ff4a',
    fontSize: 13,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    padding: 14,
  },
  statLabel: {
    color: '#7f8b9c',
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statSub: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 4,
  },
  emptyRecentCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyRecentText: {
    color: '#7f8b9c',
    fontSize: 13,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginBottom: 10,
  },
  matchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  matchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchOpponent: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  matchMeta: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 2,
  },
  matchItemRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deltaNeutral: {
    color: '#7f8b9c',
    fontSize: 11,
  },
});
