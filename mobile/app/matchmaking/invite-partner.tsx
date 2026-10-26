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
import { useRouter } from 'expo-router';
import { Search, X, Users, AlertCircle, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import { friendsApi } from '../../src/api/friends';
import type { Friend } from '../../src/api/types';

export default function InvitePartnerModal() {
  const router = useRouter();
  const { user } = useAuth();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFriends = useCallback(async () => {
    try {
      setLoading(true);
      const res = await friendsApi.getFriends();
      setFriends(res?.friends || []);
    } catch (err) {
      console.warn('[InvitePartner] Erro ao buscar amigos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  }, [loadFriends]);

  // User MMR for compatibility comparison
  const myRating =
    typeof user?.rating === 'number'
      ? user.rating
      : typeof user?.rating === 'object' && user?.rating !== null
      ? user.rating.rating
      : 1500;

  // Filter friends by query
  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.handle.toLowerCase().includes(q) ||
        (f.city && f.city.toLowerCase().includes(q))
    );
  }, [friends, searchQuery]);

  // Select partner and return to lobby
  const handleSelectPartner = (friend: Friend) => {
    router.navigate({
      pathname: '/(tabs)/lobby',
      params: {
        partnerId: friend.id,
        partnerName: friend.displayName,
        partnerHandle: friend.handle,
        partnerTier: friend.tier,
      },
    });
  };

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

        <Text style={styles.title}>Convidar Parceiro</Text>

        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.closeText}>Fechar</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={16} color="#7f8b9c" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar amigo por nome ou @handle..."
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

      {/* Friends List */}
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
        {filteredFriends.length === 0 && !loading ? (
          <GlassCard style={styles.emptyCard}>
            <Users size={32} color="#7f8b9c" style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Nenhum parceiro disponível</Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? 'Nenhum amigo encontrado para esta busca.'
                : 'Você precisa ter amigos adicionados para formar duplas no matchmaking.'}
            </Text>
          </GlassCard>
        ) : (
          filteredFriends.map((friend) => {
            const ratingDiff = Math.abs((friend.rating || 1500) - myRating);
            const isHighDiff = ratingDiff > 300; // > 2 divisions

            return (
              <TouchableOpacity
                key={friend.id}
                onPress={() => handleSelectPartner(friend)}
                activeOpacity={0.8}
              >
                <GlassCard style={styles.friendCard}>
                  <View style={styles.cardLeft}>
                    <View style={styles.avatarMini}>
                      <Text style={styles.avatarMiniText}>
                        {friend.displayName?.slice(0, 2).toUpperCase() || 'P'}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName} numberOfLines={1}>
                        {friend.displayName}
                      </Text>
                      <Text style={styles.friendHandle}>{friend.handle}</Text>
                      <Text style={styles.friendMeta}>
                        {friend.city} • {Math.round(friend.rating)} MMR
                      </Text>

                      {isHighDiff && (
                        <View style={styles.diffBadge}>
                          <AlertCircle size={10} color="#f59e0b" />
                          <Text style={styles.diffText}>
                            Diferença alta ({Math.round(ratingDiff)} pts) — modo amistoso recomendado
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    <RankEmblem label={friend.tier} size="sm" />
                    <View style={styles.selectBtn}>
                      <Text style={styles.selectBtnText}>Escolher</Text>
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
  closeText: {
    color: '#4ce2d1',
    fontSize: 14,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginBottom: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarMiniText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  friendName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  friendHandle: {
    color: '#c9ff4a',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  friendMeta: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 2,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  diffText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '700',
  },
  cardRight: {
    alignItems: 'center',
    gap: 6,
  },
  selectBtn: {
    backgroundColor: '#c9ff4a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectBtnText: {
    color: '#090b10',
    fontSize: 11,
    fontWeight: '900',
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
    lineHeight: 18,
  },
});
