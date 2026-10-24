import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignInGate } from '../components/SignInGate';
import { ClaimConfirmModal } from '../components/ClaimConfirmModal';
import { ParlayCard } from '../components/ParlayCard';
import { WeeklyParlay, TeamProfile } from '../types';

describe('CR-007b UI: Google Auth, Claims & Audit indicators', () => {
  describe('SignInGate Component', () => {
    it('renders full-screen sign-in gate with Google button when user is unauthenticated', () => {
      const html = renderToString(
        <SignInGate user={null} loading={false} leagueName="Test League">
          <div data-testid="protected-content">Secret League Content</div>
        </SignInGate>
      );

      expect(html).toContain('Sign in with Google');
      expect(html).toContain('Test League');
      expect(html).not.toContain('Secret League Content');
    });

    it('renders children when user is authenticated', () => {
      const mockUser = { uid: 'user_1', displayName: 'Blake', email: 'blake@example.com' };
      const html = renderToString(
        <SignInGate user={mockUser} loading={false} leagueName="Test League">
          <div data-testid="protected-content">Secret League Content</div>
        </SignInGate>
      );

      expect(html).toContain('Secret League Content');
      expect(html).not.toContain('Sign in with Google');
    });
  });

  describe('ClaimConfirmModal Component', () => {
    const mockTeam: TeamProfile = {
      roster_id: 2,
      owner_id: 'u2',
      owner_name: 'Bob',
      team_name: 'Gridiron Clowns',
    };

    it('renders in claim confirmation mode for unclaimed teams', () => {
      const html = renderToString(
        <ClaimConfirmModal
          isOpen={true}
          onClose={() => {}}
          mode="claim"
          team={mockTeam}
          onConfirm={() => {}}
        />
      );

      expect(html).toContain('Claim Fantasy Team');
      expect(html).toContain('Claim Team');
      expect(html).toContain('Gridiron Clowns');
      expect(html).not.toContain('Team Already Claimed');
    });

    it('renders in override confirmation mode with warning when claimed by another user', () => {
      const html = renderToString(
        <ClaimConfirmModal
          isOpen={true}
          onClose={() => {}}
          mode="override"
          team={mockTeam}
          claimedBy={{ uid: 'other_uid', name: 'Original Bob', claimed_at: '2026-10-23T00:00:00Z' }}
          onConfirm={() => {}}
        />
      );

      expect(html).toContain('Team Already Claimed');
      expect(html).toContain('Continue Anyway');
      expect(html).toContain('Original Bob');
      expect(html).toContain('server audit log');
    });
  });

  describe('ParlayCard Non-Claimer Warning Indicator', () => {
    const parlayWithEditedLeg: WeeklyParlay = {
      week: 4,
      season: '2026',
      status: 'open',
      contains_sgp: false,
      bettor: {
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        points_last_week: 78.4,
      },
      earliest_kickoff: '2026-10-29T20:15:00Z',
      legs: [
        {
          id: 'l1',
          roster_id: 1,
          team_name: 'Philly Special',
          owner_name: 'Blake',
          nfl_team: 'PHI',
          description: 'Saquon Barkley Anytime TD',
          odds_american: '-110',
          odds_decimal: 1.91,
          status: 'submitted',
          edited_by_non_claimer: true,
          last_edited_by: { uid: 'other_uid', name: 'Commish Dave' },
        },
        {
          id: 'l2',
          roster_id: 2,
          team_name: 'Gridiron Clowns',
          owner_name: 'Bob',
          nfl_team: 'KC',
          description: 'KC Winner (Moneyline)',
          odds_american: '+117',
          odds_decimal: 2.17,
          status: 'submitted',
          edited_by_non_claimer: false,
        },
      ],
      estimated_odds_american: '+300',
      estimated_multiplier: 4.0,
      estimated_payout: 20.0,
      actual_payout: null,
      actual_odds_american: null,
    };

    it('shows ⚠️ indicator with tooltip next to owner name when edited_by_non_claimer is true', () => {
      const html = renderToString(
        <ParlayCard
          parlay={parlayWithEditedLeg}
          currentRosterId={2}
          onOpenPickModal={() => {}}
        />
      );

      expect(html).toContain('⚠️');
      expect(html).toContain('Pick submitted by Commish Dave');
    });
  });
});
