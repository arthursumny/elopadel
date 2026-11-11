import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').unique(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  handle: text('handle').notNull().unique(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('player'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull().default('Brasil'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  email: text('email'),
  ...timestamps,
}, (table) => ({
  oauthProviderAccountUnique: uniqueIndex('oauth_accounts_provider_account_unique').on(table.provider, table.providerAccountId),
  oauthUserProviderIndex: index('oauth_accounts_user_provider_idx').on(table.userId, table.provider),
}));

export const authAccounts = oauthAccounts;

// Password credentials for players who sign in with email + password.
// Kept in a separate table so legacy/social-only accounts keep their users row untouched.
export const emailCredentials = pgTable('email_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  emailCredentialUserUnique: uniqueIndex('email_credential_user_unique').on(table.userId),
}));

// Single-use, hashed tokens for email verification and password recovery.
export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  authTokenHashUnique: uniqueIndex('auth_token_hash_unique').on(table.tokenHash),
  authTokenUserTypeIndex: index('auth_token_user_type_idx').on(table.userId, table.type),
}));

// Persistent fixed-window rate limiting for credential endpoints.
// Keys are opaque (action + SHA-256 of the identifier) and never store plaintext emails.
export const authRateLimits = pgTable('auth_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).defaultNow().notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  ...timestamps,
});

// Monotonic per-player session version. Bumped on password reset so previously
// issued player JWTs (which carry the `sv` claim) stop validating immediately.
export const playerSessionVersions = pgTable('player_session_versions', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  ...timestamps,
});

export const devicePushTokens = pgTable('device_push_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull(),
  deviceType: text('device_type'),
  appVersion: text('app_version'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  devicePushTokensUserIdx: index('device_push_tokens_user_idx').on(table.userId),
  devicePushTokensUserEnabledIdx: index('device_push_tokens_user_enabled_idx').on(table.userId, table.isEnabled),
}));

export const deviceTokens = devicePushTokens;

export const clubs = pgTable('clubs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  region: text('region'),
  state: text('state').notNull(),
  country: text('country').notNull(),
  address: text('address'),
  gripoUrl: text('gripo_url'),
  gripoClubId: integer('gripo_club_id'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
}, (table) => ({
  clubLocationUnique: uniqueIndex('club_name_location_unique').on(table.name, table.city, table.state, table.country),
  clubGripoIdUnique: uniqueIndex('club_gripo_id_unique').on(table.gripoClubId),
}));

export const clubAccounts = pgTable('club_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  clubId: uuid('club_id').notNull().references(() => clubs.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
}, (table) => ({
  clubAccountClubUnique: uniqueIndex('club_account_club_unique').on(table.clubId),
  clubAccountEmailUnique: uniqueIndex('club_account_email_unique').on(table.email),
}));

export const clubMemberships = pgTable('club_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  clubId: uuid('club_id').notNull().references(() => clubs.id),
  status: text('status').notNull().default('pending'),
  isPrimary: boolean('is_primary').notNull().default(false),
  ...timestamps,
}, (table) => ({ userClubUnique: uniqueIndex('club_membership_user_club_unique').on(table.userId, table.clubId) }));

export const ratings = pgTable('ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  rating: real('rating').notNull().default(1500),
  deviation: real('deviation').notNull().default(350),
  volatility: real('volatility').notNull().default(0.06),
  matches: integer('matches').notNull().default(0),
  provisionalMatches: integer('provisional_matches').notNull().default(0),
  noShowCount: integer('no_show_count').notNull().default(0),
  suspendedUntil: timestamp('suspended_until', { withTimezone: true }),
  lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
  inactivityPenalty: integer('inactivity_penalty').notNull().default(0),
  isInactive: boolean('is_inactive').notNull().default(false),
  ...timestamps,
});

export const rankStates = pgTable('rank_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tier: text('tier').notNull().default('5ª II'),
  points: integer('points').notNull().default(0),
  peakTier: text('peak_tier').notNull().default('5ª II'),
  promotionWins: integer('promotion_wins').notNull().default(0),
  promotionLosses: integer('promotion_losses').notNull().default(0),
  ...timestamps,
});

export const matchRooms = pgTable('match_rooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  hostId: uuid('host_id').notNull().references(() => users.id),
  clubId: uuid('club_id').references(() => clubs.id),
  mode: text('mode').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('open'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(90),
  tierMin: text('tier_min'),
  tierMax: text('tier_max'),
  preferences: jsonb('preferences').$type<string[]>().default([]),
  ...timestamps,
});

