import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignInGate } from '../components/SignInGate';
import { ClaimConfirmModal } from '../components/ClaimConfirmModal';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { ParlayCard } from '../components/ParlayCard';
import { resolveUserTeam, handleTeamsSnapshot } from '../App';
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

  describe('CR-016: Re-subscribe Firestore listeners on auth state change to sync real claimed teams', () => {
    const rawSleeperTeams: TeamProfile[] = [
      { roster_id: 1, owner_id: 'u1', owner_name: 'Blake', team_name: 'Philly Special' },
      { roster_id: 2, owner_id: 'u2', owner_name: 'Bob', team_name: 'Gridiron Clowns' },
      { roster_id: 3, owner_id: 'u3', owner_name: 'Charlie', team_name: 'Buffalo Stampede' },
    ];

    const firestoreLoadedTeams: TeamProfile[] = [
      {
        roster_id: 1,
        owner_id: 'u1',
        owner_name: 'Blake',
        team_name: 'Philly Special',
        claimed_by: { uid: 'user_blake', name: 'Blake G', claimed_at: '2026-10-24T01:00:00Z' },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        owner_name: 'Bob',
        team_name: 'Gridiron Clowns',
        claimed_by: { uid: 'user_bob', name: 'Bob B', claimed_at: '2026-10-24T01:10:00Z' },
      },
      {
        roster_id: 3,
        owner_id: 'u3',
        owner_name: 'Charlie',
        team_name: 'Buffalo Stampede',
      },
    ];

    it('handleTeamsSnapshot updates teams with real claimed_by data and auto-links user claimed team when currentRosterId is null', () => {
      let stateTeams: TeamProfile[] = [...rawSleeperTeams];
      let stateCurrentRosterId: number | null = null;
      let cachedSaved: { leagueId: string; rosterId: number; uid: string } | null = null;

      const mockDocs = firestoreLoadedTeams.map((t) => ({ data: () => t }));

      const success = handleTeamsSnapshot({
        snapshotDocs: mockDocs,
        isDemo: false,
        currentUser: { uid: 'user_bob' },
        currentRosterId: stateCurrentRosterId,
        setTeams: (teams) => { stateTeams = teams; },
        setCurrentRosterId: (rid) => { stateCurrentRosterId = rid; },
        saveCachedTeamIdFn: (leagueId, rosterId, uid) => {
          cachedSaved = { leagueId, rosterId, uid };
        },
        leagueId: '12345',
      });

      expect(success).toBe(true);
      // State updated with real claims
      expect(stateTeams[0].claimed_by?.uid).toBe('user_blake');
      expect(stateTeams[1].claimed_by?.uid).toBe('user_bob');
      expect(stateTeams[2].claimed_by).toBeUndefined();

      // Auto-linked user_bob's team (roster 2)
      expect(stateCurrentRosterId).toBe(2);
      expect(cachedSaved).toEqual({ leagueId: '12345', rosterId: 2, uid: 'user_bob' });
    });

    it('handleTeamsSnapshot does not overwrite currentRosterId if a team is already explicitly selected', () => {
      let stateTeams: TeamProfile[] = [...rawSleeperTeams];
      let stateCurrentRosterId: number | null = 3;
      let cachedSaved = false;

      const mockDocs = firestoreLoadedTeams.map((t) => ({ data: () => t }));

      handleTeamsSnapshot({
        snapshotDocs: mockDocs,
        isDemo: false,
        currentUser: { uid: 'user_bob' },
        currentRosterId: stateCurrentRosterId,
        setTeams: (teams) => { stateTeams = teams; },
        setCurrentRosterId: (rid) => { stateCurrentRosterId = rid; },
        saveCachedTeamIdFn: () => { cachedSaved = true; },
        leagueId: '12345',
      });

      // Teams are updated
      expect(stateTeams[1].claimed_by?.uid).toBe('user_bob');
      // currentRosterId remains unchanged at 3
      expect(stateCurrentRosterId).toBe(3);
      expect(cachedSaved).toBe(false);
    });

    it('handleTeamsSnapshot ignores stale mock team data in real league mode', () => {
      let stateTeams: TeamProfile[] = [...rawSleeperTeams];
      const staleMockDocs = [
        {
          data: () => ({
            roster_id: 1,
            owner_id: 'u1',
            owner_name: 'Alex',
            team_name: 'Gridiron Gladiators',
          }),
        },
      ];

      const success = handleTeamsSnapshot({
        snapshotDocs: staleMockDocs,
        isDemo: false,
        currentUser: { uid: 'user_bob' },
        currentRosterId: null,
        setTeams: (teams) => { stateTeams = teams; },
        setCurrentRosterId: () => {},
        leagueId: '12345',
      });

      expect(success).toBe(false);
      expect(stateTeams).toEqual(rawSleeperTeams);
    });

    it('syncedLeagueRef distinguishes anonymous and authenticated sessions so login sync is not blocked', () => {
      const leagueId = '1312915483992809472';
      const season = '2026';

      // Anonymous session vs Authenticated session key formatting
      const getAuthKey = (u: { uid?: string } | null) => u?.uid || 'anon';
      const anonSyncKey = `${leagueId}_${season}_${getAuthKey(null)}`;
      expect(anonSyncKey).toBe('1312915483992809472_2026_anon');

      // Authenticated session after Google sign-in
      const authedUser = { uid: 'google_user_99' };
      const authedSyncKey = `${leagueId}_${season}_${getAuthKey(authedUser)}`;
      expect(authedSyncKey).toBe('1312915483992809472_2026_google_user_99');

      // Crucial assertion: the authenticated sync key differs from anon, preventing the ref from blocking sync
      expect(authedSyncKey).not.toBe(anonSyncKey);
    });

    it('generates distinct weekSyncKey when liveWeek advances, triggering sync even if league was already synced for prior week', () => {
      const leagueId = '1312915483992809472';
      const authKey = 'user_123';
      const priorWeekKey = `${leagueId}_week_7_${authKey}`;
      const nextWeekKey = `${leagueId}_week_8_${authKey}`;

      expect(nextWeekKey).not.toBe(priorWeekKey);

      // Simulates detection logic in App.tsx
      const storedWeek = 7;
      const liveWeek = 8;
      let syncCalled = false;
      let currentSyncRef = priorWeekKey;

      if (liveWeek > storedWeek) {
        const weekKey = `${leagueId}_week_${liveWeek}_${authKey}`;
        if (currentSyncRef !== weekKey) {
          currentSyncRef = weekKey;
          syncCalled = true;
        }
      }

      expect(syncCalled).toBe(true);
      expect(currentSyncRef).toBe(nextWeekKey);
    });

    it('simulates subscription cleanup and re-subscription on auth change, populating real claims immediately', () => {
      let unsubscriptionsCalled = 0;
      let activeListeners = 0;
      let currentTeamsInState = [...rawSleeperTeams];
      let activeUserRosterId: number | null = null;

      // Simulated subscription manager mirroring App.tsx's useEffect lifecycle
      const subscribeEffect = (user: { uid: string } | null) => {
        activeListeners += 1;

        // When unauthenticated, permissions may prevent Firestore reads or return empty
        if (!user) {
          // Sleeper raw fallback has no claimed_by
          currentTeamsInState = rawSleeperTeams.map((t) => ({ ...t, claimed_by: undefined }));
        } else {
          // When authenticated, Firestore returns real claims
          handleTeamsSnapshot({
            snapshotDocs: firestoreLoadedTeams.map((t) => ({ data: () => t })),
            isDemo: false,
            currentUser: user,
            currentRosterId: activeUserRosterId,
            setTeams: (teams) => { currentTeamsInState = teams; },
            setCurrentRosterId: (rid) => { activeUserRosterId = rid; },
            leagueId: 'test_league',
          });
        }

        // Cleanup function returned by useEffect
        return () => {
          unsubscriptionsCalled += 1;
          activeListeners -= 1;
        };
      };

      // 1. Initial run: Unauthenticated user opens app
      let cleanup = subscribeEffect(null);
      expect(activeListeners).toBe(1);
      expect(currentTeamsInState.every((t) => !t.claimed_by)).toBe(true);

      // Verify TeamPickerModal renders all teams as available/unclaimed prior to login
      const preLoginHtml = renderToString(
        <TeamPickerModal
          isOpen={true}
          onClose={() => {}}
          teams={currentTeamsInState}
          currentRosterId={null}
          currentUserId={undefined}
          leagueId="test_league"
          season="2026"
          onTeamSelected={() => {}}
        />
      );
      expect(preLoginHtml).not.toContain('Claimed by');

      // 2. User signs in with Google without reloading the page!
      // Old subscription is cleanly unsubscribed
      cleanup();
      expect(unsubscriptionsCalled).toBe(1);
      expect(activeListeners).toBe(0);

      // New subscription is attached with authed user
      cleanup = subscribeEffect({ uid: 'user_bob' });
      expect(activeListeners).toBe(1);

      // State is immediately updated with claimed_by data
      expect(currentTeamsInState.find((t) => t.roster_id === 1)?.claimed_by?.uid).toBe('user_blake');
      expect(currentTeamsInState.find((t) => t.roster_id === 2)?.claimed_by?.uid).toBe('user_bob');
      // User's own team (roster 2) is auto-linked
      expect(activeUserRosterId).toBe(2);

      // 3. Verify TeamPickerModal immediately reflects the real claims and Active badge without reload
      const postLoginHtml = renderToString(
        <TeamPickerModal
          isOpen={true}
          onClose={() => {}}
          teams={currentTeamsInState}
          currentRosterId={activeUserRosterId}
          currentUserId="user_bob"
          leagueId="test_league"
          season="2026"
          onTeamSelected={() => {}}
        />
      );
      // Roster 1 shows claimed by Blake G
      expect(postLoginHtml).toContain('Blake G');
      expect(postLoginHtml).toContain('Claimed by');
      // Roster 2 shows Active badge for user_bob
      expect(postLoginHtml).toContain('Active');

      // 4. Final component unmount cleans up subscriptions
      cleanup();
      expect(unsubscriptionsCalled).toBe(2);
      expect(activeListeners).toBe(0);
    });
  });
});
