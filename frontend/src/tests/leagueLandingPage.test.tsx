import { describe, it, expect, vi, type Mock } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LeagueLandingPage } from '../components/LeagueLandingPage';
import { RecentLeague } from '../services/auth';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function renderLandingElement(
  props: React.ComponentProps<typeof LeagueLandingPage>,
  initialStateOverrides: { inputVal?: string; error?: string } = {}
) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const prevDispatcher = internals.ReactCurrentDispatcher.current;
  let hookIndex = 0;
  const stateSetters: Array<Mock> = [];

  internals.ReactCurrentDispatcher.current = {
    useState: (init: any) => {
      const idx = hookIndex++;
      const currentVal =
        idx === 0
          ? initialStateOverrides.inputVal ?? (typeof init === 'function' ? init() : init)
          : idx === 1
          ? initialStateOverrides.error ?? (typeof init === 'function' ? init() : init)
          : typeof init === 'function'
          ? init()
          : init;
      const setter = vi.fn();
      stateSetters.push(setter);
      return [currentVal, setter];
    },
    useRef: (init: any) => ({ current: init }),
    useEffect: vi.fn(),
  };

  try {
    const element = LeagueLandingPage(props) as any;
    return {
      element,
      setInputVal: stateSetters[0],
      setError: stateSetters[1],
    };
  } finally {
    internals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

describe('LeagueLandingPage Component', () => {
  const mockRecentLeagues: RecentLeague[] = [
    { leagueId: '1312915483992809472', name: 'The Taco Bowl Dynasty', lastVisited: '2026-10-27T00:00:00Z' },
    { leagueId: '987654321098765432', name: 'Gridiron Legends', lastVisited: '2026-10-26T00:00:00Z' },
    { leagueId: 'demo', name: 'Demo League', lastVisited: '2026-10-25T00:00:00Z' },
  ];

  describe('Hero Header & Form Elements', () => {
    it('renders hero title, subtitle, and Sleeper league ID input', () => {
      const html = cleanText(
        renderToString(
          <LeagueLandingPage
            onSelectLeague={() => {}}
            recentLeagues={[]}
          />
        )
      );

      expect(html).toContain('Team Parlay Tracker');
      expect(html).toContain(
        'Lowest scorer places the bet. Everyone builds the slip. Track your league’s weekly parlay.'
      );
      expect(html).toContain('Enter Sleeper League ID or URL');
      expect(html).toContain('id="league-id-input"');
      expect(html).toContain('e.g. 1312915483992809472 or sleeper.com/leagues/...');
      expect(html).toContain('Open League Parlay');
    });

    it('renders Explore / Launch Demo League button', () => {
      const html = renderToString(
        <LeagueLandingPage
          onSelectLeague={() => {}}
          recentLeagues={[]}
        />
      );

      expect(html).toContain('Just exploring the UI?');
      expect(html).toContain('Explore Demo League');
      expect(html).toContain('Launch Demo League');
    });
  });

  describe('Form Validation & Submission', () => {
    it('displays validation error and does not call onSelectLeague when submitting empty input', () => {
      const onSelectLeague = vi.fn();
      const { element, setError } = renderLandingElement(
        { onSelectLeague, recentLeagues: [] },
        { inputVal: '' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const preventDefault = vi.fn();
      form.props.onSubmit({ preventDefault });

      expect(preventDefault).toHaveBeenCalled();
      expect(setError).toHaveBeenCalledWith(
        'Please enter a valid Sleeper League ID or Sleeper URL.'
      );
      expect(onSelectLeague).not.toHaveBeenCalled();
    });

    it('displays validation error and does not call onSelectLeague when submitting whitespace-only input', () => {
      const onSelectLeague = vi.fn();
      const { element, setError } = renderLandingElement(
        { onSelectLeague, recentLeagues: [] },
        { inputVal: '    ' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const preventDefault = vi.fn();
      form.props.onSubmit({ preventDefault });

      expect(preventDefault).toHaveBeenCalled();
      expect(setError).toHaveBeenCalledWith(
        'Please enter a valid Sleeper League ID or Sleeper URL.'
      );
      expect(onSelectLeague).not.toHaveBeenCalled();
    });

    it('displays validation error and does not call onSelectLeague for special-character only input', () => {
      const onSelectLeague = vi.fn();
      const { element, setError } = renderLandingElement(
        { onSelectLeague, recentLeagues: [] },
        { inputVal: '   !@#$%^&*()   ' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const preventDefault = vi.fn();
      form.props.onSubmit({ preventDefault });

      expect(preventDefault).toHaveBeenCalled();
      expect(setError).toHaveBeenCalledWith(
        'Please enter a valid Sleeper League ID or Sleeper URL.'
      );
      expect(onSelectLeague).not.toHaveBeenCalled();
    });

    it('calls onSelectLeague with trimmed ID when submitting a valid numeric league ID', () => {
      const onSelectLeague = vi.fn();
      const { element, setError } = renderLandingElement(
        { onSelectLeague, recentLeagues: [] },
        { inputVal: '  1312915483992809472  ' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const preventDefault = vi.fn();
      form.props.onSubmit({ preventDefault });

      expect(preventDefault).toHaveBeenCalled();
      expect(setError).toHaveBeenCalledWith('');
      expect(onSelectLeague).toHaveBeenCalledWith('1312915483992809472');
    });

    it('extracts league ID and calls onSelectLeague when submitting a full Sleeper URL', () => {
      const onSelectLeague = vi.fn();
      const { element, setError } = renderLandingElement(
        { onSelectLeague, recentLeagues: [] },
        { inputVal: 'https://sleeper.com/leagues/1312915483992809472/matchup' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const preventDefault = vi.fn();
      form.props.onSubmit({ preventDefault });

      expect(preventDefault).toHaveBeenCalled();
      expect(setError).toHaveBeenCalledWith('');
      expect(onSelectLeague).toHaveBeenCalledWith('1312915483992809472');
    });

    it('renders error message in markup when error state is present', () => {
      const { element } = renderLandingElement(
        { onSelectLeague: () => {}, recentLeagues: [] },
        { error: 'Please enter a valid Sleeper League ID or Sleeper URL.' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const inputWrapper = form.props.children[0];
      const errorTextElement = inputWrapper.props.children[2];
      expect(errorTextElement).not.toBeNull();
      expect(errorTextElement.props.children).toBe(
        'Please enter a valid Sleeper League ID or Sleeper URL.'
      );
    });

    it('clears error state when user types in the input field', () => {
      const { element, setInputVal, setError } = renderLandingElement(
        { onSelectLeague: () => {}, recentLeagues: [] },
        { inputVal: '', error: 'Existing error' }
      );

      const form = element.props.children.props.children[1].props.children[0];
      const input = form.props.children[0].props.children[1].props.children[1];
      input.props.onChange({ target: { value: '12345' } });

      expect(setInputVal).toHaveBeenCalledWith('12345');
      expect(setError).toHaveBeenCalledWith('');
    });
  });

  describe('Demo League Action', () => {
    it('calls onSelectLeague("demo") when clicking the demo league button', () => {
      const onSelectLeague = vi.fn();
      const { element } = renderLandingElement({
        onSelectLeague,
        recentLeagues: [],
      });

      const demoSection = element.props.children.props.children[1].props.children[1];
      const demoButton = demoSection.props.children[1];
      expect(demoButton.props['aria-label']).toBe('Explore Demo League');
      demoButton.props.onClick();

      expect(onSelectLeague).toHaveBeenCalledWith('demo');
    });
  });

  describe('Recently Visited Leagues', () => {
    it('renders recent league chips for non-demo leagues and filters out demo', () => {
      const html = cleanText(
        renderToString(
          <LeagueLandingPage
            onSelectLeague={() => {}}
            recentLeagues={mockRecentLeagues}
          />
        )
      );

      expect(html).toContain('Recently Visited Leagues');
      expect(html).toContain('The Taco Bowl Dynasty');
      expect(html).toContain('ID: 1312915483992809472');
      expect(html).toContain('Gridiron Legends');
      expect(html).toContain('ID: 987654321098765432');
      // "Demo League" should be filtered out from recent list
      expect(html).not.toContain('ID: demo');
    });

    it('calls onSelectLeague with the clicked league ID when a recent league chip is clicked', () => {
      const onSelectLeague = vi.fn();
      const { element } = renderLandingElement({
        onSelectLeague,
        recentLeagues: mockRecentLeagues,
      });

      const recentSection = element.props.children.props.children[2];
      const chipsList = recentSection.props.children[1].props.children;
      expect(chipsList).toHaveLength(2); // demo filtered out

      const firstChip = chipsList[0];
      firstChip.props.onClick();
      expect(onSelectLeague).toHaveBeenCalledWith('1312915483992809472');

      const secondChip = chipsList[1];
      secondChip.props.onClick();
      expect(onSelectLeague).toHaveBeenCalledWith('987654321098765432');
    });

    it('does not render recently visited leagues section when recentLeagues is empty', () => {
      const html = renderToString(
        <LeagueLandingPage
          onSelectLeague={() => {}}
          recentLeagues={[]}
        />
      );

      expect(html).not.toContain('Recently Visited Leagues');
    });
  });
});
