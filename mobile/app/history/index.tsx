import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Trophy,
  TrendingUp,
  TrendingDown,
  Clock,
  Swords,
  ChevronRight,
} from 'lucide-react-native';
import { GlassCard } from '../../src/components/GlassCard';
import { historyApi } from '../../src/api/history';
import type { HistoryItem, HistoryResponse } from '../../src/api/types';

type HistoryFilter = 'all' | 'wins' | 'losses' | 'ranked' | 'friendly';

export default function HistoryScreen() {
  const router = useRouter();

  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await historyApi.getHistory();
      setHistoryData(res);
    } catch (err) {
      console.warn('[History] Erro ao carregar histórico:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const items = useMemo(() => historyData?.items || [], [historyData]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'wins') return item.tone === 'win';
      if (filter === 'losses') return item.tone === 'loss';
      if (filter === 'ranked') return item.label?.toLowerCase().includes('ranqueada');
      if (filter === 'friendly') return item.label?.toLowerCase().includes('amistosa');
      return true;
    });
  }, [items, filter]);

  const total = historyData?.total ?? items.length;
  const wins = historyData?.wins ?? items.filter((i) => i.tone === 'win').length;
  const mmrDelta = historyData?.mmrDelta ?? 0;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const filters: Array<{ key: HistoryFilter; label: string }> = [
    { key: 'all', label: 'Todas' },
    { key: 'wins', label: 'Vitórias' },
    { key: 'losses', label: 'Derrotas' },
    { key: 'ranked', label: 'Ranqueadas' },
    { key: 'friendly', label: 'Amistosas' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Histórico de Partidas</Text>
        <View style={{ width: 24 }} />
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
        {/* Cumulative Stats Card */}
        <GlassCard variant="elevated" style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Partidas</Text>
              <Text style={styles.statNumber}>{total}</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Vitórias</Text>
              <Text style={[styles.statNumber, { color: '#c9ff4a' }]}>{wins}</Text>
              <Text style={styles.statSub}>{winRate}% aprov.</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Variação MMR</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                {mmrDelta >= 0 ? (
                  <TrendingUp size={16} color="#c9ff4a" style={{ marginRight: 2 }} />
                ) : (
                  <TrendingDown size={16} color="#ff836b" style={{ marginRight: 2 }} />
                )}
                <Text
                  style={[
                    styles.statNumber,
                    { color: mmrDelta >= 0 ? '#c9ff4a' : '#ff836b' },
                  ]}
                >
                  {mmrDelta >= 0 ? `+${mmrDelta}` : `${mmrDelta}`}
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {filters.map((f) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Matches List */}
        {filteredItems.length === 0 && !loading ? (
          <GlassCard style={styles.emptyCard}>
            <Swords size={32} color="#7f8b9c" style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Nenhuma partida encontrada</Text>
            <Text style={styles.emptySub}>
              Não há partidas registradas correspondentes ao filtro selecionado.
            </Text>
          </GlassCard>
        ) : (
          filteredItems.map((item) => {
            const isWin = item.tone === 'win';
            const isLoss = item.tone === 'loss';
            const isPending = item.tone === 'pending';

            const resultColor = isWin ? '#c9ff4a' : isLoss ? '#ff836b' : '#f59e0b';
            const resultBg = isWin
              ? 'rgba(201, 255, 74, 0.12)'
              : isLoss
              ? 'rgba(255, 131, 107, 0.12)'
              : 'rgba(245, 158, 11, 0.12)';

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(`/match/${item.id}` as any)}
                activeOpacity={0.8}
              >
                <GlassCard style={styles.matchCard}>
                  {/* Top row: Mode tag + Date */}
                  <View style={styles.matchTopRow}>
                    <View
                      style={[
                        styles.modeBadge,
                        item.label?.includes('Ranqueada')
                          ? styles.modeRanked
                          : styles.modeFriendly,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeText,
                          item.label?.includes('Ranqueada')
                            ? { color: '#4ce2d1' }
                            : { color: '#7f8b9c' },
                        ]}
                      >
                        {item.label || 'Ranqueada'}
                      </Text>
                    </View>
                    <Text style={styles.dateText}>{item.date}</Text>
                  </View>

                  {/* Opponent & Club */}
                  <Text style={styles.opponentText} numberOfLines={1}>
                    vs. {item.opponent}
                  </Text>
                  <Text style={styles.clubText}>
                    {item.club} • Placar: <Text style={styles.scoreText}>{item.score}</Text>
                  </Text>

                  {/* Bottom row: Result Badge & MMR Delta */}
                  <View style={styles.matchBottomRow}>
                    <View style={[styles.resultBadge, { backgroundColor: resultBg }]}>
                      <Text style={[styles.resultText, { color: resultColor }]}>
                        {item.result}
                      </Text>
                    </View>

                    <View style={styles.deltaBox}>
                      {isPending ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} color="#f59e0b" />
                          <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>
                            Aguardando validação
                          </Text>
                        </View>
                      ) : item.delta !== null ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          {item.delta >= 0 ? (
                            <TrendingUp size={14} color="#c9ff4a" />
                          ) : (
                            <TrendingDown size={14} color="#ff836b" />
                          )}
                          <Text
                            style={[
                              styles.deltaValue,
                              { color: item.delta >= 0 ? '#c9ff4a' : '#ff836b' },
                            ]}
                          >
                            {item.delta > 0 ? `+${item.delta}` : `${item.delta}`} MMR
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.deltaNeutral}>Sem alteração de MMR</Text>
                      )}
                      <ChevronRight size={14} color="#7f8b9c" style={{ marginLeft: 4 }} />
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2430',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statsCard: {
    padding: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: '#7f8b9c',
    fontSize: 11,
    fontWeight: '600',
  },
  statNumber: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  statSub: {
    color: '#7f8b9c',
    fontSize: 10,
    marginTop: 2,
  },
  filterScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#c9ff4a',
    borderColor: '#c9ff4a',
  },
  filterText: {
    color: '#7f8b9c',
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#090b10',
    fontWeight: '900',
  },
  matchCard: {
    padding: 14,
    marginBottom: 10,
  },
  matchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeRanked: {
    backgroundColor: 'rgba(76, 226, 209, 0.15)',
  },
  modeFriendly: {
    backgroundColor: 'rgba(127, 139, 156, 0.15)',
  },
  modeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dateText: {
    color: '#7f8b9c',
    fontSize: 11,
  },
  opponentText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  clubText: {
    fontSize: 12,
    color: '#7f8b9c',
    marginTop: 2,
  },
  scoreText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  matchBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#26303d',
  },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  deltaBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deltaValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deltaNeutral: {
    color: '#7f8b9c',
    fontSize: 11,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  emptySub: {
    color: '#7f8b9c',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
