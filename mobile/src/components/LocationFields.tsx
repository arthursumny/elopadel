import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, CheckCircle2, ChevronDown, MapPin, Search, X } from 'lucide-react-native';
import { apiClient } from '../api/client';

export type PlayerClub = { id: string; name: string; city: string; state: string };
export type PlayerCity = { city: string; state: string; country: string; clubCount: number };

type LocationFieldsProps = {
  city: string;
  state: string;
  clubId: string;
  onChange: (next: { city: string; state: string; clubId: string }) => void;
  disabled?: boolean;
};

export function LocationFields({ city, state, clubId, onChange, disabled }: LocationFieldsProps) {
  const [clubs, setClubs] = useState<PlayerClub[]>([]);
  const [cities, setCities] = useState<PlayerCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showClubModal, setShowClubModal] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [clubSearch, setClubSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    apiClient
      .get<{ clubs?: PlayerClub[]; cities?: PlayerCity[] }>('/api/clubs')
      .then((data) => {
        if (!mounted) return;
        if (data.clubs) setClubs(data.clubs);
        if (data.cities) setCities(data.cities);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedClub = useMemo(() => clubs.find((club) => club.id === clubId), [clubs, clubId]);

  const filteredCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();
    if (!query) return cities;
    return cities.filter(
      (item) =>
        item.city.toLowerCase().includes(query) || item.state.toLowerCase().includes(query)
    );
  }, [cities, citySearch]);

  const filteredClubs = useMemo(() => {
    const base = city
      ? clubs.filter(
          (club) =>
            club.city.toLowerCase() === city.toLowerCase() &&
            club.state.toUpperCase() === state.toUpperCase()
        )
      : clubs;
    const query = clubSearch.trim().toLowerCase();
    if (!query) return base;
    return base.filter(
      (club) => club.name.toLowerCase().includes(query) || club.city.toLowerCase().includes(query)
    );
  }, [clubs, city, clubSearch, state]);

  function selectCity(item: PlayerCity) {
    const cityClubs = clubs.filter(
      (club) =>
        club.city.toLowerCase() === item.city.toLowerCase() &&
        club.state.toUpperCase() === item.state.toUpperCase()
    );
    onChange({
      city: item.city,
      state: item.state,
      clubId: cityClubs.length === 1 ? cityClubs[0].id : '',
    });
    setShowCityModal(false);
    setCitySearch('');
  }

  function selectClub(club: PlayerClub) {
    onChange({ city: club.city, state: club.state, clubId: club.id });
    setShowClubModal(false);
    setClubSearch('');
  }

  return (
    <>
      <View style={{ marginBottom: 20 }}>
        <Text style={labelStyle}>Cidade (Gripo)</Text>
        <TouchableOpacity
          onPress={() => setShowCityModal(true)}
          disabled={disabled || loading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={city ? `Cidade selecionada: ${city} - ${state}` : 'Escolher cidade'}
          accessibilityHint="Abre a lista de cidades com quadras cadastradas"
          accessibilityState={{ disabled: Boolean(disabled || loading) }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: '#10141c',
            borderWidth: 1,
            borderColor: city ? '#c9ff4a' : '#26303d',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <MapPin color={city ? '#c9ff4a' : '#64748b'} size={18} />
            <Text
              style={{
                color: city ? '#ffffff' : '#475569',
                fontWeight: city ? '700' : '500',
                fontSize: 15,
                marginLeft: 10,
              }}
              numberOfLines={1}
            >
              {city ? `${city} - ${state}` : 'Escolha sua cidade no catálogo'}
            </Text>
          </View>
          {loading ? <ActivityIndicator color="#64748b" size="small" /> : <ChevronDown color="#64748b" size={18} />}
        </TouchableOpacity>
        <Text style={hintStyle}>Apenas cidades com quadras e clubes ativos no Gripo.</Text>
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text style={labelStyle}>
          Clube Principal <Text style={{ color: '#64748b', fontWeight: '400' }}>(Opcional)</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowClubModal(true)}
          disabled={disabled || loading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={selectedClub ? `Clube selecionado: ${selectedClub.name}` : 'Escolher clube principal'}
          accessibilityHint="Abre a lista de clubes parceiros"
          accessibilityState={{ disabled: Boolean(disabled || loading) }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: '#10141c',
            borderWidth: 1,
            borderColor: clubId ? '#4ce2d1' : '#26303d',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Building2 color={clubId ? '#4ce2d1' : '#64748b'} size={18} />
            <Text
              style={{
                color: clubId ? '#ffffff' : '#475569',
                fontWeight: clubId ? '700' : '500',
                fontSize: 15,
                marginLeft: 10,
              }}
              numberOfLines={1}
            >
              {selectedClub ? selectedClub.name : 'Escolha seu clube de preferência'}
            </Text>
          </View>
          <ChevronDown color="#64748b" size={18} />
        </TouchableOpacity>
        <Text style={hintStyle}>
          {selectedClub
            ? `Clube selecionado: ${selectedClub.name} (${selectedClub.city} - ${selectedClub.state})`
            : 'Você pode escolher um clube da sua cidade ou deixar para depois.'}
        </Text>
      </View>

      <Modal
        visible={showCityModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCityModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(9, 11, 16, 0.96)' }}>
          <View style={{ flex: 1, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>Cidades Disponíveis</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>Apenas localidades com quadras cadastradas no Gripo</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCityModal(false)}
                style={{ padding: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Fechar lista de cidades"
              >
                <X color="#ffffff" size={20} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 48,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
                marginBottom: 16,
              }}
            >
              <Search color="#64748b" size={18} />
              <TextInput
                value={citySearch}
                onChangeText={setCitySearch}
                placeholder="Buscar cidade ou estado..."
                placeholderTextColor="#475569"
                accessibilityLabel="Buscar cidade ou estado"
                style={{ flex: 1, color: '#ffffff', fontSize: 14, marginLeft: 10 }}
              />
              {citySearch ? (
                <TouchableOpacity
                  onPress={() => setCitySearch('')}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca de cidade"
                >
                  <X color="#64748b" size={16} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredCities}
              keyExtractor={(item) => `${item.city}-${item.state}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected =
                  city.toLowerCase() === item.city.toLowerCase() &&
                  state.toUpperCase() === item.state.toUpperCase();
                return (
                  <TouchableOpacity
                    onPress={() => selectCity(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      backgroundColor: isSelected ? '#151b25' : '#10141c',
                      borderWidth: 1,
                      borderColor: isSelected ? '#c9ff4a' : '#26303d',
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View>
                      <Text style={{ color: isSelected ? '#c9ff4a' : '#ffffff', fontSize: 15, fontWeight: '700' }}>
                        {item.city} - {item.state}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {item.clubCount} {item.clubCount === 1 ? 'clube ativo' : 'clubes ativos'}
                      </Text>
                    </View>
                    {isSelected && <CheckCircle2 color="#c9ff4a" size={18} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ color: '#64748b', fontSize: 14 }}>
                    {loading ? 'Carregando cidades...' : 'Nenhuma cidade encontrada.'}
                  </Text>
                </View>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showClubModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowClubModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(9, 11, 16, 0.96)' }}>
          <View style={{ flex: 1, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>Clubes Parceiros</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                  {city ? `Exibindo clubes em ${city} - ${state}` : 'Clubes cadastrados no Gripo'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowClubModal(false)}
                style={{ padding: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Fechar lista de clubes"
              >
                <X color="#ffffff" size={20} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 48,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: '#10141c',
                borderWidth: 1,
                borderColor: '#26303d',
                marginBottom: 16,
              }}
            >
              <Search color="#64748b" size={18} />
              <TextInput
                value={clubSearch}
                onChangeText={setClubSearch}
                placeholder="Buscar clube por nome..."
                placeholderTextColor="#475569"
                accessibilityLabel="Buscar clube por nome"
                style={{ flex: 1, color: '#ffffff', fontSize: 14, marginLeft: 10 }}
              />
              {clubSearch ? (
                <TouchableOpacity
                  onPress={() => setClubSearch('')}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca de clube"
                >
                  <X color="#64748b" size={16} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredClubs}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = clubId === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => selectClub(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      backgroundColor: isSelected ? '#151b25' : '#10141c',
                      borderWidth: 1,
                      borderColor: isSelected ? '#4ce2d1' : '#26303d',
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ color: isSelected ? '#4ce2d1' : '#ffffff', fontSize: 15, fontWeight: '700' }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {item.city} - {item.state}
                      </Text>
                    </View>
                    {isSelected && <CheckCircle2 color="#4ce2d1" size={18} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ color: '#64748b', fontSize: 14 }}>
                    {loading ? 'Carregando clubes...' : 'Nenhum clube encontrado.'}
                  </Text>
                </View>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const labelStyle = {
  color: '#ffffff',
  fontSize: 12,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};

const hintStyle = {
  color: '#64748b',
  fontSize: 11,
  marginTop: 6,
  lineHeight: 16,
};
