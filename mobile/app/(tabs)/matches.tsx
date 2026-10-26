import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Swords, Clock, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react-native';
import { GlassCard } from '../../src/components/GlassCard';
import { Button } from '../../src/components/Button';
import { historyApi } from '../../src/api/history';
import { matchmakingApi } from '../../src/api/matchmaking';
import type { HistoryItem, ActiveMatchSearch } from '../../src/api/types';

export default function MatchesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeSearch, setActiveSearch] = useState<ActiveMatchSearch | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [historyRes, searchRes] = await Promise.allSettled([
        historyApi.getHistory(),
        matchmakingApi.getSearchStatus(),
      ]);

      if (historyRes.status === 'fulfilled' && historyRes.value?.items) {
        setHistoryItems(historyRes.value.items);
      }
      if (searchRes.status === 'fulfilled') {
        setActiveSearch(searchRes.value);
      }
    } catch (err) {
      console.warn('[Matches] Erro ao carregar partidas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Filter pending vs finished matches
  const pendingMatches = historyItems.filter((m) => m.tone === 'pending');
  const pastMatches = historyItems.filter((m) => m.tone !== 'pending');

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
        <View style={styles.header}>
          <Text style={styles.title}>Minhas Partidas</Text>
          <Text style={styles.subtitle}>Acompanhe seus jogos agendados e histórico</Text>
        </View>

        {/* Active Matched Game (from Matchmaking) */}
        {activeSearch?.status === 'matched' && activeSearch.matchId && (
          <GlassCard variant="neon-lime" style={styles.cardSection}>
            <View style={styles.cardHeader}>
              <View style={styles.tagMatched}>
                <Text style={styles.tagMatchedText}>PARTIDA AGENDADA</Text>
              </View>
              <Text style={styles.timeTag}>Hoje</Text>
            </View>

            <Text style={styles.cardTitle}>Confronto Formado</Text>
            <Text style={styles.cardSubtitle}>
              4 jogadores confirmados em {activeSearch.city}. Entre na sala para check-in e placar.
            </Text>

            <Button
              variant="lime"
              size="md"
              fullWidth
              style={{ marginTop: 14 }}
              onPress={() => router.push(`/match/${activeSearch.matchId}`)}
            >
              Abrir Sala da Partida
            </Button>
          </GlassCard>
        )}

        {/* Pending Validation Matches */}
        {pendingMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Aguardando Validação</Text>
            {pendingMatches.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => router.push(`/match/${m.id}` as any)}
                activeOpacity={0.8}
              >
                <GlassCard variant="elevated" style={styles.matchCard}>
                  <View style={styles.matchCardTop}>
                    <View style={styles.badgePending}>
                      <Clock size={12} color="#f59e0b" />
                      <Text style={styles.badgePendingText}>Pendente de Votos</Text>
                    </View>
                    <Text style={styles.matchDate}>{m.date}</Text>
                  </View>

                  <Text style={styles.matchOpponent}>vs. {m.opponent}</Text>
                  <Text style={styles.matchDetails}>
                    {m.club} • Placar: {m.score || 'Aguardando envio'}
                  </Text>

                  <View style={styles.cardActionRow}>
                    <Text style={styles.actionPrompt}>Votar no resultado</Text>
                    <ChevronRight size={16} color="#c9ff4a" />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Past Matches Overview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Histórico Recente</Text>
            <TouchableOpacity onPress={() => router.push('/history')} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>Ver todas</Text>
            </TouchableOpacity>
          </View>

          {pastMatches.length === 0 && !loading ? (
            <GlassCard style={styles.emptyCard}>
              <Swords size={32} color="#7f8b9c" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>Nenhuma partida registrada</Text>
              <Text style={styles.emptySubtitle}>
                Busque uma partida no saguão para iniciar sua jornada competitiva!
              </Text>
              <Button
                variant="lime"
                size="sm"
                style={{ marginTop: 14 }}
                onPress={() => router.push('/(tabs)/lobby')}
              >
                Ir para o Saguão
              </Button>
            </GlassCard>
          ) : (
            pastMatches.slice(0, 5).map((m) => {
              const isWin = m.tone === 'win';
              const isLoss = m.tone === 'loss';
              const toneColor = isWin ? '#c9ff4a' : isLoss ? '#ff836b' : '#94a3b8';
              const toneBg = isWin
                ? 'rgba(201, 255, 74, 0.12)'
                : isLoss
                ? 'rgba(255, 131, 107, 0.12)'
                : 'rgba(148, 163, 184, 0.12)';

              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => router.push(`/match/${m.id}` as any)}
                  activeOpacity={0.8}
                >
                  <GlassCard style={styles.historyCard}>
                    <View style={styles.historyLeft}>
                      <View style={[styles.toneBadge, { backgroundColor: toneBg }]}>
                        <Text style={[styles.toneText, { color: toneColor }]}>
                          {m.result}
                        </Text>
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.historyOpponent} numberOfLines={1}>
                          vs. {m.opponent}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {m.score} • {m.date}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.historyRight}>
                      {m.delta !== null ? (
                        <Text
                          style={[
                            styles.deltaScore,
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
        </View>
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
  cardSection: {
    padding: 18,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tagMatched: {
    backgroundColor: 'rgba(201, 255, 74, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagMatchedText: {
    color: '#c9ff4a',
    fontSize: 10,
    fontWeight: '900',
  },
  timeTag: {
    color: '#7f8b9c',
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
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
  matchCard: {
    padding: 16,
    marginBottom: 10,
  },
  matchCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePendingText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  matchDate: {
    color: '#7f8b9c',
    fontSize: 12,
  },
  matchOpponent: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  matchDetails: {
    fontSize: 12,
    color: '#7f8b9c',
    marginTop: 2,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 4,
  },
  actionPrompt: {
    color: '#c9ff4a',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#7f8b9c',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginBottom: 10,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toneText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historyOpponent: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  historyMeta: {
    fontSize: 11,
    color: '#7f8b9c',
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  deltaScore: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deltaNeutral: {
    color: '#7f8b9c',
    fontSize: 11,
  },
});
