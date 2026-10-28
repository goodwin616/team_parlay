# 🏈 Team Parlay

[![React 18](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.10-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Python 3.14](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Firebase](https://img.shields.io/badge/Firebase-v2_Functions_%26_Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Vitest](https://img.shields.io/badge/Vitest-156_passed-729B1B?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Pytest](https://img.shields.io/badge/Pytest-67_passed-0A9EDC?logo=pytest&logoColor=white)](https://pytest.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> **Collaborative fullstack fantasy football application where the lowest-scoring manager each week funds a \$5 community parlay ticket on Kalshi, built together leg-by-leg by the entire league.**

---

## 🎯 How the Game Works

In **Team Parlay**, weekly fantasy football failure turns into collective sweat equity:

```
+-----------------------------------------------------------------------------------+
|  1. WEEKLY PUNISHMENT                                                             |
|     Sleeper league sync calculates fantasy points across all matchups.           |
|     The manager with the lowest weekly score is crowned the Bettor on the hook.  |
|                                                                                   |
|  2. DEMOCRATIC SLIP BUILDING                                                      |
|     Every manager in the league selects exactly 1 leg:                            |
|       - Game lines: Moneylines, Spreads, or Over/Under Totals                    |
|       - Player props: Passing, Rushing, Receiving Yards, Touchdowns, etc.         |
|                                                                                   |
|  3. THE $5 TICKET                                                                 |
|     The weekly Bettor funds the $5 parlay ticket placed on Kalshi.                |
|                                                                                   |
|  4. EQUAL LEAGUE PAYOUT                                                           |
|     If the community ticket hits, all 12 league managers share the jackpot!       |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Core Features

### 🏈 Automated Sleeper League Sync
- **Matchup & Scoring Ingestion**: Pulls live weekly fantasy scores, matchups, and team rosters directly from the Sleeper API (`/v1/league/<league_id>/*`).
- **Dynamic Bettor Crowning**: Automatically calculates weekly losers and highlights them in the animated **Bettor Banner** with their owner avatar, team name, and score.
- **Roster & Avatar Sync**: Displays authentic league team names and avatars alongside each pick.

### 📈 Live Kalshi Market Integration & 50% Max Prop Rule
- **Real-time NFL Board**: Live game lines (moneylines, point spreads, game totals) and player props (Anytime TD, Passing/Rushing/Receiving Yards, Completions) pulled via Kalshi Trade API v2.
- **50% Max Prop Odds Constraint**: To keep player prop legs exciting with true plus-odds upside, player prop contracts priced higher than **50¢** (implied probability > 50%) are restricted with clear warnings.
- **5-Minute Board Caching**: Server-side in-memory and Firestore TTL caching (`kalshi_cache/nfl_board_meta`) reduces API latency while offering on-demand manual refresh.
- **Multi-Format Odds Display**: Seamlessly toggle between American odds (`+150`, `-110`) and Kalshi probability percentages (`40%`, `52¢`).

### 🔒 Security, Authentication & Audit Integrity
- **Google Sign-In & Team Claims**: Managers log in via Google Authentication. Roster slots are claimed with UID-scoped ownership and mutual confirmation checks.
- **Server-Side Kickoff Validation**: Prevents last-second edits by strictly verifying kickoff timestamps on both client and server (`submit_leg` Cloud Function).
- **Default-Deny Firestore Security Rules**: Granular rules permit read access to authenticated league members while enforcing server-side mutation locks (`allow write: if false;`).
- **GCP Secret Manager Isolation**: Kalshi RSA cryptographic API keys (`KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY_PEM`) are injected securely via Cloud Functions secrets—never exposed to the client.

### 📊 Real-Time Parlay Tracker & 4-Metric Stats Bar
- **Progress Bar**: Live visualization tracking submitted picks against total league roster count.
- **Unified 4-Metric Bar**: Displays **Combo Odds**, **Multiplier** (`15.2x`), **Total Payout** (`$76.00`), and **Payout / Player** (`$6.33`), using clean placeholder states (`—`) before picks are locked.
- **Kickoff Countdown**: Live real-time ticker displaying the countdown to the earliest game kickoff in the parlay slip.
- **Responsive Dark Theme**: Modern dark UI styled with Tailwind CSS, custom scrollbars, and Sleeper-inspired emerald/cyan accents.

### 📜 Past Slips Archive & Resolution Grading
- **Historical Ticket Vault**: Expandable accordion view of all previous weeks' parlay slips.
- **Automated Settlement Grading**: Tracks full slip statuses (`WON`, `LOST`, `OPEN`, `LOCKED`, `PUSHED`, `VOIDED`) and individual leg outcomes (`hit`, `miss`, `pushed`).
- **Audit History**: Transparent tracking of ticket multipliers, historical odds, bettor names, and payouts.

### 💬 One-Click Sleeper Chat Export
- Formatted markdown generator that copies the complete parlay slip—with team names, owners, picks, odds, and payout breakdowns—ready to drop directly into your league's Sleeper chat.

---

## 🏗️ Architecture & Tech Stack

```mermaid
flowchart TD
    subgraph Client ["Frontend (React 18 + Vite + TypeScript)"]
        UI["React UI (Tailwind CSS, Lucide Icons)"]
        AuthCtx["Firebase Auth Context (Google Sign-In)"]
        State["Parlay State & Odds Format Toggle"]
        UI --> AuthCtx
        UI --> State
    end

    subgraph FirebaseGCP ["Firebase & Google Cloud Platform"]
        Hosting["Firebase Hosting (SPA Routing + Security Headers)"]
        Firestore[("Cloud Firestore\n• leagues/{id}/seasons/{yr}\n• users/{uid}\n• audit_log")]
        SecRules["Firestore Security Rules (Default-Deny)"]
        Secrets["GCP Secret Manager\n• KALSHI_API_KEY_ID\n• KALSHI_PRIVATE_KEY_PEM"]
        
        subgraph CloudFunctions ["Python 3.14 Cloud Functions (2nd Gen)"]
            F_Sync["init_or_sync_league()"]
            F_Team["select_team() / get_my_team()"]
            F_Submit["submit_leg() (Server-Side Kickoff Check)"]
            F_Kalshi["get_kalshi_nfl_markets() (5-Min Cache)"]
        end
    end

    subgraph ExternalAPIs ["External Services"]
        SleeperAPI["Sleeper API v1\n(Leagues, Matchups, Rosters)"]
        KalshiAPI["Kalshi Trade API v2\n(NFL Game Lines & Player Props)"]
    end

    UI -->|Read Subscriptions| Firestore
    UI -->|Callable Function Invocation| CloudFunctions
    Firestore --- SecRules
    CloudFunctions -->|Admin SDK Read/Write| Firestore
    CloudFunctions -->|Access Secret Keys| Secrets
    F_Sync -->|HTTP GET| SleeperAPI
    F_Kalshi -->|RSA Signed REST| KalshiAPI
    Hosting -.->|Serves Assets| UI
```

### Component Breakdown

| Layer | Technologies & Tools | Responsibilities |
|---|---|---|
| **Frontend** | React 18, TypeScript 5.5, Vite 5.4, Tailwind CSS 3.4 | Responsive UI, interactive parlay card, pick modal with search, chat export, archive |
| **Icons & Design** | Lucide React, Sleeper Dark Theme, Inter font | Clean aesthetics, responsive mobile & desktop drawer modals |
| **Backend** | Python 3.14, Firebase Functions v2 (`@https_fn.on_call`) | Sleeper sync, team claiming transactions, kickoff time verification, odds computation |
| **Database** | Google Cloud Firestore | Structured hierarchical document model: `leagues -> seasons -> teams/parlays` |
| **Security** | Firebase Auth, GCP Secret Manager, Firestore Rules | OAuth authentication, role checks, immutable audit trail, RSA key isolation |
| **External APIs** | Sleeper REST API, Kalshi Trade API v2 | Roster and matchup statistics, live NFL sports prediction contracts |
| **Testing** | Vitest 4.1, Testing Library, Pytest 9.1 | 156 frontend unit/component tests + 67 backend functions tests |

---

## 📁 Repository Structure

```
team_parlay/
├── LICENSE                     # Apache 2.0 Open Source License
├── README.md                   # Project documentation
├── firebase.json               # Firebase Hosting, Functions, and Emulator configuration
├── firestore.rules             # Production security rules (default-deny)
│
├── frontend/                   # React 18 + Vite frontend
│   ├── index.html              # HTML shell with meta tags & security policies
│   ├── package.json            # Node dependencies and scripts
│   ├── tailwind.config.js      # Custom theme colors and layout extensions
│   ├── vite.config.ts          # Vite build config with Rollup manualChunks
│   └── src/
│       ├── App.tsx             # Main application orchestrator
│       ├── types.ts            # Core TypeScript interfaces & domain models
│       ├── components/
│       │   ├── BettorBanner.tsx       # Weekly loser crown announcement
│       │   ├── ClaimConfirmModal.tsx  # Confirmation modal for claiming roster
│       │   ├── LeagueLandingPage.tsx  # League ID selection and initialization
│       │   ├── LeagueSkeleton.tsx     # Loading skeletons for async state
│       │   ├── ParlayCard.tsx         # Main 4-metric parlay tracker & leg list
│       │   ├── PastSlipsArchive.tsx   # Accordion archive of previous weeks
│       │   ├── PickModal.tsx          # Game lines & prop picker with search
│       │   ├── PlayerSearchInput.tsx  # Instant debounced player search
│       │   ├── SignInGate.tsx         # Google auth gate & prompt
│       │   ├── SleeperChatExport.tsx  # One-click formatted clipboard export
│       │   └── TeamPickerModal.tsx    # Fantasy team selector / profile claim
│       ├── services/
│       │   └── firebase.ts            # Client-side Firebase SDK initialization
│       ├── utils/
│       │   ├── nflTeams.ts            # NFL team metadata, colors, and logos
│       │   └── parlayMath.ts          # Odds conversion (American, Decimal, Cents)
│       └── tests/                     # 16 Vitest test suites (156 passing tests)
│
└── functions/                  # Python 3.14 Firebase Cloud Functions v2
    ├── main.py                 # HTTPS Callable endpoints & transaction handlers
    ├── auth_utils.py           # Identity token decoding, claim logic & audit trail
    ├── sleeper_sync.py         # Sleeper API synchronization engine
    ├── odds_engine.py          # Kalshi API client, RSA auth & kickoff checks
    ├── parlay_math.py          # Parlay probability calculation algorithms
    ├── requirements.txt        # Production Python dependencies
    └── tests/                  # 6 Pytest test suites (67 passing tests)
```

---

## 🛠️ Getting Started & Local Development

### Prerequisites
- **Node.js**: `v20.x` or higher
- **Python**: `3.14.x` (or `3.11+`)
- **Firebase CLI**: `npm install -g firebase-tools`
- **Google Cloud SDK / GCP Project** (optional for local emulators)

---

### 1. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend development server will launch at `http://localhost:5173`.

---

### 2. Backend Functions Setup

```bash
cd functions
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Optional: Environment Variables for Kalshi Integration
Create a `.env` file inside `functions/` if integrating with live Kalshi Trade API:

```env
KALSHI_API_BASE_URL="https://api.elections.kalshi.com/trade-api/v2"
KALSHI_API_KEY_ID="your-kalshi-api-key-id"
KALSHI_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

---

### 3. Running Firebase Local Emulators

You can run the entire Firebase stack locally (Auth, Firestore, Functions, Hosting) without cloud charges:

```bash
firebase emulators:start
```

- **Emulator Suite UI**: `http://localhost:4000`
- **Firestore Emulator**: `http://localhost:8080`
- **Functions Emulator**: `http://localhost:5001`
- **Auth Emulator**: `http://localhost:9099`

---

## 🧪 Testing & Quality Assurance

Both frontend and backend are covered by comprehensive unit, integration, and security test suites.

### Frontend Test Suite (Vitest)
Runs 156 unit and component tests verifying UI rendering, countdown timers, claim mechanics, odds calculations, and max prop odds enforcement:

```bash
cd frontend
npm run test
```

### TypeScript Validation & Production Build
Ensures zero type errors and validates Rollup bundle chunks:

```bash
cd frontend
npx tsc --noEmit
npm run build
```

Bundle output is split into optimized chunks (`vendor-react`, `vendor-firebase`, `vendor-icons`) under `frontend/dist/`.

### Backend Test Suite (Pytest)
Runs 67 test cases validating Sleeper API data parsing, bettor calculation, kickoff deadline enforcement, and Kalshi market parsing:

```bash
functions/venv/bin/pytest functions/tests
```

---

## 🚢 Deployment

### 1. Deploy Firestore Security Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Configure GCP Secrets
Ensure Kalshi secrets are registered in Google Cloud Secret Manager:

```bash
firebase functions:secrets:set KALSHI_API_KEY_ID
firebase functions:secrets:set KALSHI_PRIVATE_KEY_PEM
```

### 3. Deploy Cloud Functions
```bash
firebase deploy --only functions
```

### 4. Deploy Frontend to Firebase Hosting
```bash
cd frontend && npm run build && cd ..
firebase deploy --only hosting
```

---

## 📄 License

This project is open-source software licensed under the **Apache License, Version 2.0**.  
See the [LICENSE](LICENSE) file for terms and conditions.

Copyright (c) 2026 Blake Goodwin.
