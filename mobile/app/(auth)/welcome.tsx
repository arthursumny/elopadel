import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Trophy,
  AlertCircle,
  Shield,
  Users,
  Flame,
  Mail,
  ArrowRight,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/GlassCard';

export default function WelcomeScreen() {
  const router = useRouter();
  const { signInWithGoogle, isLoading } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingInProvider, setSigningInProvider] = useState<'google' | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setErrorMessage(null);
      setSigningInProvider('google');

      const result = await signInWithGoogle();
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'needs_onboarding') {
        router.push('/(auth)/onboarding');
      } else {
        router.replace('/(tabs)/lobby');
      }
    } catch (err: any) {
      if (
        err?.code === 'SIGN_IN_CANCELLED' ||
        err?.code === '12501' ||
        err?.message?.includes('cancel')
      ) {
        return;
      }
      setErrorMessage(err?.message || 'Falha ao autenticar com o Google. Tente novamente.');
    } finally {
      setSigningInProvider(null);
    }
  };

  const isBusy = isLoading || signingInProvider !== null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10' }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={{ alignItems: 'center', marginTop: 28 }}>
          <View
            style={{
              height: 64,
              width: 64,
              borderRadius: 16,
              backgroundColor: '#151b25',
              borderColor: '#26303d',
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Trophy color="#c9ff4a" size={32} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
            ELO PADEL
          </Text>
          <Text
            style={{
              color: '#94a3b8',
              fontSize: 14,
              textAlign: 'center',
              marginTop: 8,
              paddingHorizontal: 24,
              lineHeight: 20,
            }}
          >
            O ranking competitivo contínuo de padel que você sempre quis.
          </Text>

          {/* Value Proposition Pills */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
              }}
            >
              <Flame size={12} color="#c9ff4a" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginLeft: 6 }}>
                MMR Real
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
              }}
            >
              <Users size={12} color="#4ce2d1" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginLeft: 6 }}>
                Duplas Justas
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
              }}
            >
              <Shield size={12} color="#ff836b" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginLeft: 6 }}>
                Patentes
              </Text>
            </View>
          </View>
        </View>

        {/* Action Center */}
        <View style={{ width: '100%', gap: 12, marginVertical: 28 }}>
          {errorMessage && (
            <GlassCard
              variant="neon-coral"
              style={{ padding: 14, marginBottom: 4, flexDirection: 'row', alignItems: 'center' }}
            >
              <AlertCircle color="#ff836b" size={18} />
              <Text
                accessibilityRole="alert"
                style={{ color: '#ff836b', fontSize: 12, fontWeight: '500', flex: 1, marginLeft: 10 }}
              >
                {errorMessage}
              </Text>
            </GlassCard>
          )}

          {/* Google Sign-In Button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={isBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continuar com Google"
            accessibilityState={{ disabled: isBusy, busy: signingInProvider === 'google' }}
            style={{
              width: '100%',
              minHeight: 54,
              borderRadius: 16,
              backgroundColor: '#10141c',
              borderWidth: 1,
              borderColor: '#26303d',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 20,
              opacity: isBusy && signingInProvider !== 'google' ? 0.6 : 1,
            }}
          >
            {signingInProvider === 'google' ? (
              <ActivityIndicator color="#c9ff4a" size="small" />
            ) : (
              <>
                <View
                  style={{
                    height: 24,
                    width: 24,
                    borderRadius: 12,
                    backgroundColor: '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#000000' }}>G</Text>
                </View>
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>
                  Continuar com Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#26303d' }} />
            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }}>
              OU USE SEU EMAIL
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#26303d' }} />
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/email-login')}
            disabled={isBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Entrar com email e senha"
            accessibilityState={{ disabled: isBusy }}
            style={{
              width: '100%',
              minHeight: 54,
              borderRadius: 16,
              backgroundColor: '#c9ff4a',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 20,
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Mail color="#090b10" size={18} />
            <Text style={{ color: '#090b10', fontWeight: '800', fontSize: 15, marginLeft: 8 }}>
              Entrar com email
            </Text>
            <ArrowRight color="#090b10" size={16} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/email-register')}
            disabled={isBusy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Criar conta com email e senha"
            accessibilityState={{ disabled: isBusy }}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#26303d',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#94a3b8', fontWeight: '700', fontSize: 14 }}>
              Criar conta com email
            </Text>
          </TouchableOpacity>

          <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 2 }}>
            Contas novas confirmam o email por link. Não usamos SMS nem código por celular.
          </Text>
        </View>

        {/* Footer Terms */}
        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
            Ao continuar, você concorda com os Termos de Serviço e a Política de Privacidade do Elo Padel.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
