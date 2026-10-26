import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAuth } from '../src/context/AuthContext';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    token?: string;
    onboardingToken?: string;
    name?: string;
    email?: string;
  }>();
  const { processAuthCallback } = useAuth();
  const router = useRouter();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    async function handleAuth() {
      // 1. Process params received directly via Expo Router search params
      let res = await processAuthCallback({
        token: typeof params.token === 'string' ? params.token : undefined,
        onboardingToken: typeof params.onboardingToken === 'string' ? params.onboardingToken : undefined,
        name: typeof params.name === 'string' ? params.name : undefined,
        email: typeof params.email === 'string' ? params.email : undefined,
      });

      // 2. If no token found in local search params, inspect initial link
      if (res.status === 'ignored') {
        const initialUrl = await Linking.getInitialURL().catch(() => null);
        if (initialUrl) {
          res = await processAuthCallback(initialUrl);
        }
      }

      if (res.status === 'authenticated') {
        router.replace('/(tabs)/lobby');
      } else if (res.status === 'needs_onboarding') {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(auth)/welcome');
      }
    }

    handleAuth();
  }, [params, processAuthCallback, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#090b10',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
      }}
    >
      <ActivityIndicator size="large" color="#c9ff4a" />
      <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 20 }}>
        Conectando sua conta...
      </Text>
      <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
        Identificando credenciais do Google e preparando sua entrada no Elo Padel.
      </Text>
    </View>
  );
}
