import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trophy, Search, TrendingUp, TrendingDown, MapPin, X } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import {
  leaderboardApi,
  findUserRank,
  filterLeaderboardByScope,
} from '../../src/api/leaderboard';
import type {
  LeaderboardEntry,
  LeaderboardScope,
} from '../../src/api/types';

export default function LeaderboardScreen() {
  const { user } = useAuth();

  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const userContext = useMemo(
    () => ({
      state: user?.state,
      city: user?.city,
      club: user?.club,
    }),
    [user?.state, user?.city, user?.club]
  );

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await leaderboardApi.getLeaderboard({
        scope,
        userContext,
      });
      setEntries(res.entries || []);
    } catch (err) {
      console.warn('[Leaderboard] Erro ao carregar ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [scope, userContext]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [loadLeaderboard]);

  // Filter entries in memory by searchQuery (handle, player, club)
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.player.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        (e.club && e.club.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  // Find user's pinned rank in the current scoped entries
  const userRankInfo = useMemo(() => {
    const userHandle = user?.handle || '';
    return findUserRank(entries, userHandle);
  }, [entries, user?.handle]);

  const scopes: Array<{ key: LeaderboardScope; label: string }> = [
    { key: 'global', label: 'Global' },
    { key: 'state', label: 'Meu estado' },
    { key: 'city', label: 'Minha cidade' },
    { key: 'club', label: 'Meu clube' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Ranking Oficial</Text>
        <Text style={styles.subtitle}>Classificação competitiva contínua</Text>

        {/* Scope Tabs */}
        <View style={styles.scopeTabs}>
          {scopes.map((s) => {
            const isActive = scope === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.scopeBtn, isActive && styles.scopeBtnActive]}
                onPress={() => setScope(s.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.scopeText, isActive && styles.scopeTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Search size={16} color="#7f8b9c" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por jogador, @handle ou clube..."
            placeholderTextColor="#7f8b9c"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#7f8b9c" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Leaderboard List */}
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
        {filteredEntries.length === 0 && !loading ? (
          <GlassCard style={styles.emptyCard}>
            <Trophy size={32} color="#7f8b9c" style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Nenhum jogador no ranking</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Nenhum resultado corresponde à busca.'
                : 'Não há jogadores ranqueados neste escopo.'}
            </Text>
          </GlassCard>
        ) : (
          filteredEntries.map((item) => {
            const isUser =
              (user?.handle &&
                item.handle.toLowerCase().replace(/^@/, '') ===
                  user.handle.toLowerCase().replace(/^@/, '')) ||
              false;

            // Top 3 Podium Accents
            const isTop1 = item.position === 1;
            const isTop2 = item.position === 2;
            const isTop3 = item.position === 3;
            const positionColor = isTop1
              ? '#fbbf24'
              : isTop2
              ? '#cbd5e1'
              : isTop3
              ? '#b45309'
              : '#7f8b9c';

            return (
              <GlassCard
                key={`${item.position}-${item.handle}`}
                variant={isUser ? 'neon-lime' : isTop1 ? 'elevated' : 'default'}
                style={[styles.entryCard, isUser && styles.userHighlightCard]}
              >
                {/* Position Number */}
                <View style={styles.positionWrapper}>
                  <Text style={[styles.positionText, { color: positionColor }]}>
                    #{item.position}
                  </Text>
                </View>

                {/* Avatar */}
                <View style={[styles.avatarBox, isTop1 && styles.avatarTop1]}>
                  <Text style={styles.avatarText}>{item.initials || 'P'}</Text>
                </View>

                {/* Player details */}
                <View style={styles.playerDetails}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {item.player}
                    </Text>
                    {isUser && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>VOCÊ</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playerHandle}>{item.handle}</Text>
                  {(item.club || item.city) && (
                    <Text style={styles.playerMeta} numberOfLines={1}>
                      {[item.club, item.city].filter(Boolean).join(' • ')}
                    </Text>
                  )}
                </View>

                {/* Rank & Points */}
                <View style={styles.rankSection}>
                  <RankEmblem label={item.tier} size="sm" />
                  <Text style={styles.pointsValue}>{item.points} pts</Text>

                  {/* Trend Indicator */}
                  {item.delta !== undefined && item.delta !== 0 && (
                    <View style={styles.trendRow}>
                      {item.delta > 0 ? (
                        <>
                          <TrendingUp size={12} color="#c9ff4a" />
                          <Text style={[styles.trendText, { color: '#c9ff4a' }]}>
                            +{item.delta}
                          </Text>
                        </>
                      ) : (
                        <>
                          <TrendingDown size={12} color="#ff836b" />
                          <Text style={[styles.trendText, { color: '#ff836b' }]}>
                            {item.delta}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>

      {/* Pinned Bottom Card: Authenticated Player's Position */}
      {userRankInfo && (
        <View style={styles.pinnedBottomDock}>
          <GlassCard variant="neon-lime" style={styles.pinnedCard}>
            <View style={styles.pinnedLeft}>
              <View style={styles.pinnedPositionBadge}>
                <Text style={styles.pinnedPositionText}>#{userRankInfo.position}</Text>
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.pinnedTitle}>Sua Posição</Text>
                <Text style={styles.pinnedSub}>
                  {userRankInfo.entry?.tier || user?.tier} • {userRankInfo.entry?.points ?? 0} pts
                </Text>
              </View>
            </View>

            <RankEmblem label={userRankInfo.entry?.tier || user?.tier || '5ª II'} size="sm" />
          </GlassCard>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b10',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
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
  scopeTabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  scopeBtn: {
    flex: 1,
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scopeBtnActive: {
    backgroundColor: '#c9ff4a',
    borderColor: '#c9ff4a',
  },
  scopeText: {
    color: '#7f8b9c',
    fontWeight: '700',
    fontSize: 11,
  },
  scopeTextActive: {
    color: '#090b10',
    fontWeight: '900',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 90, // room for docked bottom card
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  userHighlightCard: {
    borderColor: '#c9ff4a',
  },
  positionWrapper: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarTop1: {
    borderWidth: 1.5,
    borderColor: '#fbbf24',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  youBadge: {
    backgroundColor: 'rgba(201, 255, 74, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    color: '#c9ff4a',
    fontSize: 9,
    fontWeight: '900',
  },
  playerHandle: {
    color: '#c9ff4a',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  playerMeta: {
    color: '#7f8b9c',
    fontSize: 10,
    marginTop: 2,
  },
  rankSection: {
    alignItems: 'center',
    marginLeft: 8,
  },
  pointsValue: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 3,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pinnedBottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  pinnedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedPositionBadge: {
    backgroundColor: '#c9ff4a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pinnedPositionText: {
    color: '#090b10',
    fontWeight: '900',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pinnedTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  pinnedSub: {
    color: '#c9ff4a',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
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
  emptySubtitle: {
    color: '#7f8b9c',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
