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
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { ApiError } from '../../src/api/client';

export default function EmailLoginScreen() {
  const router = useRouter();
  const { loginWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);
    setNeedsVerification(false);

    if (!email.trim() || !password) {
      setErrorMessage('Informe seu email e sua senha.');
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.replace('/(tabs)/lobby');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setNeedsVerification(true);
      }
      setErrorMessage(err?.message || 'Não foi possível entrar agora. Tente novamente.');
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
              <Mail color="#c9ff4a" size={22} />
              <Text style={eyebrowStyle}>Acesso com email</Text>
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
              Entrar no Elo Padel
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 6 }}>
              Use o email confirmado no seu cadastro e sua senha. Sem SMS.
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

          {needsVerification && (
            <View
              style={{
                backgroundColor: 'rgba(76, 226, 209, 0.06)',
                borderWidth: 1,
                borderColor: 'rgba(76, 226, 209, 0.22)',
                borderRadius: 14,
                padding: 14,
                marginBottom: 18,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShieldCheck color="#4ce2d1" size={16} />
                <Text style={{ color: '#4ce2d1', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginLeft: 8 }}>
                  CONFIRME SEU EMAIL
                </Text>
              </View>
              <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Abra o link de verificação enviado para {email.trim()} para confirmar o endereço e definir
                a senha de acesso. Se o link expirou, faça o cadastro novamente com os mesmos dados para
                receber outro.
              </Text>
            </View>
          )}

          <View style={{ marginBottom: 18 }}>
            <Text style={labelStyle}>Email</Text>
            <View style={inputShellStyle}>
              <Mail color="#64748b" size={18} />
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (needsVerification) setNeedsVerification(false);
                }}
                placeholder="voce@email.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                accessibilityLabel="Email"
                accessibilityHint="Informe o email confirmado da sua conta"
                style={inputStyle}
              />
            </View>
          </View>

          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[labelStyle, { marginBottom: 0 }]}>Senha</Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="button"
                accessibilityLabel="Esqueci minha senha"
                style={{ paddingVertical: 6 }}
              >
                <Text style={{ color: '#4ce2d1', fontSize: 12, fontWeight: '700' }}>Esqueci minha senha</Text>
              </TouchableOpacity>
            </View>
            <View style={inputShellStyle}>
              <Lock color="#64748b" size={18} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Sua senha"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Senha"
                style={inputStyle}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                accessibilityState={{ selected: showPassword }}
                style={{ padding: 6 }}
              >
                {showPassword ? <EyeOff color="#94a3b8" size={18} /> : <Eye color="#94a3b8" size={18} />}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Entrar com email"
            accessibilityState={{ disabled: loading, busy: loading }}
            style={{
              marginTop: 18,
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
                <Text style={{ color: '#090b10', fontWeight: '800', fontSize: 15 }}>Entrar</Text>
                <ArrowRight color="#090b10" size={17} style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Text style={{ color: '#64748b', fontSize: 12 }}>Ainda não tem conta? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/email-register')}
              accessibilityRole="button"
              accessibilityLabel="Criar conta com email"
            >
              <Text style={{ color: '#c9ff4a', fontSize: 12, fontWeight: '800' }}>Criar conta</Text>
            </TouchableOpacity>
          </View>
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
