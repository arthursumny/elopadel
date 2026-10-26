import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Mail,
  ShieldCheck,
} from 'lucide-react-native';
import { authApi } from '../../src/api/auth';

const GENERIC_MESSAGE =
  'Se este email estiver cadastrado, enviaremos instruções para redefinir a senha.';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage('Informe o email da sua conta.');
      return;
    }

    setLoading(true);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Não foi possível processar a solicitação agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, alignSelf: 'flex-start' }}
          >
            <ChevronLeft color="#94a3b8" size={18} />
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700', marginLeft: 4 }}>Voltar</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 12, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ShieldCheck color="#c9ff4a" size={22} />
              <Text style={eyebrowStyle}>Recuperar acesso</Text>
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
              Esqueceu a senha?
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 6 }}>
              Informe o email da sua conta. Enviaremos um link para criar uma nova senha.
            </Text>
          </View>

          {errorMessage && (
            <View
              accessibilityRole="alert"
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                backgroundColor: 'rgba(255, 131, 107, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(255, 131, 107, 0.28)',
                borderRadius: 14,
                padding: 14,
                marginBottom: 18,
              }}
            >
              <AlertCircle color="#ff836b" size={18} style={{ marginTop: 1 }} />
              <Text style={{ color: '#ff836b', fontSize: 12, fontWeight: '500', flex: 1, marginLeft: 10, lineHeight: 18 }}>
                {errorMessage}
              </Text>
            </View>
          )}

          {sent ? (
            <View
              style={{
                backgroundColor: 'rgba(76, 226, 209, 0.06)',
                borderWidth: 1,
                borderColor: 'rgba(76, 226, 209, 0.22)',
                borderRadius: 16,
                padding: 18,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Mail color="#4ce2d1" size={18} />
                <Text style={{ color: '#4ce2d1', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginLeft: 8 }}>
                  VERIFIQUE SEU EMAIL
                </Text>
              </View>
              <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: '700', marginTop: 12 }}>
                {GENERIC_MESSAGE}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                O link expira em 1 hora. Se não encontrar a mensagem, confira a caixa de spam.
              </Text>
            </View>
          ) : (
            <View>
              <Text style={labelStyle}>Email da conta</Text>
              <View style={inputShellStyle}>
                <Mail color="#64748b" size={18} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="voce@email.com"
                  placeholderTextColor="#475569"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  accessibilityLabel="Email da conta"
                  accessibilityHint="Enviaremos um link de recuperação para este email"
                  style={inputStyle}
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Enviar link de recuperação"
                accessibilityState={{ disabled: loading, busy: loading }}
                style={{
                  marginTop: 20,
                  minHeight: 54,
                  borderRadius: 16,
                  backgroundColor: '#c9ff4a',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#090b10" size="small" />
                ) : (
                  <>
                    <Text style={{ color: '#090b10', fontWeight: '800', fontSize: 15 }}>Enviar link</Text>
                    <ArrowRight color="#090b10" size={17} style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/email-login')}
            accessibilityRole="button"
            accessibilityLabel="Voltar para o login"
            style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, paddingVertical: 10 }}
          >
            <ChevronLeft color="#94a3b8" size={16} />
            <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
              Voltar para o login
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const eyebrowStyle = {
  color: '#c9ff4a',
  fontSize: 11,
  fontWeight: '800' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
  marginLeft: 8,
};

const labelStyle = {
  color: '#ffffff',
  fontSize: 11,
  fontWeight: '800' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
  marginBottom: 6,
};

const inputShellStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  minHeight: 52,
  paddingHorizontal: 16,
  borderRadius: 14,
  backgroundColor: '#10141c',
  borderWidth: 1,
  borderColor: '#26303d',
};

const inputStyle = {
  flex: 1,
  color: '#ffffff',
  fontSize: 15,
  marginLeft: 10,
  paddingVertical: 14,
};
