import { describe, it, expect, vi, type Mock } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { ActivePlayer } from '../types';

function cleanText(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function renderPlayerSearchElement(
  props: React.ComponentProps<typeof PlayerSearchInput>,
  initialStateOverrides: { query?: string; isOpen?: boolean } = {}
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
          ? initialStateOverrides.query ?? (typeof init === 'function' ? init() : init)
          : idx === 1
          ? initialStateOverrides.isOpen ?? (typeof init === 'function' ? init() : init)
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
    const element = PlayerSearchInput(props) as any;
    return {
      element,
      setQuery: stateSetters[0],
      setIsOpen: stateSetters[1],
    };
  } finally {
    internals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

describe('PlayerSearchInput Component', () => {
  const mockPlayers: ActivePlayer[] = [
    { id: 'p1', name: 'Saquon Barkley', team: 'PHI', position: 'RB' },
    { id: 'p2', name: 'Derrick Henry', team: 'BAL', position: 'RB' },
    { id: 'p3', name: 'Patrick Mahomes', team: 'KC', position: 'QB' },
    { id: 'p4', name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR' },
  ];

  describe('Rendering & Placeholders', () => {
    it('renders input field with default placeholder when no player is selected', () => {
      const html = renderToString(
        <PlayerSearchInput
          players={mockPlayers}
          onSelectPlayer={() => {}}
          selectedPlayer={null}
        />
      );

      expect(html).toContain('Search NFL Player');
      expect(html).toContain('id="nfl-player-search"');
      expect(html).toContain('Type player name (e.g., Saquon, Henry, Mahomes)...');
      // Search icon
      expect(html).toContain('lucide-search');
      // Clear button should not be present when query is empty
      expect(html).not.toContain('aria-label="Clear search"');
    });

    it('renders custom placeholder when placeholder prop is provided', () => {
      const html = renderToString(
        <PlayerSearchInput
          players={mockPlayers}
          onSelectPlayer={() => {}}
          selectedPlayer={null}
          placeholder="Search player..."
        />
      );

      expect(html).toContain('placeholder="Search player..."');
    });

    it('renders selected player details in placeholder and header chip', () => {
      const selected: ActivePlayer = mockPlayers[0];
      const html = cleanText(
        renderToString(
          <PlayerSearchInput
            players={mockPlayers}
            onSelectPlayer={() => {}}
            selectedPlayer={selected}
          />
        )
      );

      expect(html).toContain('Saquon Barkley (PHI • RB)');
      expect(html).toContain('placeholder="Saquon Barkley (PHI - RB)"');
    });
  });

  describe('Search Input & onSearchChange Callback', () => {
    it('updates query, opens dropdown, and triggers onSearchChange when typing', () => {
      const onSearchChange = vi.fn();
      const { element, setQuery, setIsOpen } = renderPlayerSearchElement({
        players: mockPlayers,
        onSelectPlayer: () => {},
        selectedPlayer: null,
        onSearchChange,
      });

      const input = element.props.children[1].props.children[0];
      input.props.onChange({ target: { value: 'Saquon' } });

      expect(setQuery).toHaveBeenCalledWith('Saquon');
      expect(setIsOpen).toHaveBeenCalledWith(true);
      expect(onSearchChange).toHaveBeenCalledWith('Saquon');
    });

    it('opens dropdown on focus if query has 2 or more characters', () => {
      const { element, setIsOpen } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer: () => {},
          selectedPlayer: null,
        },
        { query: 'Bark' }
      );

      const input = element.props.children[1].props.children[0];
      input.props.onFocus();

      expect(setIsOpen).toHaveBeenCalledWith(true);
    });

    it('does not open dropdown on focus if query has fewer than 2 characters', () => {
      const { element, setIsOpen } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer: () => {},
          selectedPlayer: null,
        },
        { query: 'S' }
      );

      const input = element.props.children[1].props.children[0];
      input.props.onFocus();

      expect(setIsOpen).not.toHaveBeenCalled();
    });
  });

  describe('Clear ("X") Button', () => {
    it('renders clear button with X icon when search query is non-empty', () => {
      const { element } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer: () => {},
          selectedPlayer: null,
        },
        { query: 'Henry' }
      );

      const clearButton = element.props.children[1].props.children[2];
      expect(clearButton).not.toBeNull();
      expect(clearButton.props['aria-label']).toBe('Clear search');
      expect(clearButton.props.className).toContain('absolute right-3 top-3');
    });

    it('clears input, closes dropdown, and calls onSearchChange("") when clicking clear button', () => {
      const onSearchChange = vi.fn();
      const { element, setQuery, setIsOpen } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer: () => {},
          selectedPlayer: null,
          onSearchChange,
        },
        { query: 'Henry', isOpen: true }
      );

      const clearButton = element.props.children[1].props.children[2];
      clearButton.props.onClick();

      expect(setQuery).toHaveBeenCalledWith('');
      expect(setIsOpen).toHaveBeenCalledWith(false);
      expect(onSearchChange).toHaveBeenCalledWith('');
    });
  });

  describe('Dropdown Selection & Empty Results', () => {
    it('renders filtered matching players in dropdown and handles player selection', () => {
      const onSelectPlayer = vi.fn();
      const onSearchChange = vi.fn();
      const { element, setQuery, setIsOpen } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer,
          selectedPlayer: null,
          onSearchChange,
        },
        { query: 'Mahomes', isOpen: true }
      );

      const dropdownList = element.props.children[2];
      expect(dropdownList).not.toBeNull();
      expect(dropdownList.type).toBe('ul');

      // The filtered list should have Patrick Mahomes
      const items = dropdownList.props.children;
      expect(items).toHaveLength(1);

      // Click on the matching player item
      items[0].props.onClick();

      expect(onSelectPlayer).toHaveBeenCalledWith(mockPlayers[2]);
      expect(setQuery).toHaveBeenCalledWith('');
      expect(setIsOpen).toHaveBeenCalledWith(false);
      expect(onSearchChange).toHaveBeenCalledWith('');
    });

    it('renders empty result message when query does not match any offensive player', () => {
      const { element } = renderPlayerSearchElement(
        {
          players: mockPlayers,
          onSelectPlayer: () => {},
          selectedPlayer: null,
        },
        { query: 'Nonexistent Player', isOpen: true }
      );

      const emptyNotice = element.props.children[3];
      expect(emptyNotice).not.toBeNull();
      const messageText = Array.isArray(emptyNotice.props.children)
        ? emptyNotice.props.children.join('')
        : String(emptyNotice.props.children);
      expect(messageText).toContain(
        'No offensive NFL player found matching "Nonexistent Player".'
      );
    });
  });
});
