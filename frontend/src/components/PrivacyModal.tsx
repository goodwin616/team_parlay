import React, { useEffect } from 'react';
import {
  ShieldCheck,
  X,
  Lock,
  EyeOff,
  Database,
  Trash2,
  ExternalLink,
  FileCheck,
  AlertCircle,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<Props> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="privacy-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-fadeIn"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-sleeper-card border border-sleeper-border rounded-2xl w-full max-w-lg sm:max-w-xl lg:max-w-2xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-sleeper-border bg-sleeper-card shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="privacy-modal-title" className="text-base font-bold text-white leading-tight">
                Privacy Policy & Disclosures
              </h3>
              <p className="text-[11px] text-sleeper-muted">
                Effective: October 2026 • parlay.goodwin.io
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close privacy policy"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-gray-300 leading-relaxed">
          {/* Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-white text-[11px] uppercase tracking-wider">
                Informational Coordination Tool Only
              </p>
              <p className="text-[11px] leading-normal text-amber-200/90">
                Team Parlay is not a bookmaker, gambling operator, casino, or broker. No real-money
                wagers, deposits, or financial payouts occur on this platform. We purely coordinate
                fantasy picks for private leagues.
              </p>
            </div>
          </div>

          {/* Key Privacy Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border space-y-1">
              <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-xs">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Zero Data Selling</span>
              </div>
              <p className="text-[11px] text-gray-400">
                We never sell, rent, or monetize your personal information or pick data to data brokers or advertisers.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border space-y-1">
              <div className="flex items-center space-x-1.5 text-sleeper-accent font-bold text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Google OAuth Sign-In</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Secured via Google Identity Platform. We only request basic identity scopes (name, email, profile photo, UID).
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border space-y-1">
              <div className="flex items-center space-x-1.5 text-blue-400 font-bold text-xs">
                <Database className="w-3.5 h-3.5" />
                <span>Anti-Tamper Audit Logs</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Salted SHA-256 PIN hashes and server-side audit logs (IP, User-Agent, timestamp) protect pick integrity.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sleeper-dark border border-sleeper-border space-y-1">
              <div className="flex items-center space-x-1.5 text-purple-400 font-bold text-xs">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Data Subject Rights</span>
              </div>
              <p className="text-[11px] text-gray-400">
                CalOPPA, GDPR, and UK GDPR compliant. Request immediate data and account deletion at privacy@goodwin.io.
              </p>
            </div>
          </div>

          {/* Structured Policy Sections */}
          <div className="space-y-4 pt-1">
            {/* Section 1 */}
            <div className="space-y-1.5">
              <h4 className="text-white font-bold text-xs flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                <span>1. Information We Collect</span>
              </h4>
              <ul className="list-disc list-inside space-y-1 pl-1 text-gray-400 text-[11px]">
                <li>
                  <strong className="text-gray-200">Authentication Profile:</strong> Google account name, verified email, profile photo URL, and Firebase UID.
                </li>
                <li>
                  <strong className="text-gray-200">Fantasy League Data:</strong> Sleeper league ID, roster ID, fantasy team name, and owner usernames via Sleeper API.
                </li>
                <li>
                  <strong className="text-gray-200">Parlay Picks:</strong> Submitted Kalshi market tickers, game lines, player props, predicted outcomes, and submission timestamps.
                </li>
                <li>
                  <strong className="text-gray-200">Security & Tamper Prevention:</strong> Salted SHA-256 PIN hashes (<code className="text-gray-300">pin_secret_salt</code>) and server-side audit logs capturing action, UID, IP address, and User-Agent.
                </li>
                <li>
                  <strong className="text-gray-200">Browser Storage:</strong> Client <code className="text-gray-300">localStorage</code> used strictly for auth state persistence, odds display preferences (<code className="text-gray-300">parlay_odds_format</code>), and recent leagues.
                </li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="space-y-1.5">
              <h4 className="text-white font-bold text-xs flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                <span>2. Third-Party Services & Integrations</span>
              </h4>
              <p className="text-[11px] text-gray-400">
                Team Parlay integrates with trusted external services strictly to provide core features:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-gray-400 text-[11px]">
                <li>
                  <strong className="text-gray-200">Google Cloud & Firebase:</strong> Provides Google Identity Platform authentication, Cloud Firestore database storage, and Cloud Functions compute.
                </li>
                <li>
                  <strong className="text-gray-200">Sleeper API:</strong> Reads public league rosters, matchup scores, and identifies weekly low-scoring bettor teams.
                </li>
                <li>
                  <strong className="text-gray-200">Kalshi Trade API:</strong> Ingests live prediction market odds, contracts, and settlement statuses. No user PII is sent to Kalshi.
                </li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="space-y-1.5">
              <h4 className="text-white font-bold text-xs flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                <span>3. Google API Services User Data Policy</span>
              </h4>
              <p className="text-[11px] text-gray-400">
                Team Parlay’s use of information received from Google APIs strictly adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sleeper-accent underline hover:brightness-125 inline-flex items-center space-x-0.5"
                >
                  <span>Google API Services User Data Policy</span>
                  <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                </a>
                , including the Limited Use requirements. We do not use Google user data for advertising or transfer it to data brokers.
              </p>
            </div>

            {/* Section 4 */}
            <div className="space-y-1.5">
              <h4 className="text-white font-bold text-xs flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-sleeper-accent" />
                <span>4. Data Subject Rights & Deletion Requests</span>
              </h4>
              <p className="text-[11px] text-gray-400">
                Under CalOPPA, GDPR, and UK GDPR, you have the right to access, rectify, or permanently delete your account and personal records. To request deletion of your account, email, roster claims, or audit logs, send an email to:
              </p>
              <div className="p-2.5 rounded-lg bg-sleeper-dark border border-sleeper-border flex items-center justify-between">
                <div className="font-mono text-xs text-sleeper-accent font-bold">
                  privacy@goodwin.io
                </div>
                <a
                  href="mailto:privacy@goodwin.io?subject=Data%20Deletion%20Request"
                  className="px-2.5 py-1 rounded bg-sleeper-accent/15 text-sleeper-accent hover:bg-sleeper-accent/25 font-bold text-[11px] transition"
                >
                  Request Deletion
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-sleeper-border bg-sleeper-card flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-400">
            Questions? Contact{' '}
            <a
              href="mailto:privacy@goodwin.io"
              className="text-sleeper-accent hover:underline font-semibold"
            >
              privacy@goodwin.io
            </a>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
