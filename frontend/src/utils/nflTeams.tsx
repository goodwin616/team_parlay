import React, { useState } from 'react';

export interface NflTeamMeta {
  abbr: string;
  name: string;
  city: string;
  color: string;
  logoUrl: string;
}

const ESPN_LOGO = (slug: string) =>
  `https://a.espncdn.com/i/teamlogos/nfl/500/${slug.toLowerCase()}.png`;

export const NFL_TEAMS: Record<string, NflTeamMeta> = {
  ARI: { abbr: 'ARI', city: 'Arizona', name: 'Cardinals', color: '#97233F', logoUrl: ESPN_LOGO('ari') },
  ATL: { abbr: 'ATL', city: 'Atlanta', name: 'Falcons', color: '#A71930', logoUrl: ESPN_LOGO('atl') },
  BAL: { abbr: 'BAL', city: 'Baltimore', name: 'Ravens', color: '#241773', logoUrl: ESPN_LOGO('bal') },
  BUF: { abbr: 'BUF', city: 'Buffalo', name: 'Bills', color: '#00338D', logoUrl: ESPN_LOGO('buf') },
  CAR: { abbr: 'CAR', city: 'Carolina', name: 'Panthers', color: '#0085CA', logoUrl: ESPN_LOGO('car') },
  CHI: { abbr: 'CHI', city: 'Chicago', name: 'Bears', color: '#C83803', logoUrl: ESPN_LOGO('chi') },
  CIN: { abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', color: '#FB4F14', logoUrl: ESPN_LOGO('cin') },
  CLE: { abbr: 'CLE', city: 'Cleveland', name: 'Browns', color: '#FF3C00', logoUrl: ESPN_LOGO('cle') },
  DAL: { abbr: 'DAL', city: 'Dallas', name: 'Cowboys', color: '#003594', logoUrl: ESPN_LOGO('dal') },
  DEN: { abbr: 'DEN', city: 'Denver', name: 'Broncos', color: '#FB4F14', logoUrl: ESPN_LOGO('den') },
  DET: { abbr: 'DET', city: 'Detroit', name: 'Lions', color: '#0076B6', logoUrl: ESPN_LOGO('det') },
  GB:  { abbr: 'GB',  city: 'Green Bay', name: 'Packers', color: '#203731', logoUrl: ESPN_LOGO('gb') },
  HOU: { abbr: 'HOU', city: 'Houston', name: 'Texans', color: '#03202F', logoUrl: ESPN_LOGO('hou') },
  IND: { abbr: 'IND', city: 'Indianapolis', name: 'Colts', color: '#002C5F', logoUrl: ESPN_LOGO('ind') },
  JAX: { abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', color: '#006778', logoUrl: ESPN_LOGO('jax') },
  JAC: { abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', color: '#006778', logoUrl: ESPN_LOGO('jax') },
  KC:  { abbr: 'KC',  city: 'Kansas City', name: 'Chiefs', color: '#E31837', logoUrl: ESPN_LOGO('kc') },
  LAC: { abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', color: '#0080C6', logoUrl: ESPN_LOGO('lac') },
  LAR: { abbr: 'LAR', city: 'Los Angeles', name: 'Rams', color: '#003594', logoUrl: ESPN_LOGO('lar') },
  LA:  { abbr: 'LAR', city: 'Los Angeles', name: 'Rams', color: '#003594', logoUrl: ESPN_LOGO('lar') },
  LV:  { abbr: 'LV',  city: 'Las Vegas', name: 'Raiders', color: '#A5ACAF', logoUrl: ESPN_LOGO('lv') },
  MIA: { abbr: 'MIA', city: 'Miami', name: 'Dolphins', color: '#008E97', logoUrl: ESPN_LOGO('mia') },
  MIN: { abbr: 'MIN', city: 'Minnesota', name: 'Vikings', color: '#4F2683', logoUrl: ESPN_LOGO('min') },
  NE:  { abbr: 'NE',  city: 'New England', name: 'Patriots', color: '#002244', logoUrl: ESPN_LOGO('ne') },
  NO:  { abbr: 'NO',  city: 'New Orleans', name: 'Saints', color: '#D3BC8D', logoUrl: ESPN_LOGO('no') },
  NYG: { abbr: 'NYG', city: 'New York', name: 'Giants', color: '#0B2265', logoUrl: ESPN_LOGO('nyg') },
  NYJ: { abbr: 'NYJ', city: 'New York', name: 'Jets', color: '#125740', logoUrl: ESPN_LOGO('nyj') },
  PHI: { abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', color: '#004C54', logoUrl: ESPN_LOGO('phi') },
  PIT: { abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', color: '#FFB612', logoUrl: ESPN_LOGO('pit') },
  SEA: { abbr: 'SEA', city: 'Seattle', name: 'Seahawks', color: '#69BE28', logoUrl: ESPN_LOGO('sea') },
  SF:  { abbr: 'SF',  city: 'San Francisco', name: '49ers', color: '#AA0000', logoUrl: ESPN_LOGO('sf') },
  TB:  { abbr: 'TB',  city: 'Tampa Bay', name: 'Buccaneers', color: '#D50A0A', logoUrl: ESPN_LOGO('tb') },
  TEN: { abbr: 'TEN', city: 'Tennessee', name: 'Titans', color: '#4B92DB', logoUrl: ESPN_LOGO('ten') },
  WAS: { abbr: 'WAS', city: 'Washington', name: 'Commanders', color: '#5A1414', logoUrl: ESPN_LOGO('wsh') },
  WSH: { abbr: 'WAS', city: 'Washington', name: 'Commanders', color: '#5A1414', logoUrl: ESPN_LOGO('wsh') },
};

export function getNflTeamMeta(team?: string): NflTeamMeta {
  const key = (team || '').trim().toUpperCase();
  return (
    NFL_TEAMS[key] || {
      abbr: key || 'NFL',
      city: '',
      name: key || 'NFL',
      color: '#00F5D4',
      logoUrl: '',
    }
  );
}

interface TeamLogoProps {
  team?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const TeamLogo: React.FC<TeamLogoProps> = ({
  team,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const meta = getNflTeamMeta(team);

  const dims =
    size === 'sm'
      ? 'w-5 h-5 text-[9px]'
      : size === 'lg'
      ? 'w-8 h-8 text-xs'
      : 'w-7 h-7 text-[10px]';

  if (!meta.logoUrl || imgError) {
    return (
      <div
        className={`${dims} rounded-full flex items-center justify-center font-black text-white shrink-0 border border-white/20 shadow-sm ${className}`}
        style={{ backgroundColor: meta.color }}
      >
        {meta.abbr.slice(0, 3)}
      </div>
    );
  }

  return (
    <div
      className={`${dims} rounded-full bg-slate-100/95 p-0.5 border border-white/30 flex items-center justify-center shrink-0 shadow-sm overflow-hidden ${className}`}
    >
      <img
        src={meta.logoUrl}
        alt={meta.abbr}
        onError={() => setImgError(true)}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
};
