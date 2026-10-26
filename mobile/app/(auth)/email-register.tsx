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
  AtSign,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { authApi } from '../../src/api/auth';
import { LocationFields } from '../../src/components/LocationFields';
import {
  INITIAL_CATEGORY_OPTIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidEmail,
  isValidHandle,
  normalizeHandleInput,
  validatePassword,
} from '../../src/lib/playerProfile';

type RegistrationDraft = {
  email: string;
  password: string;
  name: string;
  handle: string;
  city: string;
  state: string;
  category: string;
  clubId: string;
};

export default function EmailRegisterScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [clubId, setClubId] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submittedDraft, setSubmittedDraft] = useState<RegistrationDraft | null>(null);
  const [loading, setLoading] = useState(false);

  const handleValid = isValidHandle(handle);

  function buildDraft(): RegistrationDraft | null {
    if (!isValidEmail(email)) {
      setErrorMessage('Informe um email válido.');
      return null;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return null;
    }
    if (password !== passwordConfirm) {
      setErrorMessage('As duas senhas precisam ser iguais.');
      return null;
    }
    if (!name.trim()) {
      setErrorMessage('Informe seu nome de exibição.');
      return null;
    }
    if (!handleValid) {
      setErrorMessage('Escolha um @handle válido (3 a 20 caracteres, letras, números, ponto ou sublinhado).');
      return null;
    }
    if (!city.trim() || !state.trim()) {
      setErrorMessage('Selecione sua cidade.');
      return null;
    }
    if (!category) {
      setErrorMessage('Escolha sua categoria inicial.');
      return null;
    }

    return {
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      handle,
      city: city.trim(),
      state: state.trim().toUpperCase(),
      category,
      clubId,
    };
  }

  async function submitRegistration() {
    setErrorMessage(null);
    setNoticeMessage(null);

    const draft = buildDraft();
    if (!draft) return;

    setLoading(true);
    try {
      const response = await authApi.registerEmail({
        email: draft.email,
        password: draft.password,
        name: draft.name,
        handle: draft.handle,
        city: draft.city,
        state: draft.state,
        category: draft.category,
        clubId: draft.clubId || undefined,
        country: 'Brasil',
      });

      setSubmittedDraft(draft);
      setSent(true);
      setNoticeMessage(response?.message || 'Enviamos um link de verificação para o seu email.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Não foi possível concluir o cadastro agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10' }}>
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        >
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/welcome')}
            accessibilityRole="button"
            accessibilityLabel="Voltar para o início"
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, alignSelf: 'flex-start' }}
          >
            <ChevronLeft color="#94a3b8" size={18} />
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700', marginLeft: 4 }}>Início</Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', marginTop: 28 }}>
            <View
              style={{
                height: 68,
                width: 68,
                borderRadius: 34,
                backgroundColor: 'rgba(201, 255, 74, 0.14)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mail color="#c9ff4a" size={32} />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#ffffff', marginTop: 20, textAlign: 'center', letterSpacing: -0.5 }}>
              Confirme seu email
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' }}>
              Enviamos um link de verificação para
            </Text>
            <Text style={{ color: '#c9ff4a', fontSize: 14, fontWeight: '800', marginTop: 4, textAlign: 'center' }}>
              {submittedDraft?.email || email.trim()}
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
                marginTop: 20,
              }}
            >
              <AlertCircle color="#ff836b" size={18} style={{ marginTop: 1 }} />
              <Text style={{ color: '#ff836b', fontSize: 12, fontWeight: '500', flex: 1, marginLeft: 10, lineHeight: 18 }}>
                {errorMessage}
              </Text>
            </View>
          )}

          {noticeMessage && (
            <View
              accessibilityLiveRegion="polite"
              style={{
                backgroundColor: 'rgba(76, 226, 209, 0.06)',
                borderWidth: 1,
                borderColor: 'rgba(76, 226, 209, 0.22)',
                borderRadius: 14,
                padding: 14,
                marginTop: 20,
              }}
            >
              <Text style={{ color: '#4ce2d1', fontSize: 12, fontWeight: '700', lineHeight: 18 }}>
                {noticeMessage}
              </Text>
            </View>
          )}

          <View
            style={{
              backgroundColor: '#10141c',
              borderWidth: 1,
              borderColor: '#26303d',
              borderRadius: 16,
              padding: 18,
              marginTop: 20,
              gap: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>
              O que acontece agora?
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18 }}>
              • Abra o link no seu email para confirmar o endereço e definir a senha de acesso.
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18 }}>
              • O link expira em 24 horas.
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 18 }}>
              • Depois de confirmar, entre com a senha que você definir no site.
            </Text>
          </View>

          <Text style={{ color: '#64748b', fontSize: 11, lineHeight: 17, marginTop: 16, textAlign: 'center' }}>
            O reenvio usa os mesmos dados deste cadastro. A senha de acesso será definida por você ao confirmar o email no site.
          </Text>

          <TouchableOpacity
            onPress={submitRegistration}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Reenviar link de verificação"
            accessibilityState={{ disabled: loading, busy: loading }}
            style={{
              marginTop: 16,
              minHeight: 52,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#26303d',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#c9ff4a" size="small" />
            ) : (
              <>
                <RefreshCw color="#c9ff4a" size={16} />
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13, marginLeft: 8 }}>
                  Reenviar link de verificação
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/email-login')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Já confirmei, quero entrar"
            style={{
              marginTop: 12,
              minHeight: 52,
              borderRadius: 14,
              backgroundColor: '#c9ff4a',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#090b10', fontWeight: '800', fontSize: 14 }}>Já confirmei, quero entrar</Text>
            <ArrowRight color="#090b10" size={16} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 44 }}
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

          <View style={{ marginTop: 12, marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ShieldCheck color="#c9ff4a" size={22} />
              <Text style={eyebrowStyle}>Novo jogador</Text>
            </View>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
              Crie sua conta
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 6 }}>
              Cadastre seu perfil competitivo e confirme o email. A senha de acesso será definida ao abrir o link de confirmação no site.
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

          <Text style={sectionStyle}>Dados de acesso</Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={labelStyle}>Email</Text>
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
                accessibilityLabel="Email"
                accessibilityHint="Você receberá um link de confirmação neste email"
                style={inputStyle}
              />
            </View>
          </View>

          <View style={{ marginBottom: 8 }}>
            <Text style={labelStyle}>Senha inicial</Text>
            <View style={inputShellStyle}>
              <Lock color="#64748b" size={18} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo de 10 caracteres"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="Senha inicial"
                accessibilityHint="Use entre 10 e 128 caracteres. A senha definitiva será definida ao confirmar o email"
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

          <View style={{ marginBottom: 6 }}>
            <Text style={labelStyle}>Repita a senha inicial</Text>
            <View style={inputShellStyle}>
              <Lock color="#64748b" size={18} />
              <TextInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Repita a senha"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="Repita a senha inicial"
                style={inputStyle}
              />
            </View>
          </View>

          <Text style={{ color: '#64748b', fontSize: 11, lineHeight: 17, marginBottom: 22 }}>
            De {PASSWORD_MIN_LENGTH} a {PASSWORD_MAX_LENGTH} caracteres. A senha definitiva será definida por você ao confirmar o email no site.
          </Text>

          <Text style={sectionStyle}>Seu perfil competitivo</Text>

          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[labelStyle, { marginBottom: 0 }]}>@handle único</Text>
              {handleValid && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <CheckCircle2 color="#c9ff4a" size={14} />
                  <Text style={{ color: '#c9ff4a', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                    Válido
                  </Text>
                </View>
              )}
            </View>
            <View
              style={[
                inputShellStyle,
                {
                  borderColor:
                    handle.length > 0 ? (handleValid ? '#c9ff4a' : '#ff836b') : '#26303d',
                },
              ]}
            >
              <AtSign color="#c9ff4a" size={18} />
              <TextInput
                value={handle}
                onChangeText={(text) => setHandle(normalizeHandleInput(text))}
                placeholder="seunome"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                maxLength={20}
                accessibilityLabel="Handle único"
                accessibilityHint="De 3 a 20 caracteres: letras, números, ponto ou sublinhado"
                style={inputStyle}
              />
            </View>
            <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6, lineHeight: 16 }}>
              3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado.
            </Text>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={labelStyle}>Nome de exibição</Text>
            <View style={inputShellStyle}>
              <User color="#64748b" size={18} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ex: Carlos Silva"
                placeholderTextColor="#475569"
                autoComplete="name"
                textContentType="name"
                accessibilityLabel="Nome de exibição"
                style={inputStyle}
              />
            </View>
          </View>

          <LocationFields
            city={city}
            state={state}
            clubId={clubId}
            disabled={loading}
            onChange={(next) => {
              setCity(next.city);
              setState(next.state);
              setClubId(next.clubId);
            }}
          />

          <View style={{ marginBottom: 24 }}>
            <Text style={labelStyle}>Categoria inicial</Text>
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
              Define sua pontuação base. O sistema ajusta automaticamente conforme suas partidas.
            </Text>
            <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
              {INITIAL_CATEGORY_OPTIONS.map((option) => {
                const isSelected = category === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setCategory(option.value)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.label}. ${option.desc}`}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isSelected ? '#151b25' : '#10141c',
                      borderColor: isSelected ? '#4ce2d1' : '#26303d',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={{
                            fontWeight: '700',
                            fontSize: 14,
                            color: isSelected ? '#4ce2d1' : '#ffffff',
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            color: '#64748b',
                            fontSize: 10,
                            marginLeft: 8,
                            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                          }}
                        >
                          Tier: {option.startingTier}
                        </Text>
                      </View>
                      <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{option.desc}</Text>
                    </View>
                    <View
                      style={{
                        height: 20,
                        width: 20,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderColor: isSelected ? '#4ce2d1' : '#475569',
                        backgroundColor: isSelected ? '#4ce2d1' : 'transparent',
                      }}
                    >
                      {isSelected && (
                        <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: '#090b10' }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            onPress={submitRegistration}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Criar conta"
            accessibilityState={{ disabled: loading, busy: loading }}
            style={{
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
                <Text style={{ color: '#090b10', fontWeight: '800', fontSize: 15 }}>Criar conta</Text>
                <ArrowRight color="#090b10" size={17} style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>

          <Text style={{ color: '#64748b', fontSize: 11, lineHeight: 17, marginTop: 14, textAlign: 'center' }}>
            Ao criar a conta, você concorda com os Termos de Serviço e a Política de Privacidade.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
            <Text style={{ color: '#64748b', fontSize: 12 }}>Já tem conta? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/email-login')}
              accessibilityRole="button"
              accessibilityLabel="Entrar com email"
            >
              <Text style={{ color: '#c9ff4a', fontSize: 12, fontWeight: '800' }}>Entrar</Text>
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

const sectionStyle = {
  color: '#c9ff4a',
  fontSize: 11,
  fontWeight: '800' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 1.2,
  marginBottom: 12,
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
