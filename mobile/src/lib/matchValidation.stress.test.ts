import { describe, it, expect } from 'vitest';
import {
  validateBestOfThreeScores,
  validateBestOfThreeScore,
  calculateQuorumState,
  type QuorumParticipant,
} from './matchValidation';
import type { SetScore } from '../api/types';

describe('Empirical Adversarial Stress Suite: matchValidation.ts', () => {
  // =========================================================================
  // Section 1: Best-of-3 Score Validation Adversarial Testing
  // =========================================================================
  describe('1. Best-of-3 Score Validation (validateBestOfThreeScores)', () => {
    describe('1.1 Valid Matches: 2-0 Sweeps and 2-1 Comebacks', () => {
      it('STR-VAL-01: accepts clean 2-0 sweep for Team A', () => {
        const sets: SetScore[] = [
          { a: 6, b: 2 },
          { a: 6, b: 3 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('A');
        expect(res.error).toBeUndefined();
      });

      it('STR-VAL-02: accepts clean 2-0 sweep for Team B', () => {
        const sets: SetScore[] = [
          { a: 3, b: 6 },
          { a: 4, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('B');
      });

      it('STR-VAL-03: accepts hard-fought 2-1 comeback for Team A', () => {
        const sets: SetScore[] = [
          { a: 4, b: 6 },
          { a: 7, b: 5 },
          { a: 7, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('A');
      });

      it('STR-VAL-04: accepts hard-fought 2-1 comeback for Team B', () => {
        const sets: SetScore[] = [
          { a: 6, b: 1 },
          { a: 4, b: 6 },
          { a: 5, b: 7 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(true);
        expect(res.isValid).toBe(true);
        expect(res.winner).toBe('B');
      });

      it('STR-VAL-05: accepts 3-0 sweep for Team A if 3 sets were played', () => {
        const sets: SetScore[] = [
          { a: 6, b: 1 },
          { a: 6, b: 2 },
          { a: 6, b: 4 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('A');
      });

      it('STR-VAL-06: accepts 3-0 sweep for Team B if 3 sets were played', () => {
        const sets: SetScore[] = [
          { a: 0, b: 6 },
          { a: 1, b: 6 },
          { a: 2, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('B');
      });

      it('STR-VAL-07: accepts bagel / pneu sets (6-0, 0-6)', () => {
        const sets: SetScore[] = [
          { a: 6, b: 0 },
          { a: 0, b: 6 },
          { a: 6, b: 0 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('A');
      });

      it('STR-VAL-08: accepts high-scoring extended tiebreak sets (e.g. 15-13, 20-18)', () => {
        const sets: SetScore[] = [
          { a: 15, b: 13 },
          { a: 18, b: 20 },
          { a: 12, b: 10 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(true);
        expect(res.winner).toBe('A');
      });

      it('STR-VAL-09: alias validateBestOfThreeScore produces identical results', () => {
        const sets: SetScore[] = [
          { a: 6, b: 3 },
          { a: 6, b: 2 },
        ];
        expect(validateBestOfThreeScore(sets, 'A')).toEqual(validateBestOfThreeScores(sets, 'A'));
      });
    });

    describe('1.2 Set Count Boundaries (Empty, Single, Excess Sets)', () => {
      it('STR-VAL-10: rejects empty sets array', () => {
        const res = validateBestOfThreeScores([], 'A');
        expect(res.valid).toBe(false);
        expect(res.isValid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('STR-VAL-11: rejects single set score', () => {
        const res = validateBestOfThreeScores([{ a: 6, b: 1 }], 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('STR-VAL-12: rejects 4 sets played', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 },
          { a: 4, b: 6 },
          { a: 7, b: 6 },
          { a: 6, b: 3 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('STR-VAL-13: rejects 5 sets played', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 },
          { a: 4, b: 6 },
          { a: 6, b: 4 },
          { a: 4, b: 6 },
          { a: 6, b: 4 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/2 ou 3 sets jogados/i);
      });

      it('STR-VAL-14: rejects null / undefined / non-array inputs safely', () => {
        expect(validateBestOfThreeScores(null as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(undefined as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores({} as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores('6-4, 6-2' as any, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(12345 as any, 'A').valid).toBe(false);
      });
    });

    describe('1.3 Intra-Set Tied Games (Empates)', () => {
      it('STR-VAL-15: rejects 6-6 tie in set 1', () => {
        const sets: SetScore[] = [
          { a: 6, b: 6 },
          { a: 6, b: 4 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/não pode terminar empatado \(6x6\)/i);
      });

      it('STR-VAL-16: rejects 5-5 tie in set 2', () => {
        const sets: SetScore[] = [
          { a: 6, b: 2 },
          { a: 5, b: 5 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/set 2 não pode terminar empatado/i);
      });

      it('STR-VAL-17: rejects 0-0 tie', () => {
        const sets: SetScore[] = [
          { a: 0, b: 0 },
          { a: 6, b: 2 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/não pode terminar empatado/i);
      });

      it('STR-VAL-18: rejects 7-7 tie in 3rd set', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 },
          { a: 4, b: 6 },
          { a: 7, b: 7 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/set 3 não pode terminar empatado \(7x7\)/i);
      });
    });

    describe('1.4 Negative, Non-Integer, NaN, Infinity & Malformed Scores', () => {
      it('STR-VAL-19: rejects negative game scores', () => {
        const sets1: SetScore[] = [
          { a: -1, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(sets1, 'A').valid).toBe(false);
        expect(validateBestOfThreeScores(sets1, 'A').error).toMatch(/inteiros não negativos/i);

        const sets2: SetScore[] = [
          { a: 6, b: 2 },
          { a: 6, b: -3 },
        ];
        expect(validateBestOfThreeScores(sets2, 'A').valid).toBe(false);
      });

      it('STR-VAL-20: rejects floating point numbers', () => {
        const setsFloatA: SetScore[] = [
          { a: 6.5, b: 4 },
          { a: 6, b: 3 },
        ];
        expect(validateBestOfThreeScores(setsFloatA, 'A').valid).toBe(false);

        const setsFloatB: SetScore[] = [
          { a: 6, b: 4 },
          { a: 6, b: 3.14 },
        ];
        expect(validateBestOfThreeScores(setsFloatB, 'A').valid).toBe(false);
      });

      it('STR-VAL-21: rejects NaN, Infinity and -Infinity', () => {
        const setsNaN: SetScore[] = [
          { a: NaN, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(setsNaN, 'A').valid).toBe(false);

        const setsInf: SetScore[] = [
          { a: 6, b: Infinity },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(setsInf, 'A').valid).toBe(false);

        const setsNegInf: SetScore[] = [
          { a: -Infinity, b: 6 },
          { a: 6, b: 4 },
        ];
        expect(validateBestOfThreeScores(setsNegInf, 'A').valid).toBe(false);
      });

      it('STR-VAL-22: rejects null / undefined elements or missing properties within set objects', () => {
        const setsWithNull = [null as any, { a: 6, b: 2 }];
        expect(validateBestOfThreeScores(setsWithNull, 'A').valid).toBe(false);

        const setsWithUndef = [{ a: 6, b: 2 }, undefined as any];
        expect(validateBestOfThreeScores(setsWithUndef, 'A').valid).toBe(false);

        const setsMissingA = [{ b: 4 } as any, { a: 6, b: 2 }];
        expect(validateBestOfThreeScores(setsMissingA, 'A').valid).toBe(false);

        const setsMissingB = [{ a: 6 } as any, { a: 6, b: 2 }];
        expect(validateBestOfThreeScores(setsMissingB, 'A').valid).toBe(false);
      });

      it('STR-VAL-23: rejects string values inside score numbers without crashing', () => {
        const setsString = [{ a: '6' as any, b: 4 }, { a: 6, b: 2 }];
        expect(validateBestOfThreeScores(setsString, 'A').valid).toBe(false);
      });
    });

    describe('1.5 Winner Mismatches and Incomplete Match Rules', () => {
      it('STR-VAL-24: rejects match when neither team won 2 sets (e.g. 1-1 tie with 2 sets)', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 }, // A won
          { a: 4, b: 6 }, // B won
        ];
        const resA = validateBestOfThreeScores(sets, 'A');
        expect(resA.valid).toBe(false);
        expect(resA.error).toMatch(/precisa vencer pelo menos 2 sets/i);

        const resB = validateBestOfThreeScores(sets, 'B');
        expect(resB.valid).toBe(false);
        expect(resB.error).toMatch(/precisa vencer pelo menos 2 sets/i);
      });

      it('STR-VAL-25: rejects winner mismatch when Team B won 2-0 but user selected Team A', () => {
        const sets: SetScore[] = [
          { a: 2, b: 6 },
          { a: 4, b: 6 },
        ];
        const res = validateBestOfThreeScores(sets, 'A');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/diverge do placar de sets/i);
        expect(res.error).toMatch(/Dupla B venceu 2 sets/i);
      });

      it('STR-VAL-26: rejects winner mismatch when Team A won 2-0 but user selected Team B', () => {
        const sets: SetScore[] = [
          { a: 6, b: 1 },
          { a: 6, b: 3 },
        ];
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/diverge do placar de sets/i);
        expect(res.error).toMatch(/Dupla A venceu 2 sets/i);
      });

      it('STR-VAL-27: rejects winner mismatch in 2-1 matches', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 },
          { a: 4, b: 6 },
          { a: 6, b: 3 },
        ]; // A won 2-1
        const res = validateBestOfThreeScores(sets, 'B');
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/diverge do placar/i);
      });

      it('STR-VAL-28: rejects invalid winner enum (neither A nor B)', () => {
        const sets: SetScore[] = [
          { a: 6, b: 4 },
          { a: 6, b: 3 },
        ];
        const res = validateBestOfThreeScores(sets, 'C' as any);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/diverge do placar/i);
      });
    });

    describe('1.6 Property-Based Fuzz Generator for Best-of-3 Validation', () => {
      it('STR-VAL-29: validates 300 randomized legitimate and illegitimate match scores', () => {
        for (let iter = 0; iter < 300; iter++) {
          const setsCount = 2 + (iter % 2); // 2 or 3 sets
          const sets: SetScore[] = [];
          let winsA = 0;
          let winsB = 0;

          for (let s = 0; s < setsCount; s++) {
            // Generate non-tied scores
            const a = 6;
            const b = (s + iter) % 5; // 0, 1, 2, 3, 4
            sets.push({ a, b });
            if (a > b) winsA++;
            else winsB++;
          }

          const actualWinner = winsA > winsB ? 'A' : 'B';
          const oppositeWinner = actualWinner === 'A' ? 'B' : 'A';

          const validCheck = validateBestOfThreeScores(sets, actualWinner);
          expect(validCheck.valid).toBe(true);
          expect(validCheck.winner).toBe(actualWinner);

          const invalidCheck = validateBestOfThreeScores(sets, oppositeWinner);
          expect(invalidCheck.valid).toBe(false);
          expect(invalidCheck.error).toBeDefined();
        }
      });
    });
  });

  // =========================================================================
  // Section 2: 3-Vote Quorum Resolution & Divergence Locking Adversarial Testing
  // =========================================================================
  describe('2. 3-Vote Quorum Resolution & Divergence Locking (calculateQuorumState)', () => {
    describe('2.1 Unanimous 4-Vote Confirmation', () => {
      it('STR-QRM-01: unanimous 4-vote confirmation for Team A', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(4);
        expect(res.votesA).toBe(4);
        expect(res.votesB).toBe(0);
        expect(res.hasBothTeams).toBe(true);
        expect(res.teamsRepresentedCount).toBe(2);
      });

      it('STR-QRM-02: unanimous 4-vote confirmation for Team B', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants, 'B');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(4);
        expect(res.votesA).toBe(0);
        expect(res.votesB).toBe(4);
        expect(res.hasBothTeams).toBe(true);
      });
    });

    describe('2.2 3 Votes with Mutual Team Representation', () => {
      it('STR-QRM-03: 2 from Team A + 1 from Team B agreeing on A -> confirmed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(3);
        expect(res.votesA).toBe(3);
        expect(res.votesB).toBe(0);
        expect(res.hasBothTeams).toBe(true);
      });

      it('STR-QRM-04: 1 from Team A + 2 from Team B agreeing on B -> confirmed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants, 'B');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(3);
        expect(res.votesA).toBe(0);
        expect(res.votesB).toBe(3);
        expect(res.hasBothTeams).toBe(true);
      });

      it('STR-QRM-05: 1 from Team A + 2 from Team B agreeing on A (B concedes) -> confirmed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(true);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(3);
        expect(res.votesA).toBe(3);
        expect(res.hasBothTeams).toBe(true);
      });
    });

    describe('2.3 3 Votes with Only One Team Represented (Unilateral Quorum Attempt)', () => {
      it('STR-QRM-06: 3 votes from Team A, 0 from Team B -> unconfirmed (must NOT reach quorum without both teams)', () => {
        // Simulating an anomalous roster or sub-agent roster where 3 votes belong to team A
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.hasBothTeams).toBe(false);
        expect(res.teamsRepresentedCount).toBe(1);
        expect(res.totalVotes).toBe(3);
        expect(res.isDisputed).toBe(false); // No dispute yet, simply pending quorum
      });

      it('STR-QRM-07: 3 votes from Team B, 0 from Team A -> unconfirmed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'B');
        expect(res.isQuorumMet).toBe(false);
        expect(res.hasBothTeams).toBe(false);
        expect(res.teamsRepresentedCount).toBe(1);
      });
    });

    describe('2.4 Vote Conflict & Divergence Locking', () => {
      it('STR-QRM-08: 2 votes for Team A, 1 vote for Team B -> divergence locking (isDisputed: true)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' }, // Conflicting vote!
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.votesA).toBe(2);
        expect(res.votesB).toBe(1);
        expect(res.totalVotes).toBe(3);
      });

      it('STR-QRM-09: 1 vote for Team A, 1 vote for Team B -> divergence locking (isDisputed: true)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants);
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.votesA).toBe(1);
        expect(res.votesB).toBe(1);
      });

      it('STR-QRM-10: 2 votes for Team A, 2 votes for Team B (tie split) -> divergence locking', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants);
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.votesA).toBe(2);
        expect(res.votesB).toBe(2);
      });

      it('STR-QRM-11: 3 votes for Team A, 1 vote for Team B -> divergence locking', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.votesA).toBe(3);
        expect(res.votesB).toBe(1);
      });
    });

    describe('2.5 Explicit Dispute by Any Participant', () => {
      it('STR-QRM-12: explicit dispute by 1 participant immediately locks match as disputed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'disputed', resultWinner: null },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.totalVotes).toBe(0);
      });

      it('STR-QRM-13: explicit dispute overrules otherwise valid 3-vote quorum', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'disputed', resultWinner: null }, // 4th player disputes!
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.totalVotes).toBe(3);
      });

      it('STR-QRM-14: all 4 participants marking disputed', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'disputed' },
          { team: 'A', confirmation: 'disputed' },
          { team: 'B', confirmation: 'disputed' },
          { team: 'B', confirmation: 'disputed' },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
        expect(res.totalVotes).toBe(0);
      });
    });

    describe('2.6 Sub-Quorum (Pending / Incomplete Votes)', () => {
      it('STR-QRM-15: 2 agreeing votes from both teams -> pending (sub-quorum)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(2);
        expect(res.hasBothTeams).toBe(true);
      });

      it('STR-QRM-16: 2 agreeing votes from same team -> pending (sub-quorum and lacking mutual representation)', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'B', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(2);
        expect(res.hasBothTeams).toBe(false);
      });

      it('STR-QRM-17: 1 vote -> pending', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'A' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(1);
      });

      it('STR-QRM-18: 0 votes (all pending) -> pending', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'A', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
        expect(res.totalVotes).toBe(0);
        expect(res.hasBothTeams).toBe(false);
      });
    });

    describe('2.7 Submitted Winner Mismatch Divergence', () => {
      it('STR-QRM-19: 3 votes agreeing on B when submittedWinner was A -> triggers divergence locking', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'pending', resultWinner: null },
        ];
        // Submitted winner was A, but players voted B!
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
      });

      it('STR-QRM-20: 4 unanimous votes for B when submittedWinner was A -> triggers divergence locking', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'A', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'B' },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.isDisputed).toBe(true);
        expect(res.isQuorumMet).toBe(false);
      });
    });

    describe('2.8 Resilient Handling of Malformed Participant Payloads', () => {
      it('STR-QRM-21: handles null / undefined / empty array safely', () => {
        expect(calculateQuorumState(null as any).isQuorumMet).toBe(false);
        expect(calculateQuorumState(undefined as any).isQuorumMet).toBe(false);
        expect(calculateQuorumState([]).isQuorumMet).toBe(false);
      });

      it('STR-QRM-22: ignores confirmed status if resultWinner is null or invalid', () => {
        const participants: QuorumParticipant[] = [
          { team: 'A', confirmation: 'confirmed', resultWinner: null },
          { team: 'A', confirmation: 'confirmed', resultWinner: undefined },
          { team: 'B', confirmation: 'confirmed', resultWinner: 'X' as any },
          { team: 'B', confirmation: 'pending', resultWinner: null },
        ];
        const res = calculateQuorumState(participants, 'A');
        expect(res.totalVotes).toBe(0);
        expect(res.isQuorumMet).toBe(false);
        expect(res.isDisputed).toBe(false);
      });
    });

    describe('2.9 Exhaustive 4^4 = 256 State Combinatorial Harness', () => {
      it('STR-QRM-23: exhaustively tests all 256 states across 4 players (A1, A2, B1, B2)', () => {
        type PlayerAction =
          | { type: 'P' } // pending
          | { type: 'CA' } // confirmed A
          | { type: 'CB' } // confirmed B
          | { type: 'D' }; // disputed

        const actions: PlayerAction[] = [
          { type: 'P' },
          { type: 'CA' },
          { type: 'CB' },
          { type: 'D' },
        ];

        let totalCombinations = 0;
        let quorumMetCount = 0;
        let disputedCount = 0;
        let pendingCount = 0;

        for (const actA1 of actions) {
          for (const actA2 of actions) {
            for (const actB1 of actions) {
              for (const actB2 of actions) {
                totalCombinations++;

                const mapParticipant = (
                  team: 'A' | 'B',
                  act: PlayerAction
                ): QuorumParticipant => {
                  switch (act.type) {
                    case 'P':
                      return { team, confirmation: 'pending', resultWinner: null };
                    case 'CA':
                      return { team, confirmation: 'confirmed', resultWinner: 'A' };
                    case 'CB':
                      return { team, confirmation: 'confirmed', resultWinner: 'B' };
                    case 'D':
                      return { team, confirmation: 'disputed', resultWinner: null };
                  }
                };

                const participants: QuorumParticipant[] = [
                  mapParticipant('A', actA1),
                  mapParticipant('A', actA2),
                  mapParticipant('B', actB1),
                  mapParticipant('B', actB2),
                ];

                const res = calculateQuorumState(participants, 'A');

                // Mathematical Invariant Checks:
                const hasDisputedPlayer = [actA1, actA2, actB1, actB2].some(
                  (a) => a.type === 'D'
                );
                const countCA = [actA1, actA2, actB1, actB2].filter(
                  (a) => a.type === 'CA'
                ).length;
                const countCB = [actA1, actA2, actB1, actB2].filter(
                  (a) => a.type === 'CB'
                ).length;
                const teamAHasVoteForA = actA1.type === 'CA' || actA2.type === 'CA';
                const teamBHasVoteForA = actB1.type === 'CA' || actB2.type === 'CA';

                // Invariant 1: If any player explicitly disputed, must be isDisputed = true, isQuorumMet = false
                if (hasDisputedPlayer) {
                  expect(res.isDisputed).toBe(true);
                  expect(res.isQuorumMet).toBe(false);
                }

                // Invariant 2: If there are votes for B (when submitted is A), must be isDisputed = true, isQuorumMet = false
                if (countCB > 0) {
                  expect(res.isDisputed).toBe(true);
                  expect(res.isQuorumMet).toBe(false);
                }

                // Invariant 3: Quorum is met if and only if:
                // - No disputes
                // - No votes for B (mismatch with submitted A)
                // - Total votes for A >= 3
                // - Both Team A and Team B have at least one vote for A
                const shouldBeQuorum =
                  !hasDisputedPlayer &&
                  countCB === 0 &&
                  countCA >= 3 &&
                  teamAHasVoteForA &&
                  teamBHasVoteForA;

                expect(res.isQuorumMet).toBe(shouldBeQuorum);

                if (res.isQuorumMet) quorumMetCount++;
                else if (res.isDisputed) disputedCount++;
                else pendingCount++;
              }
            }
          }
        }

        expect(totalCombinations).toBe(256);
        // Quorum is met only when:
        // Either all 4 vote CA: 1 combination
        // Or 3 vote CA (2 from Team A + 1 from Team B, or 1 from Team A + 2 from Team B) and 1 is Pending:
        // (2 Team A * 2 Team B) = 4 combinations
        // Total valid quorum combinations for 'A': 1 + 4 = 5 combinations!
        expect(quorumMetCount).toBe(5);
        expect(disputedCount + pendingCount + quorumMetCount).toBe(256);
      });
    });
  });
});
