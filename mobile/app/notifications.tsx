import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../src/components/GlassCard';

export default function NotificationsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: '900', color: '#ffffff', marginBottom: 16 }}>
        Notificações
      </Text>
      <GlassCard style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          Centro de notificações in-app no Milestone 4.
        </Text>
      </GlassCard>
    </SafeAreaView>
  );
}
