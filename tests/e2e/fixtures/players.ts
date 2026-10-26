export interface PlayerFixture {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  phone?: string;
  city: string;
  state: string;
  country: string;
  category: string;
  tier: string;
  points: number;
  rating: number;
  deviation: number;
  matches: number;
  provisionalMatches: number;
  clubId?: string;
  clubName?: string;
}

export const FIXTURE_PLAYERS: Record<string, PlayerFixture> = {
  player1: {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Carlos Alcaraz Padel',
    handle: '@carlos_padel',
    email: 'carlos@example.com',
    phone: '+5549999990001',
    city: 'Joaçaba',
    state: 'SC',
    country: 'Brasil',
    category: '4ª',
    tier: '4ª II',
    points: 50,
    rating: 1800,
    deviation: 120,
    matches: 12,
    provisionalMatches: 5,
    clubId: 'club-joacaba-001',
    clubName: 'Padel Club Joaçaba',
  },
  player2: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Marina Silva',
    handle: '@marina_silva',
    email: 'marina@example.com',
    phone: '+5549999990002',
    city: 'Joaçaba',
    state: 'SC',
    country: 'Brasil',
    category: '4ª',
    tier: '4ª II',
    points: 55,
    rating: 1820,
    deviation: 110,
    matches: 15,
    provisionalMatches: 5,
    clubId: 'club-joacaba-001',
    clubName: 'Padel Club Joaçaba',
  },
  player3: {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Lucas Oliveira',
    handle: '@lucas_padel',
    email: 'lucas@example.com',
    phone: '+5549999990003',
    city: 'Joaçaba',
    state: 'SC',
    country: 'Brasil',
    category: '4ª',
    tier: '4ª II',
    points: 40,
    rating: 1780,
    deviation: 130,
    matches: 10,
    provisionalMatches: 5,
    clubId: 'club-joacaba-001',
    clubName: 'Padel Club Joaçaba',
  },
  player4: {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'Beatriz Haddad Fan',
    handle: '@beatriz_h',
    email: 'beatriz@example.com',
    phone: '+5549999990004',
    city: 'Joaçaba',
    state: 'SC',
    country: 'Brasil',
    category: '4ª',
    tier: '4ª II',
    points: 60,
    rating: 1840,
    deviation: 100,
    matches: 20,
    provisionalMatches: 5,
    clubId: 'club-joacaba-001',
    clubName: 'Padel Club Joaçaba',
  },
  provisionalPlayer: {
    id: '55555555-5555-4555-8555-555555555555',
    displayName: 'Novo Jogador',
    handle: '@novo_jogador',
    email: 'novo@example.com',
    city: 'Florianópolis',
    state: 'SC',
    country: 'Brasil',
    category: '6ª',
    tier: '6ª II',
    points: 50,
    rating: 1300,
    deviation: 350,
    matches: 0,
    provisionalMatches: 0,
  },
  elitePlayer: {
    id: '66666666-6666-4666-8666-666666666666',
    displayName: 'Pablo Lima Pro',
    handle: '@pablo_lima',
    email: 'pablo@example.com',
    city: 'Porto Alegre',
    state: 'RS',
    country: 'Brasil',
    category: 'Elite',
    tier: 'Elite',
    points: 90,
    rating: 2850,
    deviation: 70,
    matches: 80,
    provisionalMatches: 5,
  },
};
