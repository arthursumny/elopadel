import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090b10' }}>
        <ActivityIndicator size="large" color="#c9ff4a" />
      </View>
    );
  }

  if (needsOnboarding) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/lobby" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
