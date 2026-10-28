import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PastSlipsArchive } from '../components/PastSlipsArchive';
import { WeeklyParlay } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function renderArchiveElement(props: React.ComponentProps<typeof PastSlipsArchive>) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const prevDispatcher = internals.ReactCurrentDispatcher.current;
  let hookIndex = 0;
  const stateSetters: any[] = [];

  internals.ReactCurrentDispatcher.current = {
    useState: (init: any) => {
      hookIndex++;
      const val = typeof init === 'function' ? init() : init;
      const setter = vi.fn();
      stateSetters.push(setter);
      return [val, setter];
    },
    useRef: (init: any) => ({ current: init }),
    useEffect: vi.fn(),
  };

  try {
    const element = PastSlipsArchive(props) as any;
    return { element, stateSetters };
  } finally {
    internals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

describe('PastSlipsArchive Component', () => {
  const samplePastParlays: WeeklyParlay[] = [
    {
      week: 3,
      season: '2026',
      status: 'won',
      contains_sgp: false,
      bettor: {
        roster_id: 2,
        team_name: 'Gridiron Clowns',
        owner_name: 'Bob',
        points_last_week: 78.4,
      },
      earliest_kickoff: '2026-09-24T20:15:00Z',
      legs: [
        {
          id: 'l1',
          roster_id: 1,
          team_name: 'Philly Special',
          owner_name: 'Blake',
          nfl_team: 'PHI',
          description: 'Saquon Barkley • Over 75.5 Rush Yards (YES)',
          odds_american: '-115',
          odds_decimal: 1.87,
          price_cents: 53,
          status: 'won',
        },
        {
          id: 'l2',
          roster_id: 2,
          team_name: 'Gridiron Clowns',
          owner_name: 'Bob',
          nfl_team: 'KC',
          description: 'Patrick Mahomes • 2+ Passing TDs (YES)',
          odds_american: '-130',
          odds_decimal: 1.77,
          price_cents: 56,
          status: 'won',
        },
      ],
      estimated_odds_american: '+230',
      estimated_multiplier: 3.3,
      actual_multiplier: 3.3,
      estimated_payout: 16.5,
      actual_payout: 16.5,
      actual_odds_american: '+230',
    },
    {
      week: 2,
      season: '2026',
      status: 'lost',
      contains_sgp: false,
      bettor: {
        roster_id: 3,
        team_name: 'Motor City Kitties',
        owner_name: 'Alice',
        points_last_week: 65.2,
      },
      earliest_kickoff: '2026-09-17T20:15:00Z',
      legs: [
        {
          id: 'l3',
          roster_id: 3,
          team_name: 'Motor City Kitties',
          owner_name: 'Alice',
          nfl_team: 'DET',
          description: 'Amon-Ra St. Brown • Anytime TD (YES)',
          odds_american: '+120',
          odds_decimal: 2.2,
          price_cents: 45,
          status: 'lost',
        },
      ],
      estimated_odds_american: '+120',
      estimated_multiplier: 2.2,
      actual_multiplier: 2.2,
      estimated_payout: 11.0,
      actual_payout: 0,
      actual_odds_american: '+120',
    },
    {
      week: 1,
      season: '2026',
      status: 'voided',
      contains_sgp: false,
      bettor: {
        roster_id: 4,
        team_name: 'Buffalo Stampede',
        owner_name: 'Charlie',
        points_last_week: 80.0,
      },
      earliest_kickoff: '2026-09-10T20:15:00Z',
      legs: [
        {
          id: 'l4',
          roster_id: 4,
          team_name: 'Buffalo Stampede',
          owner_name: 'Charlie',
          nfl_team: 'BUF',
          description: 'Josh Allen • 250+ Pass Yards (YES)',
          odds_american: '-110',
          odds_decimal: 1.91,
          price_cents: 52,
          status: 'voided',
        },
      ],
      estimated_odds_american: '-110',
      estimated_multiplier: 1.91,
      estimated_payout: 9.55,
      actual_payout: 5.0,
    },
  ];

  describe('Modal Visibility', () => {
    it('returns null and renders nothing when isOpen is false', () => {
      const html = renderToString(
        <PastSlipsArchive
          isOpen={false}
          onClose={() => {}}
          pastParlays={samplePastParlays}
        />
      );
      expect(html).toBe('');
    });

    it('renders modal dialog when isOpen is true', () => {
      const html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={samplePastParlays}
        />
      );
      expect(html).toContain('Past Kalshi Slips Archive');
      expect(html).toContain('Historical records • Pure archive (no grading)');
    });
  });

  describe('Empty State', () => {
    it('displays empty state message and icon when pastParlays is empty', () => {
      const html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={[]}
        />
      );
      expect(html).toContain('No past parlay slips found');
      expect(html).toContain('Locked slips from previous weeks will appear here.');
      expect(html).not.toContain('Week 3 Parlay');
    });
  });

  describe('Multi-Week Parlay Cards & Badges', () => {
    it('renders week titles for each parlay in the archive', () => {
      const html = cleanText(
        renderToString(
          <PastSlipsArchive
            isOpen={true}
            onClose={() => {}}
            pastParlays={samplePastParlays}
          />
        )
      );
      expect(html).toContain('Week 3 Parlay');
      expect(html).toContain('Week 2 Parlay');
      expect(html).toContain('Week 1 Parlay');
    });

    it('renders correct status badges (won, lost, voided, open, pushed)', () => {
      const html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={samplePastParlays}
        />
      );
      // Won badge: emerald styling
      expect(html).toContain('bg-emerald-500/15 text-emerald-400');
      expect(html).toContain('Won');

      // Lost badge: red styling
      expect(html).toContain('bg-red-500/15 text-red-400');
      expect(html).toContain('Lost');

      // Voided badge: gray styling
      expect(html).toContain('bg-gray-500/15 text-gray-300');
      expect(html).toContain('Voided');
    });

    it('renders open and pushed status badges when provided', () => {
      const openParlay: WeeklyParlay = {
        week: 4,
        season: '2026',
        status: 'open',
        contains_sgp: false,
        bettor: {
          roster_id: 1,
          team_name: 'Philly Special',
          owner_name: 'Blake',
          points_last_week: 90.0,
        },
        earliest_kickoff: '2026-10-01T20:15:00Z',
        legs: [],
        estimated_odds_american: '+150',
        estimated_multiplier: 2.5,
        estimated_payout: 12.5,
        actual_payout: null,
      };

      const pushedParlay: WeeklyParlay = {
        ...openParlay,
        week: 5,
        status: 'pushed',
      };

      const html = renderToString(
        <PastSlipsArchive
          isOpen={true}
          onClose={() => {}}
          pastParlays={[openParlay, pushedParlay]}
        />
      );

      // Open badge: sleeper-accent styling
      expect(html).toContain('bg-sleeper-accent/15 text-sleeper-accent');
      expect(html).toContain('Open');

      // Pushed badge
      expect(html).toContain('Pushed');
    });

    it('renders payout numbers, multipliers, and bettor attribution correctly', () => {
      const html = cleanText(
        renderToString(
          <PastSlipsArchive
            isOpen={true}
            onClose={() => {}}
            pastParlays={samplePastParlays}
          />
        )
      );

      // Bettor attribution
      expect(html).toContain('Bettor: Bob');
      expect(html).toContain('Bettor: Alice');
      expect(html).toContain('Bettor: Charlie');

      // Multipliers
      expect(html).toContain('3.3x');
      expect(html).toContain('2.2x');

      // Payouts
      expect(html).toContain('$16.50');
      expect(html).toContain('$0.00');
      expect(html).toContain('$5.00');
    });

    it('expands first week by default and displays leg details', () => {
      const html = cleanText(
        renderToString(
          <PastSlipsArchive
            isOpen={true}
            onClose={() => {}}
            pastParlays={samplePastParlays}
          />
        )
      );

      // Week 3 is first, so its legs should be visible
      expect(html).toContain('Saquon Barkley • Over 75.5 Rush Yards (YES)');
      expect(html).toContain('Patrick Mahomes • 2+ Passing TDs (YES)');
      expect(html).toContain('Philly Special');
      expect(html).toContain('Gridiron Clowns');
      expect(html).toContain('-115');
      expect(html).toContain('-130');
    });
  });

  describe('Closing Actions', () => {
    it('invokes onClose when clicking the header close button, footer close button, or backdrop', () => {
      const onCloseMock = vi.fn();
      const { element } = renderArchiveElement({
        isOpen: true,
        onClose: onCloseMock,
        pastParlays: samplePastParlays,
      });

      expect(element).not.toBeNull();
      // Backdrop onClick
      expect(element?.props['data-testid']).toBe('archive-backdrop');
      element?.props.onClick?.({} as any);
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Header close button
      const modalContainer = element?.props.children;
      const [header, _content, footer] = modalContainer.props.children;
      const headerCloseButton = header.props.children[1];
      expect(headerCloseButton.props['aria-label']).toBe('Close archive');
      headerCloseButton.props.onClick();
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      // Footer close button
      const footerCloseButton = footer.props.children;
      expect(footerCloseButton.props.children).toBe('Close Archive');
      footerCloseButton.props.onClick();
      expect(onCloseMock).toHaveBeenCalledTimes(3);
    });

    it('stops propagation when clicking inside the modal card container', () => {
      const onCloseMock = vi.fn();
      const { element } = renderArchiveElement({
        isOpen: true,
        onClose: onCloseMock,
        pastParlays: samplePastParlays,
      });

      const modalContainer = element?.props.children;
      const stopPropagationMock = vi.fn();
      modalContainer.props.onClick({ stopPropagation: stopPropagationMock } as any);

      expect(stopPropagationMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).not.toHaveBeenCalled();
    });
  });
});
