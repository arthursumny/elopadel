import '../global.css';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

function NavigationProtector() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  usePushNotifications();

  useEffect(() => {
    if (isLoading) return;

    const segList = segments as string[];
    const inAuthGroup = segList[0] === '(auth)';
    const isAuthCallback = segList[0] === 'auth-callback';

    if (isAuthCallback) {
      return;
    }

    if (!isAuthenticated) {
      if (needsOnboarding) {
        if (segList[1] !== 'onboarding') {
          router.replace('/(auth)/onboarding');
        }
      } else if (!inAuthGroup) {
        router.replace('/(auth)/welcome');
      }
    } else {
      if (inAuthGroup) {
        router.replace('/(tabs)/lobby');
      }
    }
  }, [isAuthenticated, isLoading, needsOnboarding, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b10' }}>
        <ActivityIndicator size="large" color="#c9ff4a" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#090b10' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="match/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="matchmaking/invite-partner" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="history/index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
    </Stack>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#090b10', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#ff4a4a', fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>
        Ocorreu um erro
      </Text>
      <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
        {error?.message || 'Erro inesperado'}
      </Text>
      <TouchableOpacity
        onPress={retry}
        style={{ backgroundColor: '#c9ff4a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
      >
        <Text style={{ color: '#090b10', fontWeight: 'bold' }}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <NavigationProtector />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
