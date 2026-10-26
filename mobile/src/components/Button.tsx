import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
  StyleSheet,
} from 'react-native';

export type ButtonVariant =
  | 'lime'
  | 'cyan'
  | 'coral'
  | 'ghost'
  | 'panel'
  | 'outline'
  | 'primary'
  | 'secondary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children?: React.ReactNode;
  title?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  className?: string;
  onPress?: () => void;
}

const VARIANT_CONFIGS: Record<
  ButtonVariant,
  { container: ViewStyle; text: TextStyle; spinnerColor: string }
> = {
  lime: {
    container: {
      backgroundColor: '#c9ff4a',
      borderColor: '#c9ff4a',
      borderWidth: 1,
      shadowColor: '#c9ff4a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    text: { color: '#090b10', fontWeight: '800' },
    spinnerColor: '#090b10',
  },
  primary: {
    container: {
      backgroundColor: '#c9ff4a',
      borderColor: '#c9ff4a',
      borderWidth: 1,
      shadowColor: '#c9ff4a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    text: { color: '#090b10', fontWeight: '800' },
    spinnerColor: '#090b10',
  },
  cyan: {
    container: {
      backgroundColor: '#4ce2d1',
      borderColor: '#4ce2d1',
      borderWidth: 1,
      shadowColor: '#4ce2d1',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    text: { color: '#090b10', fontWeight: '800' },
    spinnerColor: '#090b10',
  },
  secondary: {
    container: {
      backgroundColor: '#4ce2d1',
      borderColor: '#4ce2d1',
      borderWidth: 1,
      shadowColor: '#4ce2d1',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    text: { color: '#090b10', fontWeight: '800' },
    spinnerColor: '#090b10',
  },
  coral: {
    container: {
      backgroundColor: '#ff836b',
      borderColor: '#ff836b',
      borderWidth: 1,
      shadowColor: '#ff836b',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    text: { color: '#ffffff', fontWeight: '800' },
    spinnerColor: '#ffffff',
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    text: { color: '#94a3b8', fontWeight: '600' },
    spinnerColor: '#94a3b8',
  },
  panel: {
    container: {
      backgroundColor: '#10141c',
      borderColor: '#26303d',
      borderWidth: 1,
    },
    text: { color: '#ffffff', fontWeight: '700' },
    spinnerColor: '#c9ff4a',
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderColor: '#26303d',
      borderWidth: 1.5,
    },
    text: { color: '#c9ff4a', fontWeight: '700' },
    spinnerColor: '#c9ff4a',
  },
};

const SIZE_CONFIGS: Record<
  ButtonSize,
  { container: ViewStyle; text: TextStyle; iconSpacing: number }
> = {
  sm: {
    container: { height: 38, paddingHorizontal: 14, borderRadius: 10 },
    text: { fontSize: 13 },
    iconSpacing: 6,
  },
  md: {
    container: { height: 48, paddingHorizontal: 20, borderRadius: 14 },
    text: { fontSize: 15 },
    iconSpacing: 8,
  },
  lg: {
    container: { height: 56, paddingHorizontal: 24, borderRadius: 16 },
    text: { fontSize: 16 },
    iconSpacing: 10,
  },
};

export function Button({
  children,
  title,
  label,
  variant = 'lime',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  className,
  onPress,
}: ButtonProps) {
  const normalizedVariant =
    variant === 'primary' ? 'lime' : variant === 'secondary' ? 'cyan' : variant;
  const variantConfig =
    VARIANT_CONFIGS[variant] || VARIANT_CONFIGS[normalizedVariant] || VARIANT_CONFIGS.lime;
  const sizeConfig = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const isDisabled = disabled || loading;
  const content = label !== undefined ? label : title !== undefined ? title : children;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className={className}
      style={[
        styles.baseContainer,
        variantConfig.container,
        sizeConfig.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantConfig.spinnerColor} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' && (
            <View style={{ marginRight: sizeConfig.iconSpacing }}>{icon}</View>
          )}
          {typeof content === 'string' ? (
            <Text style={[styles.baseText, variantConfig.text, sizeConfig.text, textStyle]}>
              {content}
            </Text>
          ) : (
            content
          )}
          {icon && iconPosition === 'right' && (
            <View style={{ marginLeft: sizeConfig.iconSpacing }}>{icon}</View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  baseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.45,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: {
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
