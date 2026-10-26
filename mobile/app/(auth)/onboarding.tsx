import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, AlertCircle, User, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Button } from '../../src/components/Button';
import { GlassCard } from '../../src/components/GlassCard';
import { LocationFields } from '../../src/components/LocationFields';
import {
  INITIAL_CATEGORY_OPTIONS,
  isValidHandle,
  normalizeHandleInput,
} from '../../src/lib/playerProfile';

export default function OnboardingScreen() {
  const router = useRouter();
  const { onboardingProfile, completeOnboarding, isLoading } = useAuth();

  const [name, setName] = useState(onboardingProfile?.suggestedName || '');
  const [rawHandle, setRawHandle] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('5ª');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [clubId, setClubId] = useState('');

  useEffect(() => {
    if (onboardingProfile?.suggestedName && !name) {
      setName(onboardingProfile.suggestedName);
    }
  }, [onboardingProfile?.suggestedName]);

  const handleHandleChange = (text: string) => {
    setRawHandle(normalizeHandleInput(text));
  };

  const publicHandle = rawHandle ? `@${rawHandle}` : '';
  const handleValid = isValidHandle(rawHandle);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }
    if (!handleValid) {
      setErrorMessage('Escolha um @handle válido (3 a 20 caracteres alfanuméricos, ponto ou sublinhado).');
      return;
    }
    if (!city.trim() || !state.trim()) {
      setErrorMessage('Selecione sua cidade (disponível no Gripo).');
      return;
    }

    try {
      setErrorMessage(null);
      await completeOnboarding({
        handle: publicHandle,
        name: name.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        category,
        country: 'Brasil',
        clubId: clubId || undefined,
      });

      router.replace('/(tabs)/lobby');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao concluir seu cadastro. Tente outro @handle.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b10' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ShieldCheck color="#c9ff4a" size={24} />
              <Text
                style={{
                  color: '#c9ff4a',
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginLeft: 8,
                }}
              >
                Perfil de Jogador
              </Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 }}>
              Complete seu cadastro
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 4 }}>
              Seu @handle será sua identidade única em quadra, rankings e convites de partidas.
            </Text>
            {onboardingProfile?.email ? (
              <Text style={{ color: '#c9ff4a', fontSize: 12, fontWeight: '600', marginTop: 6 }}>
                Conta Google: {onboardingProfile.email}
              </Text>
            ) : null}
          </View>

          {errorMessage && (
            <GlassCard variant="neon-coral" style={{ padding: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
              <AlertCircle color="#ff836b" size={18} />
              <Text style={{ color: '#ff836b', fontSize: 12, fontWeight: '500', flex: 1, marginLeft: 8 }}>
                {errorMessage}
              </Text>
            </GlassCard>
          )}

          {/* Field: Unique @handle */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                @handle único
              </Text>
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
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 50,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor:
                  rawHandle.length > 0
                    ? handleValid
                      ? '#c9ff4a'
                      : '#ff836b'
                    : '#26303d',
              }}
            >
              <Text style={{ color: '#c9ff4a', fontWeight: '900', fontSize: 16, marginRight: 4 }}>@</Text>
              <TextInput
                value={rawHandle}
                onChangeText={handleHandleChange}
                placeholder="seunome"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: '#ffffff', fontWeight: '700', fontSize: 16 }}
              />
            </View>
            <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6 }}>
              3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado.
            </Text>
          </View>

          {/* Field: Display Name */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Nome de exibição
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 50,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
              }}
            >
              <User color="#64748b" size={18} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ex: Carlos Silva"
                placeholderTextColor="#475569"
                style={{ flex: 1, color: '#ffffff', fontWeight: '500', fontSize: 15, marginLeft: 10 }}
              />
            </View>
          </View>

          {/* Fields: Location & Club (Restricted to Gripo) */}
          <LocationFields
            city={city}
            state={state}
            clubId={clubId}
            onChange={(next) => {
              setCity(next.city);
              setState(next.state);
              setClubId(next.clubId);
            }}
          />

          {/* Field: Category Selector */}
          <View style={{ marginBottom: 28 }}>
            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Categoria Inicial
            </Text>
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>
              Define sua pontuação base de calibração. O sistema ajusta automaticamente por MMR.
            </Text>

            <View style={{ gap: 10 }}>
              {INITIAL_CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    onPress={() => setCategory(cat.value)}
                    activeOpacity={0.8}
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
                          {cat.label}
                        </Text>
                        <Text
                          style={{
                            color: '#64748b',
                            fontSize: 10,
                            marginLeft: 8,
                            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                          }}
                        >
                          Tier: {cat.startingTier}
                        </Text>
                      </View>
                      <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{cat.desc}</Text>
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

          {/* Submit Action */}
          <Button
            variant="lime"
            size="lg"
            fullWidth
            loading={isLoading}
            onPress={handleSubmit}
          >
            Concluir Cadastro & Entrar
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
