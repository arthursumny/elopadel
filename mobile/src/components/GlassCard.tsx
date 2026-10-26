import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';

export type GlassCardVariant =
  | 'default'
  | 'elevated'
  | 'neon-lime'
  | 'neon-cyan'
  | 'neon-coral';

export interface GlassCardProps {
  children: React.ReactNode;
  variant?: GlassCardVariant;
  glow?: boolean | 'lime' | 'cyan' | 'coral';
  style?: StyleProp<ViewStyle>;
  className?: string;
  onPress?: () => void;
}

const VARIANT_STYLES: Record<GlassCardVariant, ViewStyle> = {
  default: {
    backgroundColor: 'rgba(16, 20, 28, 0.85)',
    borderColor: 'rgba(38, 48, 61, 0.8)',
    borderWidth: 1,
  },
  elevated: {
    backgroundColor: 'rgba(21, 27, 37, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  'neon-lime': {
    backgroundColor: 'rgba(16, 20, 28, 0.9)',
    borderColor: 'rgba(201, 255, 74, 0.4)',
    borderWidth: 1,
    shadowColor: '#c9ff4a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  'neon-cyan': {
    backgroundColor: 'rgba(16, 20, 28, 0.9)',
    borderColor: 'rgba(76, 226, 209, 0.4)',
    borderWidth: 1,
    shadowColor: '#4ce2d1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  'neon-coral': {
    backgroundColor: 'rgba(16, 20, 28, 0.9)',
    borderColor: 'rgba(255, 131, 107, 0.4)',
    borderWidth: 1,
    shadowColor: '#ff836b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
};

export function GlassCard({
  children,
  variant,
  glow = false,
  style,
  className,
  onPress,
}: GlassCardProps) {
  let effectiveVariant: GlassCardVariant;
  if (variant) {
    effectiveVariant = variant;
  } else if (glow === 'lime' || glow === true) {
    effectiveVariant = 'neon-lime';
  } else if (glow === 'cyan') {
    effectiveVariant = 'neon-cyan';
  } else if (glow === 'coral') {
    effectiveVariant = 'neon-coral';
  } else {
    effectiveVariant = 'default';
  }
  const variantStyle = VARIANT_STYLES[effectiveVariant] || VARIANT_STYLES.default;

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.82}
        className={className}
        style={[styles.card, variantStyle, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View className={className} style={[styles.card, variantStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
  },
});