export const roomParticipants = pgTable('room_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomId: uuid('room_id').notNull().references(() => matchRooms.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  team: text('team').notNull().default('A'),
  status: text('status').notNull().default('joined'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({ roomUserUnique: uniqueIndex('room_participant_room_user_unique').on(table.roomId, table.userId) }));

export const matchSearches = pgTable('match_searches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  partnerId: uuid('partner_id').references(() => users.id),
  partyType: text('party_type').notNull().default('solo'),
  mode: text('mode').notNull().default('ranked'),
  status: text('status').notNull().default('searching'),
  preferredDates: jsonb('preferred_dates').$type<string[]>().notNull(),
  timeFrom: text('time_from').notNull(),
  timeTo: text('time_to').notNull(),
  city: text('city').notNull(),
  state: text('state'),
  country: text('country'),
  clubId: uuid('club_id').references(() => clubs.id),
  timezoneOffset: integer('timezone_offset').notNull().default(180),
  sidePreference: text('side_preference').notNull().default('any'),
  partnerSidePreference: text('partner_side_preference').notNull().default('any'),
  initiatorReady: boolean('initiator_ready').notNull().default(false),
  partnerReady: boolean('partner_ready').notNull().default(false),
  initiatorLocationExpiresAt: timestamp('initiator_location_expires_at', { withTimezone: true }),
  partnerLocationExpiresAt: timestamp('partner_location_expires_at', { withTimezone: true }),
  tier: text('tier'),
  roomId: uuid('room_id').references(() => matchRooms.id),
  ...timestamps,
});

export const matchChallenges = pgTable('match_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdById: uuid('created_by_id').notNull().references(() => users.id),
  participantKey: text('participant_key').notNull(),
  mode: text('mode').notNull().default('ranked'),
  status: text('status').notNull().default('pending'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  city: text('city').notNull(),
  clubId: uuid('club_id').references(() => clubs.id),
  timezoneOffset: integer('timezone_offset').notNull().default(180),
  matchId: uuid('match_id'),
  ...timestamps,
}, (table) => ({
  challengeParticipantKeyIndex: index('match_challenge_participant_key_idx').on(table.participantKey),
  challengeStatusStartsAtIndex: index('match_challenge_status_starts_at_idx').on(table.status, table.startsAt),
}));

export const matchChallengeMembers = pgTable('match_challenge_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  challengeId: uuid('challenge_id').notNull().references(() => matchChallenges.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  team: text('team').notNull().default('A'),
  acceptance: text('acceptance').notNull().default('pending'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  sidePreference: text('side_preference').notNull().default('any'),
  ...timestamps,
}, (table) => ({
  challengeMemberUnique: uniqueIndex('match_challenge_member_unique').on(table.challengeId, table.userId),
  challengeMemberUserIndex: index('match_challenge_member_user_idx').on(table.userId),
}));

export const roomInvitations = pgTable('room_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomId: uuid('room_id').notNull().references(() => matchRooms.id),
  inviterId: uuid('inviter_id').notNull().references(() => users.id),
  inviteeId: uuid('invitee_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  ...timestamps,
}, (table) => ({ roomInviteeUnique: uniqueIndex('room_invitation_room_invitee_unique').on(table.roomId, table.inviteeId) }));

export const friendships = pgTable('friendships', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  addresseeId: uuid('addressee_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'),
  ...timestamps,
}, (table) => ({ friendshipPairUnique: uniqueIndex('friendship_requester_addressee_unique').on(table.requesterId, table.addresseeId) }));

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomId: uuid('room_id').references(() => matchRooms.id),
  mode: text('mode').notNull(),
  status: text('status').notNull().default('confirming'),
  resultDeadlineAt: timestamp('result_deadline_at', { withTimezone: true }),
  winner: text('winner'),
  sets: jsonb('sets').$type<Array<{ a: number; b: number }>>(),
  resultSubmittedBy: uuid('result_submitted_by').references(() => users.id),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  bookingStatus: text('booking_status'),
  bookedCourtName: text('booked_court_name'),
  gripoScheduleId: integer('gripo_schedule_id'),
  bookingMessage: text('booking_message'),
  bookedAt: timestamp('booked_at', { withTimezone: true }),
  bookingPriceCents: integer('booking_price_cents'),
  ...timestamps,
}, (table) => ({ matchRoomUnique: uniqueIndex('match_room_unique').on(table.roomId) }));

export const matchParticipants = pgTable('match_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').notNull().references(() => matches.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  team: text('team').notNull(),
  matchAcceptance: text('match_acceptance').notNull().default('pending'),
  matchAcceptedAt: timestamp('match_accepted_at', { withTimezone: true }),
  confirmation: text('confirmation').notNull().default('pending'),
  resultWinner: text('result_winner'),
  attendance: text('attendance').notNull().default('pending'),
  attendanceAt: timestamp('attendance_at', { withTimezone: true }),
  ...timestamps,
});

export const ratingEvents = pgTable('rating_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').notNull().references(() => matches.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  beforeRating: real('before_rating').notNull(),
  afterRating: real('after_rating').notNull(),
  delta: real('delta').notNull(),
  policyVersion: text('policy_version').notNull().default('glicko-doubles-v1'),
  ...timestamps,
});

export const seasons = pgTable('seasons', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => ({ seasonNameUnique: uniqueIndex('season_name_unique').on(table.name) }));

export const seasonStats = pgTable('season_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: uuid('season_id').notNull().references(() => seasons.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  points: integer('points').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  matches: integer('matches').notNull().default(0),
  ...timestamps,
}, (table) => ({ seasonUserUnique: uniqueIndex('season_stats_season_user_unique').on(table.seasonId, table.userId) }));

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  href: text('href'),
  dedupeKey: text('dedupe_key'),
  readAt: timestamp('read_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({ notificationDedupeUnique: uniqueIndex('notification_dedupe_key_unique').on(table.dedupeKey) }));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadata: jsonb('metadata'),
  ...timestamps,
});
