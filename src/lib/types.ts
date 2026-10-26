export type MatchMode = 'ranked' | 'friendly';
export type MatchKind = 'find' | 'open-room' | 'partner' | 'challenge';
export type MatchStatus = 'open' | 'full' | 'confirming' | 'confirmed' | 'result-pending' | 'validated' | 'disputed' | 'no-show' | 'cancelled';
export type CourtSide = 'left' | 'right' | 'any';

export type PlayerRating = {
  rating: number;
  deviation: number;
  volatility: number;
  matches: number;
  provisional: boolean;
  isInactive?: boolean;
};

export type RankTier = {
  id: string;
  category: string;
  division: string;
  label: string;
  accent: string;
  order: number;
};

export type RankState = {
  tier: RankTier;
  points: number;
  maxPoints: number;
  peakLabel: string;
  promotion?: {
    wins: number;
    losses: number;
    needed: number;
  };
};

export type Player = {
  id: string;
  displayName: string;
  handle: string;
  initials: string;
  city: string;
  state: string;
  country: string;
  phone?: string;
  club: string;
  avatar?: string;
  rating: PlayerRating;
  rank: RankState;
  seasonPoints: number;
  globalPosition: number;
  cityPosition: number;
  clubPosition: number;
  streak: number;
  lastPlayed: string;
};

export type OpenRoom = {
  id: string;
  clubId?: string;
  title: string;
  club: string;
  city: string;
  startsAt: string;
  date: string;
  time: string;
  mode: MatchMode;
  tier: string;
  slots: number;
  totalSlots: number;
  host: string;
  distance: string;
  tags: string[];
  matchId?: string;
  joined?: boolean;
};

export type MatchmakingPlayerOption = {
  id: string;
  displayName: string;
  handle: string;
  city: string;
  tier: string;
  rating: number;
  relationship?: 'none' | 'pending' | 'incoming' | 'accepted';
};

export type Friend = MatchmakingPlayerOption & {
  friendshipId: string;
  createdAt: string;
};

export type FriendRequest = MatchmakingPlayerOption & {
  id: string;
  playerId: string;
  createdAt: string;
};

export type ActiveMatchSearch = {
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
};

export type MatchSearchInvitation = {
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
};

export type MatchChallengeMember = {
  id: string;
  userId: string;
  name: string;
  handle: string;
  team: 'A' | 'B';
  acceptance: 'pending' | 'accepted' | 'declined';
  sidePreference: CourtSide;
  isCurrentPlayer: boolean;
};

export type MatchChallenge = {
  id: string;
  direction: 'incoming' | 'outgoing';
  mode: MatchMode;
  startsAt: string;
  city: string;
  club: string;
  clubId?: string;
  acceptedCount: number;
  myAcceptance: 'pending' | 'accepted' | 'declined';
  mySidePreference: CourtSide;
  participants: MatchChallengeMember[];
  matchId?: string;
};

export type RoomInvitation = {
  id: string;
  roomId: string;
  inviter: string;
  club: string;
  city: string;
  startsAt: string;
  mode: MatchMode;
  tier: string;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type LeaderboardEntry = {
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
};

export type HistoryItem = {
  id: string;
  date: string;
  result: string;
  score: string;
  opponent: string;
  club: string;
  delta: number | null;
  tone: 'win' | 'loss' | 'friendly' | 'pending';
  label: string;
};

export type HistoryData = {
  items: HistoryItem[];
  total: number;
  wins: number;
  mmrDelta: number;
};

export type SeasonLeaderboardEntry = {
  position: number;
  name: string;
  initials: string;
  tier: string;
  points: number;
  isCurrentPlayer: boolean;
};

export type SeasonData = {
  active: boolean;
  name: string;
  startsAt: string;
  endsAt: string;
  points: number;
  wins: number;
  matches: number;
  position: number;
  leaderboard: SeasonLeaderboardEntry[];
};

export type MatchDetails = {
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
  sets: Array<{ a: number; b: number }>;
  resultVotes: { A: number; B: number; pending: number; disputed: number };
  participants: Array<{ id: string; userId: string; name: string; handle: string; team: 'A' | 'B'; tier: string; matchAcceptance: string; confirmation: string; resultWinner: 'A' | 'B' | null; attendance: string; isCurrentPlayer: boolean }>;
};

export type ActivityItem = {
  id: string;
  type: 'win' | 'promotion' | 'room' | 'achievement' | 'season';
  title: string;
  description: string;
  time: string;
  icon: string;
};

export type AdminPlayer = {
  id: string;
  displayName: string;
  handle: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  isActive: boolean;
  tier: string;
  points: number;
  rating: number;
  matches: number;
  provisional: boolean;
  club: string | null;
};

export type AdminClub = {
  id: string;
  name: string;
  city: string;
  region: string | null;
  state: string;
  country: string;
  address: string | null;
  gripoUrl: string | null;
  isActive: boolean;
  email: string | null;
};
