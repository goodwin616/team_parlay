# Privacy Policy for Team Parlay

**Effective Date:** October 28, 2026  
**Application URL:** [https://parlay.goodwin.io](https://parlay.goodwin.io)  
**Contact:** [privacy@goodwin.io](mailto:privacy@goodwin.io)  
**Repository:** [https://github.com/goodwin616/team_parlay](https://github.com/goodwin616/team_parlay)

---

## 1. Introduction

Welcome to **Team Parlay** ("we," "our," or "us"). Team Parlay is an open-source, collaborative fantasy sports coordination web application operated at `parlay.goodwin.io`. Team Parlay allows fantasy football league members to collaboratively organize, track, and build weekly community parlay prediction slips based on public fantasy league standings and third-party market data.

We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, process, and disclose information when you visit `parlay.goodwin.io` or interact with our services, in accordance with applicable data protection laws, including:
- The **California Online Privacy Protection Act (CalOPPA)** and California Consumer Privacy Act / California Privacy Rights Act (CCPA/CPRA).
- The European Union **General Data Protection Regulation (GDPR)** and the **UK GDPR**.
- The **Google API Services User Data Policy**, including the Limited Use requirements.

---

## 2. Disclaimer: Informational & Coordination Tool Only

**Team Parlay is strictly an informational and social coordination tool for private fantasy sports leagues.**
- **Not a Bookmaker or Gambling Operator:** Team Parlay is **not** a gambling site, sportsbook, casino, broker, or financial betting exchange.
- **No Real-Money Wagering:** No real money, cash wagers, bank deposits, betting stakes, payouts, or financial transactions are ever accepted, processed, held, or disbursed on or through Team Parlay.
- **Third-Party Platforms:** Any physical or digital bets placed by individuals occur solely on third-party, licensed prediction market platforms (e.g., Kalshi) independent of this application.

---

## 3. Information We Collect

We only collect data necessary to provide and secure the collaborative parlay tracking experience:

### A. Authentication & Identity Data (Google Sign-In)
When you sign in using Google OAuth via Google Identity Platform / Firebase Authentication, we receive:
- **Firebase User ID (UID):** A unique, pseudonymous identifier.
- **Full Name / Display Name:** As provided on your Google profile.
- **Email Address:** Your verified Google email address.
- **Profile Photo URL:** Your Google profile avatar.

*Google API Services Compliance:* Our use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

### B. Fantasy League & Roster Selection Data
To coordinate with your league, we process:
- **Sleeper League ID & Metadata:** Public league name, season, roster settings, and matchup schedules retrieved from Sleeper API.
- **Roster & Team Information:** Roster ID, fantasy team name, and owner username.
- **Roster Claims:** Associations between your authenticated Google Firebase UID and your selected Sleeper roster within a league.

### C. Parlay Picks & Prop Selections
When managers contribute a pick to a weekly slip:
- **Market Identifier:** Kalshi market ticker (e.g., `KXNFLGAME-...`, `KXNFLTD-...`).
- **Pick Description:** Contract details, athlete name, target stat threshold, and prediction side (`yes` or `no`).
- **Odds & Timestamp:** Market probability/price at time of submission and kickoff validation timestamp.

### D. Anti-Tamper, Security & Audit Log Data
To prevent tampering, unauthorized pick alteration, or ballot stuffing:
- **Salted PIN Hashes:** If an optional roster PIN is configured, we store only a cryptographically salted SHA-256 hash (`pin_secret_salt`) alongside a unique salt. Raw PINs are never stored in plaintext.
- **Server-Side Audit Logs:** Actions modifying slips or roster claims record:
  - Action performed (e.g., `submit_leg`, `claim_roster`).
  - Authenticated Firebase UID.
  - Client IP address (for rate limiting and DDoS/abuse mitigation).
  - Client User-Agent string.
  - ISO 8601 UTC timestamp.

### E. Browser Local Storage
Team Parlay does not use third-party advertising cookies or cross-site tracking beacons. We utilize standard browser `localStorage` solely for essential functionality:
- `parlay_odds_format`: User preference for odds display (`american` vs `percentage`).
- `team_parlay_recent_leagues`: List of recently accessed Sleeper league IDs for fast navigation.
- `cached_team_<leagueId>`: User's selected roster ID for seamless re-entry.
- Firebase Auth Session Tokens: Maintained by the Firebase JavaScript SDK to keep you signed in.

---

## 4. How We Use Your Information

We process personal data solely for legitimate, necessary operational purposes:
1. **Authentication & Authorization:** Verifying your identity to ensure only authorized managers submit or edit legs for their designated fantasy team.
2. **Community Parlay Aggregation:** Combining individual leg picks into the weekly league parlay card.
3. **Auditability & Integrity:** Preserving an unalterable audit log to verify that picks were submitted prior to official NFL kickoff deadlines.
4. **Service Reliability:** Monitoring system performance, preventing abusive API requests, and debugging errors.

---

## 5. Strict Non-Sale of Data & Advertising Policy

**We do NOT sell, rent, lease, or monetize your personal information.**
- **No Data Brokers:** We never share or sell personal information, email addresses, or fantasy data to data brokers or third parties.
- **No Behavioral Advertising:** We do not display third-party advertisements or partner with cross-site behavioral tracking networks.
- **No Machine Learning Model Training:** Your data is not sold or used to train public machine learning or artificial intelligence models.

---

## 6. Third-Party Service Providers

We utilize reputable, privacy-conscious third-party infrastructure providers to host and operate the platform:

| Provider | Purpose | Data Processed | Privacy Documentation |
| :--- | :--- | :--- | :--- |
| **Google Cloud Platform / Firebase** | Web hosting (Firebase Hosting), identity authentication, real-time database (Cloud Firestore), serverless compute (Cloud Functions). | Auth profiles, Firestore documents, audit logs, IP addresses. | [Google Cloud Privacy](https://cloud.google.com/terms/cloud-privacy-notice) / [Firebase Privacy](https://firebase.google.com/support/privacy) |
| **Sleeper (Sleeper.app)** | Retrieval of public fantasy football league rosters, matchup scores, and weekly loser/bettor designation via public API. | Public League ID, roster IDs, fantasy team names. | [Sleeper Privacy Policy](https://support.sleeper.com/en/articles/3981882-privacy-policy) |
| **Kalshi Trade API** | Retrieval of real-time prediction market prices, game lines, player props, and official settlement outcomes. | Market contract tickers; no manager PII is sent to Kalshi. | [Kalshi Privacy Policy](https://kalshi.com/regulatory/privacy-policy) |

---

## 7. Legal Bases for Processing (GDPR & UK GDPR)

If you are located in the European Economic Area (EEA) or the United Kingdom, our lawful bases for processing your personal data are:
- **Contractual Necessity (Article 6(1)(b) GDPR):** Processing required to deliver the core functionality of Team Parlay (e.g., authenticating your user account, linking your roster, and publishing your weekly pick).
- **Legitimate Interests (Article 6(1)(f) GDPR):** Securing the application against fraud, abuse, and tampering via audit logging and kickoff deadline validation.
- **Consent (Article 6(1)(a) GDPR):** Where you voluntarily provide permissions or configure optional preferences.

---

## 8. CalOPPA & California Resident Disclosures (CCPA/CPRA)

Under the California Online Privacy Protection Act (CalOPPA) and CCPA/CPRA:
- **Do Not Track Signals:** Because we do not track our users over time and across third-party websites for targeted advertising, Team Parlay does not alter its data collection practices in response to browser "Do Not Track" (DNT) signals.
- **Categories Collected:** Identifiers (Google name, email address, IP address), Internet activity (audit log timestamps and interactions), and fantasy sports roster selections.
- **Right to Know and Delete:** California residents have the right to request access to the personal data we maintain and request its deletion.

---

## 9. Data Retention & Deletion Rights

- **Retention Period:** We retain active league slips and audit logs for historical recordkeeping and settlement archives. Audit logs are retained as long as necessary for platform security and dispute resolution.
- **Data Subject Rights:** Depending on your jurisdiction, you have the right to:
  - Request access to the personal information we hold about you.
  - Request correction of inaccurate information.
  - Request complete deletion of your personal account data, team claims, and audit logs.
  - Object to or restrict processing of your data.
- **How to Submit a Deletion Request:**  
  To delete your account or any personal data associated with your Google email or Firebase UID, contact us at:  
  📧 **[privacy@goodwin.io](mailto:privacy@goodwin.io)** with the subject line `Data Deletion Request`.  
  We will verify your ownership of the email/account and process the deletion from our Firebase Authentication and Cloud Firestore records within thirty (30) days without charge.

---

## 10. Children's Privacy

Team Parlay is intended for fantasy sports participants aged 18 and older (or the age of legal majority in your jurisdiction). We do not knowingly collect or solicit personal information from children under 13 (or under 16 in the EEA/UK). If we learn that a minor has submitted personal data, we will promptly delete that information from our servers.

---

## 11. Changes to This Privacy Policy

We may periodically update this Privacy Policy to reflect application improvements, legal requirements, or security enhancements. When changes are made, the "Effective Date" at the top will be updated. We encourage users to review this page periodically. Continued use of Team Parlay after changes take effect constitutes acceptance of the revised policy.

---

## 12. Contact Information

For any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:

**Team Parlay Privacy Team**  
Email: [privacy@goodwin.io](mailto:privacy@goodwin.io)  
Website: [https://parlay.goodwin.io](https://parlay.goodwin.io)
