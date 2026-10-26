import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search,
  Copy,
  Check,
  UserPlus,
  Users,
  Shield,
  UserCheck,
  X,
  Lock,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';
import { RankEmblem } from '../../src/components/RankEmblem';
import { Button } from '../../src/components/Button';
import { friendsApi } from '../../src/api/friends';
import type {
  Friend,
  FriendRequest,
  MatchmakingPlayerOption,
} from '../../src/api/types';

export default function FriendsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MatchmakingPlayerOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Friends & Requests lists
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFriendsData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await friendsApi.getFriends();
      if (res) {
        setFriends(res.friends || []);
        setRequests(res.requests || []);
      }
    } catch (err) {
      console.warn('[Friends] Erro ao carregar amigos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriendsData();
  }, [loadFriendsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriendsData();
    setRefreshing(false);
  }, [loadFriendsData]);

  // Debounced player search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const players = await friendsApi.searchPlayers(trimmed);
        setSearchResults(players);
      } catch (err) {
        console.warn('[Friends] Erro na busca:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle Copy @handle
  const handleCopyHandle = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send friend request
  const handleSendRequest = async (player: MatchmakingPlayerOption) => {
    try {
      const res = await friendsApi.sendFriendRequest({ userId: player.id });
      Alert.alert('Sucesso', res.message || 'Solicitação enviada!');

      // Update local state in search results
      setSearchResults((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? { ...p, relationship: res.status === 'accepted' ? 'accepted' : 'pending' }
            : p
        )
      );

      if (res.status === 'accepted') {
        loadFriendsData();
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao enviar solicitação.');
    }
  };

  // Respond to incoming request
  const handleRespondRequest = async (requestId: string, decision: 'accept' | 'decline') => {
    try {
      await friendsApi.respondFriendRequest(requestId, decision);
      await loadFriendsData();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao processar solicitação.');
    }
  };

  // Remove friend
  const handleRemoveFriend = async (friendshipId: string, name: string) => {
    Alert.alert(
      'Remover Amigo',
      `Deseja remover ${name} da sua lista de amigos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await friendsApi.removeFriend(friendshipId);
              setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao remover amigo.');
            }
          },
        },
      ]
    );
  };

  // Invite friend to duo in lobby
  const handleInviteToDuo = (friend: Friend | MatchmakingPlayerOption) => {
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

  const myHandle = user?.handle || '@padelista';

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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Amigos & Conexões</Text>
          <Text style={styles.subtitle}>Encontre parceiros e forme sua dupla</Text>
        </View>

        {/* Public @Handle Card */}
        <GlassCard variant="neon-lime" style={styles.handleCard}>
          <View style={styles.handleCardTop}>
            <View>
              <Text style={styles.handleLabel}>Seu Identificador Único</Text>
              <Text style={styles.handleValue}>{myHandle}</Text>
            </View>

            <TouchableOpacity
              style={styles.copyBtn}
              onPress={handleCopyHandle}
              activeOpacity={0.8}
            >
              {copied ? (
                <>
                  <Check size={14} color="#090b10" />
                  <Text style={styles.copyBtnText}>Copiado!</Text>
                </>
              ) : (
                <>
                  <Copy size={14} color="#090b10" />
                  <Text style={styles.copyBtnText}>Copiar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.privacyNote}>
            <Lock size={12} color="#7f8b9c" />
            <Text style={styles.privacyText}>
              Seu celular nunca é exibido a outros jogadores. Compartilhe seu @handle.
            </Text>
          </View>
        </GlassCard>

        {/* Instant Search Bar */}
        <View style={styles.searchWrapper}>
          <Search size={18} color="#7f8b9c" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar jogadores por nome ou @handle..."
            placeholderTextColor="#7f8b9c"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color="#7f8b9c" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Results */}
        {searchQuery.trim().length >= 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isSearching ? 'Buscando jogadores...' : `Resultados (${searchResults.length})`}
            </Text>

            {searchResults.length === 0 && !isSearching ? (
              <GlassCard style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  Nenhum jogador encontrado com "{searchQuery.trim()}".
                </Text>
              </GlassCard>
            ) : (
              searchResults.map((player) => {
                const relationship = player.relationship || 'none';
                return (
                  <GlassCard key={player.id} style={styles.playerResultCard}>
                    <View style={styles.playerInfoRow}>
                      <View style={styles.avatarMini}>
                        <Text style={styles.avatarMiniText}>
                          {player.displayName?.slice(0, 2).toUpperCase() || 'P'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName} numberOfLines={1}>
                          {player.displayName}
                        </Text>
                        <Text style={styles.playerHandle}>{player.handle}</Text>
                        <Text style={styles.playerMeta}>
                          {player.city} • {Math.round(player.rating)} MMR
                        </Text>
                      </View>
                      <RankEmblem label={player.tier} size="sm" />
                    </View>

                    {/* Contextual Action Button */}
                    <View style={styles.resultActionsRow}>
                      {relationship === 'accepted' && (
                        <>
                          <View style={styles.badgeFriend}>
                            <UserCheck size={12} color="#c9ff4a" />
                            <Text style={styles.badgeFriendText}>Amigo</Text>
                          </View>
                          <Button
                            variant="lime"
                            size="sm"
                            onPress={() => handleInviteToDuo(player)}
                          >
                            Convidar p/ Dupla
                          </Button>
                        </>
                      )}

                      {relationship === 'pending' && (
                        <View style={styles.badgePending}>
                          <Text style={styles.badgePendingText}>Solicitação Enviada</Text>
                        </View>
                      )}

                      {relationship === 'incoming' && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Button
                            variant="lime"
                            size="sm"
                            onPress={() => handleRespondRequest(player.id, 'accept')}
                          >
                            Aceitar
                          </Button>
                          <Button
                            variant="coral"
                            size="sm"
                            onPress={() => handleRespondRequest(player.id, 'decline')}
                          >
                            Recusar
                          </Button>
                        </View>
                      )}

                      {relationship === 'none' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => handleSendRequest(player)}
                        >
                          + Adicionar
                        </Button>
                      )}
                    </View>
                  </GlassCard>
                );
              })
            )}
          </View>
        )}

        {/* Incoming Friend Requests */}
        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Solicitações Recebidas ({requests.length})
            </Text>

            {requests.map((req) => (
              <GlassCard key={req.id} variant="elevated" style={styles.requestCard}>
                <View style={styles.playerInfoRow}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {req.displayName?.slice(0, 2).toUpperCase() || 'P'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>{req.displayName}</Text>
                    <Text style={styles.playerHandle}>{req.handle}</Text>
                    <Text style={styles.playerMeta}>
                      {req.city} • {Math.round(req.rating)} MMR
                    </Text>
                  </View>
                  <RankEmblem label={req.tier} size="sm" />
                </View>

                <View style={styles.requestActionRow}>
                  <Button
                    variant="lime"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => handleRespondRequest(req.id, 'accept')}
                  >
                    Aceitar
                  </Button>
                  <Button
                    variant="coral"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => handleRespondRequest(req.id, 'decline')}
                  >
                    Recusar
                  </Button>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Connected Friends List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amigos Conectados ({friends.length})</Text>

          {friends.length === 0 && !loading ? (
            <GlassCard style={styles.emptyCard}>
              <Users size={32} color="#7f8b9c" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>Nenhum amigo conectado ainda</Text>
              <Text style={styles.emptySubtitle}>
                Use a busca acima para encontrar parceiros pelo @handle e montar sua dupla!
              </Text>
            </GlassCard>
          ) : (
            friends.map((friend) => (
              <GlassCard key={friend.id} style={styles.friendCard}>
                <View style={styles.playerInfoRow}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>
                      {friend.displayName?.slice(0, 2).toUpperCase() || 'P'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {friend.displayName}
                    </Text>
                    <Text style={styles.playerHandle}>{friend.handle}</Text>
                    <Text style={styles.playerMeta}>
                      {friend.city} • {Math.round(friend.rating)} MMR
                    </Text>
                  </View>
                  <RankEmblem label={friend.tier} size="sm" />
                </View>

                <View style={styles.friendActionRow}>
                  <Button
                    variant="lime"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => handleInviteToDuo(friend)}
                  >
                    Convidar p/ Dupla
                  </Button>
                  <TouchableOpacity
                    style={styles.removeFriendBtn}
                    onPress={() => handleRemoveFriend(friend.friendshipId, friend.displayName)}
                  >
                    <Text style={styles.removeFriendText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ))
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
  handleCard: {
    padding: 16,
    marginBottom: 20,
  },
  handleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  handleLabel: {
    color: '#7f8b9c',
    fontSize: 12,
    fontWeight: '600',
  },
  handleValue: {
    color: '#c9ff4a',
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#c9ff4a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyBtnText: {
    color: '#090b10',
    fontWeight: '800',
    fontSize: 12,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 255, 74, 0.15)',
  },
  privacyText: {
    color: '#7f8b9c',
    fontSize: 11,
    flex: 1,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161c26',
    borderWidth: 1,
    borderColor: '#26303d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 12,
  },
  playerResultCard: {
    padding: 14,
    marginBottom: 10,
  },
  playerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  playerName: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  playerHandle: {
    color: '#c9ff4a',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  playerMeta: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 2,
  },
  resultActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#26303d',
  },
  badgeFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(201, 255, 74, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeFriendText: {
    color: '#c9ff4a',
    fontSize: 11,
    fontWeight: '700',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgePendingText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  requestCard: {
    padding: 14,
    marginBottom: 10,
  },
  requestActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#26303d',
  },
  friendCard: {
    padding: 14,
    marginBottom: 10,
  },
  friendActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#26303d',
  },
  removeFriendBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeFriendText: {
    color: '#ff836b',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
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
  emptyText: {
    color: '#7f8b9c',
    fontSize: 13,
    textAlign: 'center',
  },
});
