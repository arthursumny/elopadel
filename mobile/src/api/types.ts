export type SocialProvider = 'google';

export interface PlayerRating {
  rating: number;
  deviation: number;
  volatility: number;
  matches: number;
  provisional: boolean;
  isInactive?: boolean;
}

export interface RankTier {
  id: string;
  category: string;
  division: string;
  label: string;
  accent: string;
  order: number;
}

export interface RankState {
  tier: RankTier;
  points: number;
  maxPoints: number;
  peakLabel: string;
  promotion?: {
    wins: number;
    losses: number;
    needed: number;
  };
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  handle: string;
  initials?: string;
  city: string;
  state: string;
  country?: string;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  avatar?: string | null;
  club?: string;
  isActive?: boolean;
  tier?: string;
  rating?: PlayerRating | number;
  rank?: RankState;
  seasonPoints?: number;
  globalPosition?: number;
  cityPosition?: number;
  clubPosition?: number;
  streak?: number;
  lastPlayed?: string;
  wins?: number;
  totalMatches?: number;
  winRate?: number;
  provisional?: boolean;
}

export interface OnboardingProfileSuggestion {
  email?: string;
  suggestedName?: string;
  avatarUrl?: string;
}

export interface SocialAuthAuthenticatedResponse {
  ok: true;
  status: 'authenticated';
  token: string;
  user: PlayerProfile;
  player?: PlayerProfile;
  linked?: boolean;
}

export interface SocialAuthNeedsOnboardingResponse {
  ok: true;
  status: 'needs_onboarding';
  onboardingToken: string;
  email?: string;
  name?: string;
  suggestedName?: string;
  profile?: OnboardingProfileSuggestion;
}

export type SocialAuthResponse =
  | SocialAuthAuthenticatedResponse
  | SocialAuthNeedsOnboardingResponse;

export interface CompleteOnboardingData {
  handle: string;
  name: string;
  city: string;
  state: string;
  category: string;
  country?: string;
  clubId?: string;
}

export interface OnboardingPayload extends CompleteOnboardingData {
  onboardingToken: string;
}

export interface EmailAuthResponse {
  ok: true;
  status: 'authenticated';
  token: string;
  user: PlayerProfile;
  player: PlayerProfile;
}

export interface EmailRegisterInput {
  email: string;
  password: string;
  name: string;
  handle: string;
  city: string;
  state: string;
  category: string;
  clubId?: string;
  country?: string;
}

export interface EmailRegisterResponse {
  ok: true;
  status: 'verification_required';
  message: string;
}

export interface EmailActionResponse {
  ok: true;
  message: string;
}

export interface PushTokenRegistrationPayload {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceType?: string;
  appVersion?: string;
}

export interface PushTokenInput extends PushTokenRegistrationPayload {}

export interface Session {
  token: string;
  user: PlayerProfile;
}

// =============================================================================
// Milestone 4: Extensões de Domínio (Partidas, Matchmaking, Amigos e Ranking)
// =============================================================================

export type CourtSide = 'left' | 'right' | 'any';
export type MatchMode = 'ranked' | 'friendly';
export type MatchStatus =
  | 'open'
  | 'full'
  | 'confirming'
  | 'confirmed'
  | 'result-pending'
  | 'disputed'
  | 'validated'
  | 'no-show'
  | 'cancelled';

export interface SetScore {
  a: number;
  b: number;
}

export interface MatchResultInput {
  sets: SetScore[];
  winner: 'A' | 'B';
}

export interface MatchParticipant {
  id: string;
  userId: string;
  name: string;
  handle: string;
  team: 'A' | 'B';
  tier: string;
  matchAcceptance: 'pending' | 'accepted' | 'declined';
  confirmation: 'pending' | 'confirmed' | 'disputed';
  resultWinner: 'A' | 'B' | null;
  attendance: 'pending' | 'claimed-present' | 'present' | 'absent' | 'excused';
  isCurrentPlayer: boolean;
}

export interface MatchVoteCounts {
  A: number;
  B: number;
  pending: number;
  disputed: number;
}

export interface MatchDetails {
  id: string;
  mode: MatchMode;
  status: MatchStatus;
  startsAt: string;
  durationMinutes: number;
  resultDeadlineAt: string | null;
  acceptedCount: number;
  attendanceCount: number;
  club: string;
  city: string;
  gripoUrl: string;
  gripoClubId?: number | null;
  bookedCourt?: { courtName: string; scheduleId: number } | null;
  winner?: 'A' | 'B';
  sets: SetScore[];
  resultVotes: MatchVoteCounts;
  participants: MatchParticipant[];
}

export interface ActiveMatchSearch {
  id: string;
  partyType: 'solo' | 'duo';
  partnerId?: string;
  partnerName?: string;
  partnerHandle?: string;
  dates: string[];
  from: string;
  to: string;
  city: string;
  clubId?: string;
  sidePreference: CourtSide;
  partnerSidePreference?: CourtSide;
  myReady: boolean;
  partnerReady: boolean;
  tier: string;
  mode: MatchMode;
  status: 'lobby' | 'searching' | 'matched';
  matchId?: string;
}

export interface MatchmakingClub {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  gripoUrl?: string | null;
}

export interface LocationMeasurement {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationResolveResponse {
  location: {
    city: string;
    state: string;
    country: string;
    token: string;
    expiresAt: string;
  };
}

export interface CreateSearchPayload {
  partyType: 'solo' | 'duo';
  partnerId?: string;
  mode?: MatchMode;
  dates: string[];
  from: string;
  to: string;
  city: string;
  clubId?: string;
  sidePreference?: CourtSide;
  timezoneOffset?: number;
  replace?: boolean;
  locationToken?: string;
}

export interface CreateMatchSearchResponse {
  ok: boolean;
  invited?: boolean;
  matched?: boolean;
  matchId?: string;
  search?: ActiveMatchSearch | null;
  message?: string;
  error?: string;
}

export interface MatchSearchInvitation {
  id: string;
  direction: 'incoming' | 'outgoing';
  player: string;
  playerHandle: string;
  dates: string[];
  from: string;
  to: string;
  city: string;
  club: string;
  mode: MatchMode;
  tier: string;
  createdAt: string;
}

export interface MatchmakingPlayerOption {
  id: string;
  displayName: string;
  handle: string;
  city: string;
  tier: string;
  rating: number;
  relationship?: 'none' | 'pending' | 'incoming' | 'accepted' | 'outgoing';
}

export interface Friend extends MatchmakingPlayerOption {
  friendshipId: string;
  createdAt: string;
  relationship: 'accepted';
}

export interface FriendRequest extends MatchmakingPlayerOption {
  id: string;
  playerId: string;
  createdAt: string;
  relationship: 'incoming' | 'outgoing';
}

export interface FriendsResponse {
  friends: Friend[];
  requests: FriendRequest[];
}

export type LeaderboardScope = 'global' | 'state' | 'city' | 'club';

export interface LeaderboardEntry {
  position: number;
  player: string;
  handle: string;
  initials: string;
  club: string;
  city: string;
  state?: string;
  tier: string;
  points: number;
  delta: number;
  active: boolean;
}

export interface LeaderboardResponse {
  scope: string;
  entries: LeaderboardEntry[];
}

export interface HistoryItem {
  id: string;
  date: string;
  result: string;
  score: string;
  opponent: string;
  club: string;
  delta: number | null;
  tone: 'win' | 'loss' | 'friendly' | 'pending';
  label: string;
}

export interface HistoryResponse {
  ok: boolean;
  total: number;
  wins: number;
  mmrDelta: number;
  items: HistoryItem[];
}
