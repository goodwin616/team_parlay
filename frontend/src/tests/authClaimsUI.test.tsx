import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignInGate } from '../components/SignInGate';
import { ClaimConfirmModal } from '../components/ClaimConfirmModal';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { ParlayCard } from '../components/ParlayCard';
import { resolveUserTeam } from '../App';
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

  describe('CR-012: Unassigned Team State & Explicit Team Selection', () => {
    const mockTeams: TeamProfile[] = [
      { roster_id: 1, owner_id: 'u1', owner_name: 'Blake', team_name: 'Philly Special' },
      { roster_id: 2, owner_id: 'u2', owner_name: 'Bob', team_name: 'Gridiron Clowns' },
    ];

    const testParlay: WeeklyParlay = {
      week: 4,
      season: '2026',
      status: 'open',
      contains_sgp: false,
      bettor: { roster_id: 2, team_name: 'Gridiron Clowns', owner_name: 'Bob', points_last_week: 78.4 },
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
        },
        {
          id: 'l2',
          roster_id: 2,
          team_name: 'Gridiron Clowns',
          owner_name: 'Bob',
          nfl_team: 'KC',
          description: '',
          odds_american: '-110',
          odds_decimal: 1.91,
          status: 'pending',
        },
      ],
      estimated_odds_american: '+300',
      estimated_multiplier: 4.0,
      estimated_payout: 20.0,
      actual_payout: null,
      actual_odds_american: null,
    };

    it('renders ParlayCard with currentRosterId === null without marking any leg as (You)', () => {
      const html = renderToString(
        <ParlayCard
          parlay={testParlay}
          currentRosterId={null}
          onOpenPickModal={() => {}}
        />
      );

      // No (You) badge should be present on any leg
      expect(html).not.toContain('(You)');
      // Prompt title on clickable legs for unassigned user
      expect(html).toContain('Select your team to make a pick');
    });

    it('renders TeamPickerModal with currentRosterId === null without highlighting any team as active', () => {
      const html = renderToString(
        <TeamPickerModal
          isOpen={true}
          onClose={() => {}}
          teams={mockTeams}
          currentRosterId={null}
          currentUserId="user_test"
          leagueId="demo"
          season="2026"
          onTeamSelected={() => {}}
        />
      );

      // No team should have the "Active" badge
      expect(html).not.toContain('Active');
      // Both teams show "Select" action button
      expect(html).toContain('Select');
      expect(html).toContain('Philly Special');
      expect(html).toContain('Gridiron Clowns');
    });

    it('renders TeamPickerModal with an active selection when currentRosterId is set', () => {
      const html = renderToString(
        <TeamPickerModal
          isOpen={true}
          onClose={() => {}}
          teams={mockTeams}
          currentRosterId={1}
          currentUserId="user_test"
          leagueId="demo"
          season="2026"
          onTeamSelected={() => {}}
        />
      );

      // Roster 1 should show the Active badge
      expect(html).toContain('Active');
    });

    describe('resolveUserTeam Logic', () => {
      it('returns null rosterId and openPicker=true when user has no claimed team, server team, or cache', async () => {
        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'unassigned_user' },
          teams: mockTeams,
          getMyTeamFn: async () => ({ data: null }),
          getCachedTeamIdFn: () => null,
        });

        // Must NOT default to 1!
        expect(result.rosterId).toBeNull();
        expect(result.openPicker).toBe(true);
      });

      it('does NOT return User A cached team for unassigned User B (prevents cross-user pollution)', async () => {
        const userScopedCache: Record<string, number> = {
          'user_a': 1,
        };

        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'user_b' },
          teams: mockTeams,
          getMyTeamFn: async () => ({ data: null }),
          getCachedTeamIdFn: (_leagueId, uid) => (uid ? userScopedCache[uid] ?? null : null),
        });

        // User B must not inherit User A's team 1!
        expect(result.rosterId).toBeNull();
        expect(result.openPicker).toBe(true);
      });

      it('returns server rosterId and openPicker=false when get_my_team returns a claimed team', async () => {
        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'user_1' },
          teams: mockTeams,
          getMyTeamFn: async () => ({ data: { roster_id: 2 } }),
          getCachedTeamIdFn: () => null,
        });

        expect(result.rosterId).toBe(2);
        expect(result.openPicker).toBe(false);
      });

      it('returns cached rosterId when stored in client cache for the user and valid in current teams', async () => {
        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'user_1' },
          teams: mockTeams,
          getMyTeamFn: async () => {
            throw new Error('Offline');
          },
          getCachedTeamIdFn: (_leagueId, uid) => (uid === 'user_1' ? 1 : null),
        });

        expect(result.rosterId).toBe(1);
        expect(result.openPicker).toBe(false);
      });

      it('returns rosterId of claimed team when user matches claimed_by.uid in loaded teams even if cache is empty', async () => {
        const teamsWithClaim: TeamProfile[] = [
          { roster_id: 1, owner_id: 'u1', owner_name: 'Blake', team_name: 'Philly Special' },
          {
            roster_id: 2,
            owner_id: 'u2',
            owner_name: 'Bob',
            team_name: 'Gridiron Clowns',
            claimed_by: { uid: 'user_bob', name: 'Bob B', claimed_at: '2026-10-24T00:00:00Z' },
          },
        ];

        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'user_bob' },
          teams: teamsWithClaim,
          getMyTeamFn: async () => ({ data: null }),
          getCachedTeamIdFn: () => null,
        });

        expect(result.rosterId).toBe(2);
        expect(result.openPicker).toBe(false);
      });

      it('prioritizes loaded claimed team over stale cached team', async () => {
        const teamsWithClaim: TeamProfile[] = [
          { roster_id: 1, owner_id: 'u1', owner_name: 'Blake', team_name: 'Philly Special' },
          {
            roster_id: 2,
            owner_id: 'u2',
            owner_name: 'Bob',
            team_name: 'Gridiron Clowns',
            claimed_by: { uid: 'user_bob', name: 'Bob B', claimed_at: '2026-10-24T00:00:00Z' },
          },
        ];

        const result = await resolveUserTeam({
          leagueId: 'test_league',
          user: { uid: 'user_bob' },
          teams: teamsWithClaim,
          getMyTeamFn: async () => ({ data: null }),
          // Stale cache points to roster 1
          getCachedTeamIdFn: () => 1,
        });

        // Claimed team check (step 2) must take precedence over cache (step 3)
        expect(result.rosterId).toBe(2);
        expect(result.openPicker).toBe(false);
      });
    });

    it('sets currentRosterId and updates claimed_by when onTeamSelected is triggered', () => {
      let selectedRosterId: number | null = null;
      let teamList = [...mockTeams];

      const handleTeamSelected = (rosterId: number, claimedBy?: any) => {
        selectedRosterId = rosterId;
        if (claimedBy) {
          teamList = teamList.map((t) =>
            t.roster_id === rosterId ? { ...t, claimed_by: claimedBy } : t
          );
        }
      };

      // User explicitly claims roster 2
      const claimPayload = { uid: 'new_claimer', name: 'New Manager', claimed_at: '2026-10-24T00:00:00Z' };
      handleTeamSelected(2, claimPayload);

      expect(selectedRosterId).toBe(2);
      expect(teamList.find((t) => t.roster_id === 2)?.claimed_by?.uid).toBe('new_claimer');
    });
  });
});
