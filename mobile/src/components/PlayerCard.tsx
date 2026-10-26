import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { RankEmblem } from './RankEmblem';
import { GlassCard } from './GlassCard';

export interface PlayerCardProps {
  displayName: string;
  handle: string;
  tier: string;
  rating?: number;
  city?: string;
  club?: string;
  onPress?: () => void;
}

export function PlayerCard({
  displayName,
  handle,
  tier,
  rating,
  city,
  club,
  onPress,
}: PlayerCardProps) {
  const initials = displayName
    ? displayName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'EP';

  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.8}>
      <GlassCard style={styles.cardContainer}>
        <View style={styles.leftSection}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          {/* Details */}
          <View style={styles.details}>
            <Text style={styles.nameText} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.handleText}>{handle}</Text>
            {(city || club) && (
              <Text style={styles.locationText} numberOfLines={1}>
                {[club, city].filter(Boolean).join(' • ')}
              </Text>
            )}
          </View>
        </View>

        {/* Tier Emblem & MMR */}
        <View style={styles.rightSection}>
          <RankEmblem label={tier} size="sm" />
          {rating !== undefined && (
            <Text style={styles.mmrText}>{Math.round(rating)} MMR</Text>
          )}
        </View>
      </GlassCard>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginBottom: 10,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#26303d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  details: {
    flex: 1,
  },
  nameText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  handleText: {
    color: '#c9ff4a',
    fontSize: 12,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  locationText: {
    color: '#7f8b9c',
    fontSize: 11,
    marginTop: 3,
  },
  rightSection: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mmrText: {
    color: '#7f8b9c',
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
});
