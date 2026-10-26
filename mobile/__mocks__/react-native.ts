export const Platform = {
  OS: 'ios' as const,
  select: (obj: any) => obj.ios ?? obj.default,
};

export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => styles,
};

export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const ActivityIndicator = 'ActivityIndicator';
export const TextInput = 'TextInput';
export const ScrollView = 'ScrollView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';

export default {
  Platform,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
};
