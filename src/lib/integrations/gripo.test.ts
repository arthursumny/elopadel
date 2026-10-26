import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchGripoAvailability,
  confirmGripoBooking,
  resolveGripoClubId,
  getGripoAuthToken,
  clearGripoCachedToken,
} from './gripo';

describe('Gripo Integration Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearGripoCachedToken();
    delete process.env.GRIPO_TOKEN;
    delete process.env.GRIPO_LOGIN;
    delete process.env.GRIPO_PASSWORD;
  });

  describe('resolveGripoClubId', () => {
    it('resolves club ID for Padel Joaçaba by slug or url', () => {
      expect(resolveGripoClubId('https://gripo.app/padel-joacaba-joacaba-sc')).toBe(31);
      expect(resolveGripoClubId('Padel Joaçaba')).toBe(31);
    });

    it('resolves club ID for Racket Center by slug or url', () => {
      expect(resolveGripoClubId('https://gripo.app/racket-center-joacaba-sc')).toBe(122);
      expect(resolveGripoClubId('Racket Center')).toBe(122);
    });

    it('resolves explicit club_id from url query or path', () => {
      expect(resolveGripoClubId('https://gripo.app/club?club_id=45')).toBe(45);
    });

    it('returns null for unknown clubs without ID', () => {
      expect(resolveGripoClubId(null)).toBeNull();
      expect(resolveGripoClubId('Clube Desconhecido Sem ID')).toBeNull();
    });
  });

  describe('fetchGripoAvailability', () => {
    it('queries availability and formats court slots correctly', async () => {
      const mockApiResponse = {
        date: '2026-10-11',
        schedule_notes: 'Cancelamentos com 8h',
        courts: [
          {
            id: 1,
            name: 'Q1 - Nippur Finance',
            hours: [
              {
                date: '11/10/2026',
                hour: '17:30:00',
                start_hour: '17:30:00',
                end_hour: '19:00:00',
                interval: 90,
                available: true,
                available_to_schedule: true,
                schedule_grid_id: 1092,
                court: 'Q1 - Nippur Finance',
                court_id: 1,
                price: 14000,
                hash: 'hash-slot-1',
                sport: 'padel',
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const result = await fetchGripoAvailability(31, '2026-10-11');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.gripo.com.br/app/v1/schedule/available',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Money-Contract': 'money-v4',
            'Origin': 'https://gripo.app',
          }),
          body: JSON.stringify({ club_id: 31, date: '2026-10-11' }),
        })
      );

      expect(result.courts).toHaveLength(1);
      expect(result.courts[0].name).toBe('Q1 - Nippur Finance');
      expect(result.courts[0].hours[0].startHour).toBe('17:30:00');
      expect(result.courts[0].hours[0].priceInCents).toBe(14000);
      expect(result.courts[0].hours[0].available).toBe(true);
    });

    it('throws error when Gripo API fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      await expect(fetchGripoAvailability(31, '2026-10-11')).rejects.toThrow(
        'Falha ao consultar disponibilidade no Gripo (500)'
      );
    });
  });

  describe('getGripoAuthToken', () => {
    it('returns env GRIPO_TOKEN directly if configured', async () => {
      process.env.GRIPO_TOKEN = 'env-jwt-token-123';
      const token = await getGripoAuthToken();
      expect(token).toBe('env-jwt-token-123');
    });

    it('authenticates with login and password when credentials exist', async () => {
      process.env.GRIPO_LOGIN = 'user@example.com';
      process.env.GRIPO_PASSWORD = 'secretpassword';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'auth-jwt-token-from-login' }),
      } as Response);

      const token = await getGripoAuthToken();
      expect(token).toBe('auth-jwt-token-from-login');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.gripo.com.br/app/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('user@example.com'),
        })
      );
    });

    it('returns null if no credentials configured', async () => {
      const token = await getGripoAuthToken();
      expect(token).toBeNull();
    });
  });

  describe('confirmGripoBooking', () => {
    it('returns friendly error when credentials are not configured', async () => {
      const result = await confirmGripoBooking({
        clubId: 31,
        courtId: 1,
        date: '2026-10-11',
        startHour: '18:00',
        endHour: '19:30',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Credenciais do Gripo não configuradas');
    });

    it('sends correct booking payload when token exists', async () => {
      process.env.GRIPO_TOKEN = 'valid-token';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          schedule: {
            id: 9999,
            club_id: 31,
            court: { name: 'Quadra 01' },
          },
          feedback: { message: 'Reserva confirmada' },
        }),
      } as Response);

      const result = await confirmGripoBooking({
        clubId: 31,
        courtId: 1,
        date: '2026-10-11',
        startHour: '18:00',
        endHour: '19:30',
        notes: 'Elo Padel Match #1',
      });

      expect(result.success).toBe(true);
      expect(result.scheduleId).toBe(9999);
      expect(result.courtName).toBe('Quadra 01');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.gripo.com.br/app/v1/schedule/confirm',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
          body: expect.stringContaining('"club_id":31'),
        })
      );
    });
  });
});
