import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export type RankTierAccent =
  | 'slate'
  | 'blue'
  | 'cyan'
  | 'violet'
  | 'amber'
  | 'orange'
  | 'gold'
  | 'lime';

export type RankEmblemSize = 'sm' | 'md' | 'lg' | 'xl';

export interface RankEmblemProps {
  label: string;
  size?: RankEmblemSize;
  accent?: RankTierAccent;
  style?: StyleProp<ViewStyle>;
}

/**
 * Resolves the appropriate tier accent from a label string if not explicitly passed.
 * e.g. '6ª III' -> 'slate', '5ª II' -> 'blue', '4ª I' -> 'cyan', 'Elite' -> 'gold', 'Challenger' -> 'lime'.
 */
export function resolveTierAccent(label: string): RankTierAccent {
  const clean = (label || '').trim();
  if (clean.startsWith('6ª')) return 'slate';
  if (clean.startsWith('5ª')) return 'blue';
  if (clean.startsWith('4ª')) return 'cyan';
  if (clean.startsWith('3ª')) return 'violet';
  if (clean.startsWith('2ª')) return 'amber';
  if (clean.startsWith('1ª')) return 'orange';
  if (clean.includes('Elite')) return 'gold';
  if (clean.includes('Challenger')) return 'lime';
  return 'cyan';
}

const ACCENT_CONFIGS: Record<
  RankTierAccent,
  { bg: string; borderColor: string; textColor: string; glow: string }
> = {
  slate: {
    bg: '#334155',
    borderColor: '#64748b',
    textColor: '#f8fafc',
    glow: 'rgba(100, 116, 139, 0.35)',
  },
  blue: {
    bg: '#1e3a8a',
    borderColor: '#3b82f6',
    textColor: '#ffffff',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  cyan: {
    bg: '#0e7490',
    borderColor: '#4ce2d1',
    textColor: '#090b10',
    glow: 'rgba(76, 226, 209, 0.45)',
  },
  violet: {
    bg: '#4c1d95',
    borderColor: '#a855f7',
    textColor: '#ffffff',
    glow: 'rgba(168, 85, 247, 0.4)',
  },
  amber: {
    bg: '#78350f',
    borderColor: '#f59e0b',
    textColor: '#ffffff',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  orange: {
    bg: '#7c2d12',
    borderColor: '#f97316',
    textColor: '#ffffff',
    glow: 'rgba(249, 115, 22, 0.45)',
  },
  gold: {
    bg: '#b45309',
    borderColor: '#fbbf24',
    textColor: '#451a03',
    glow: 'rgba(251, 191, 36, 0.5)',
  },
  lime: {
    bg: '#4d7c0f',
    borderColor: '#c9ff4a',
    textColor: '#090b10',
    glow: 'rgba(201, 255, 74, 0.5)',
  },
};

const SIZE_CONFIGS: Record<
  RankEmblemSize,
  { container: number; radius: number; categoryFontSize: number; divisionFontSize: number }
> = {
  sm: { container: 40, radius: 10, categoryFontSize: 11, divisionFontSize: 9 },
  md: { container: 68, radius: 16, categoryFontSize: 16, divisionFontSize: 13 },
  lg: { container: 96, radius: 22, categoryFontSize: 22, divisionFontSize: 18 },
  xl: { container: 120, radius: 28, categoryFontSize: 28, divisionFontSize: 22 },
};

export function RankEmblem({ label, size = 'md', accent, style }: RankEmblemProps) {
  const resolvedAccent = accent || resolveTierAccent(label);
  const config = ACCENT_CONFIGS[resolvedAccent] || ACCENT_CONFIGS.cyan;
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;

  const parts = label && label.includes(' ') ? label.split(' ') : [label || ''];
  const categoryPart = parts[0];
  const divisionPart = parts.slice(1).join(' ');

  return (
    <View style={[styles.root, { width: sizeConfig.container, height: sizeConfig.container }, style]}>
      {/* Rotated Diamond Background */}
      <View
        style={[
          styles.diamond,
          {
            width: sizeConfig.container,
            height: sizeConfig.container,
            borderRadius: sizeConfig.radius,
            backgroundColor: config.bg,
            borderColor: config.borderColor,
            shadowColor: config.borderColor,
          },
        ]}
      >
        <View
          style={[
            styles.innerRing,
            {
              borderRadius: Math.max(4, sizeConfig.radius - 4),
            },
          ]}
        />
      </View>

      {/* Upright Text Container */}
      <View style={styles.content}>
        <Text
          style={[
            styles.categoryText,
            {
              fontSize: sizeConfig.categoryFontSize,
              color: config.textColor,
            },
          ]}
          numberOfLines={1}
        >
          {categoryPart}
        </Text>
        {divisionPart.length > 0 && (
          <Text
            style={[
              styles.divisionText,
              {
                fontSize: sizeConfig.divisionFontSize,
                color: config.textColor,
              },
            ]}
            numberOfLines={1}
          >
            {divisionPart}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  diamond: {
    transform: [{ rotate: '45deg' }],
    borderWidth: 1.5,
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  innerRing: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  content: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  divisionText: {
    fontWeight: '800',
    textAlign: 'center',
    marginTop: -2,
  },
});
