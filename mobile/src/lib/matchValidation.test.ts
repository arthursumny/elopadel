import { describe, it, expect } from 'vitest';
import {
  validateBestOfThreeScores,
  calculateQuorumState,
} from './matchValidation';

describe('Match Validation & Quorum Resolution (`matchValidation.ts`)', () => {
  describe('validateBestOfThreeScores', () => {
    it('TC-VAL-01: accepts valid 2-0 sweep', () => {
      const sets = [
        { a: 6, b: 4 },
        { a: 6, b: 2 },
      ];
      const res = validateBestOfThreeScores(sets, 'A');
      expect(res.valid).toBe(true);
      expect(res.winner).toBe('A');
    });

    it('TC-VAL-02: accepts valid 2-1 comeback', () => {
      const sets = [
        { a: 4, b: 6 },
        { a: 6, b: 4 },
        { a: 7, b: 5 },
      ];
      const res = validateBestOfThreeScores(sets, 'A');
      expect(res.valid).toBe(true);
      expect(res.winner).toBe('A');
    });

    it('TC-VAL-03: accepts valid 2-0 victory for Team B', () => {
      const sets = [
        { a: 2, b: 6 },
        { a: 3, b: 6 },
      ];
      const res = validateBestOfThreeScores(sets, 'B');
      expect(res.valid).toBe(true);
      expect(res.winner).toBe('B');
    });

    it('TC-VAL-04: rejects single set score', () => {
      const res = validateBestOfThreeScores([{ a: 6, b: 0 }], 'A');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/2 ou 3 sets/i);
    });

    it('TC-VAL-05: rejects more than 3 sets', () => {
      const sets = [
        { a: 6, b: 2 },
        { a: 2, b: 6 },
        { a: 6, b: 4 },
        { a: 6, b: 0 },
      ];
      const res = validateBestOfThreeScores(sets, 'A');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/2 ou 3 sets/i);
    });

    it('TC-VAL-06: rejects tied games within a set', () => {
      const sets = [
        { a: 6, b: 6 },
        { a: 6, b: 4 },
      ];
      const res = validateBestOfThreeScores(sets, 'A');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/não pode terminar empatado/i);
    });

    it('TC-VAL-07: rejects negative or non-integer games', () => {
      const setsNeg = [
        { a: -1, b: 6 },
        { a: 6, b: 4 },
      ];
      expect(validateBestOfThreeScores(setsNeg, 'A').valid).toBe(false);

      const setsFloat = [
        { a: 6.5, b: 4 },
        { a: 6, b: 4 },
      ];
      expect(validateBestOfThreeScores(setsFloat, 'A').valid).toBe(false);
    });

    it('TC-VAL-08: rejects score where neither team won 2 sets', () => {
      const sets = [
        { a: 6, b: 4 },
        { a: 4, b: 6 },
      ]; // 1-1 tie with only 2 sets played
      const res = validateBestOfThreeScores(sets, 'A');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/pelo menos 2 sets/i);
    });

    it('TC-VAL-09: rejects mismatch between sets winner and declared winner', () => {
      const sets = [
        { a: 6, b: 4 },
        { a: 6, b: 2 },
      ];
      const res = validateBestOfThreeScores(sets, 'B'); // declared B, actual A
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/diverge do placar/i);
    });
  });

  describe('calculateQuorumState', () => {
    it('TC-QUORUM-01: validates quorum when >= 3 votes with both teams represented', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'pending', resultWinner: null },
      ];

      const res = calculateQuorumState(participants, 'A');
      expect(res.isQuorumMet).toBe(true);
      expect(res.isDisputed).toBe(false);
      expect(res.totalVotes).toBe(3);
      expect(res.hasBothTeams).toBe(true);
      expect(res.votesA).toBe(3);
      expect(res.votesB).toBe(0);
    });

    it('TC-QUORUM-02: quorum fails when only one team votes (lacks mutual representation)', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'pending', resultWinner: null },
        { team: 'B' as const, confirmation: 'pending', resultWinner: null },
      ];

      const res = calculateQuorumState(participants, 'A');
      expect(res.isQuorumMet).toBe(false);
      expect(res.hasBothTeams).toBe(false);
      expect(res.totalVotes).toBe(2);
    });

    it('TC-QUORUM-03: quorum fails when total votes < 3 even if both teams voted', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'A' as const, confirmation: 'pending', resultWinner: null },
        { team: 'B' as const, confirmation: 'pending', resultWinner: null },
      ];

      const res = calculateQuorumState(participants, 'A');
      expect(res.isQuorumMet).toBe(false);
      expect(res.totalVotes).toBe(2);
      expect(res.hasBothTeams).toBe(true);
    });

    it('TC-QUORUM-04: conflicting votes immediately trigger isDisputed and prevent quorum', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'confirmed', resultWinner: 'B' as const }, // CONFLICT!
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
      ];

      const res = calculateQuorumState(participants);
      expect(res.isDisputed).toBe(true);
      expect(res.isQuorumMet).toBe(false);
      expect(res.votesA).toBe(2);
      expect(res.votesB).toBe(1);
    });

    it('TC-QUORUM-05: explicit disputed confirmation status triggers isDisputed', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
        { team: 'B' as const, confirmation: 'disputed', resultWinner: null }, // Explicit dispute
        { team: 'B' as const, confirmation: 'confirmed', resultWinner: 'A' as const },
      ];

      const res = calculateQuorumState(participants, 'A');
      expect(res.isDisputed).toBe(true);
      expect(res.isQuorumMet).toBe(false);
    });

    it('TC-QUORUM-06: mismatch with submitted winner triggers isDisputed', () => {
      const participants = [
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'B' as const },
        { team: 'B' as const, confirmation: 'confirmed', resultWinner: 'B' as const },
        { team: 'A' as const, confirmation: 'confirmed', resultWinner: 'B' as const },
      ];

      // Submitted winner was A, but votes are for B
      const res = calculateQuorumState(participants, 'A');
      expect(res.isDisputed).toBe(true);
      expect(res.isQuorumMet).toBe(false);
    });
  });
});
