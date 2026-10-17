# FAU BD Cricketers: going live, step by step

This guide takes the app from your laptop to a live website at
`https://YOUR-GITHUB-NAME.github.io/fau-bd-cricketers/`, locked down so only
you (admin) and the shared scorer login can change anything.

**Time:** about 45–60 minutes. **Cost:** free. You never enter a credit card.

**What you need:** your laptop, your phone (for 2-step verification), and this
project folder: `Desktop/Claude/fau-bd-cricketers`.

> **Only Firebase is needed.** Supabase is not used: its free projects pause
> after a week without activity, and gaps between matches could take the app
> offline. Firebase's free plan (called **Spark**) has no pausing and can't
> charge you.

Menu names below are as of October 2026. If a label is slightly different on
your screen, look for the closest match.

---

## Part 1: Secure your accounts first (10 min)

Most real-world break-ins come through a stolen password, not the code. Do this first.

1. **Google account** (the one you'll use for Firebase): go to
   <https://myaccount.google.com/security> and turn on **2-Step Verification**.
   A phone prompt or an authenticator app is better than SMS.
2. **GitHub account:** create one at <https://github.com/signup> if you don't
   have one. Then go to **Settings → Password and authentication** and enable
   **Two-factor authentication**. Save the recovery codes somewhere safe.
3. Use a **password manager**: Apple Passwords (built into your Mac and
   iPhone), 1Password or Bitwarden. Every password below should be unique.

---

## Part 2: Create the Firebase project (5 min)

1. Open <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name: `fau-bd-cricketers`. Accept the terms and click **Continue**.
4. When asked about **Google Analytics**, switch it **off**. The app doesn't
   need tracking, and it keeps third-party code out. Click **Create project**.
5. When it's ready, click **Continue**. Bottom-left of the console should say
   **Spark** (the free plan). **Never click "Upgrade".** On Spark, Google can't
   bill you. The worst case is that the app pauses until midnight Pacific time
   if a daily limit is ever reached.
6. **Project settings (gear icon) → Users and permissions:** make sure you are
   the only member. Don't add anyone.

---

## Part 3: Create the database (3 min)

1. Left menu: **Build → Firestore Database → Create database**.
2. If asked to choose an **edition**, pick **Standard**.
3. **Location:** choose **`nam5 (United States)`**, or `us-east1` if nam5 isn't
   offered. This can't be changed later.
4. **Secure rules:** choose **Start in production mode**. This blocks
   everything until you publish the real rules in Part 7. Never pick "test mode".
5. Click **Create**.

---

## Part 4: Set up the two logins (10 min)

### 4a. Turn on email/password sign-in
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → switch on the first toggle
   (**Email/Password**). Leave **Email link (passwordless sign-in)** off.
   Click **Save**.

### 4b. Create the two accounts
Go to the **Users** tab and click **Add user** twice:

| Account | Email | Password |
|---|---|---|
| **Admin (you only)** | your own email | 16+ characters, unique, saved in your password manager. Never share it. |
| **Shared scorer** | **use a Gmail "+" address you own**, e.g. `yourname+faubdscorer@gmail.com` | 4 random words, e.g. `mango-wicket-river-74` |

> Why the "+" address for the scorer: Gmail delivers `yourname+anything@gmail.com`
> to your normal inbox. If the scorer password ever needs resetting, the reset
> email reaches you. A made-up address can't receive it.

After adding each user, the table shows a **User UID** (a long code like
`kX9...3fQ`). **Copy both UIDs** into a note, labelled *admin* and *scorer*.

### 4c. Block anyone else from creating accounts (important)
Firebase's web key is public by design, so without this step a stranger could
create their own account. (They still couldn't change anything, because the
rules only trust your two UIDs, but there's no reason to allow it.)

1. **Authentication → Settings** tab → **User actions**.
2. **Untick "Enable create (sign-up)"** and **untick "Enable delete"**.
3. If you see **"Email enumeration protection"**, make sure it is **ticked**.
4. Click **Save**.

### 4d. Allow your website's address
1. **Authentication → Settings → Authorized domains → Add domain**.
2. Add `YOUR-GITHUB-NAME.github.io` (your GitHub username, all lowercase).
   `localhost` should already be listed. Keep it for testing.

---

## Part 5: Register the web app and copy its config (3 min)

1. **Gear icon → Project settings → General**, scroll to **Your apps**.
2. Click the **Web** icon (`</>`). Nickname: `FAU BD Cricketers`.
   **Don't** tick "Also set up Firebase Hosting". Click **Register app**.
3. You'll see a code block containing `const firebaseConfig = { apiKey: ..., ... }`.
   **Copy the whole `firebaseConfig` object.** Click **Continue to console**.

> This config is **not a secret**. Every Firebase website ships it to every
> visitor's browser. What protects your data is Part 4c and the rules in Part 7.

---

## Part 6: Put your values into the code (2 min)

**Easiest:** send Claude the `firebaseConfig` block and the two UIDs (never
the passwords). Claude fills in all three files and runs the safety tests.

**Or yourself:**
1. `src/config/firebaseConfig.ts`: replace each `PASTE_...` value with yours.
2. `src/config/roles.ts`: replace `REPLACE_WITH_ADMIN_UID` and
   `REPLACE_WITH_SCORER_UID` with the two UIDs.
3. `firestore.rules`: replace the same two placeholders with the same two UIDs.

A test (`src/config/roles.test.ts`) refuses to deploy if the app and the rules
disagree about who is admin.

---

## Part 7: Publish the security rules (3 min)

These rules are the real lock. They run on Google's servers, so nobody can
get around them by tampering with the app.

1. Firebase console → **Firestore Database → Rules** tab.
2. Delete everything in the editor. Paste the **entire contents** of
   `firestore.rules` from the project folder, with your UIDs filled in (Part 6).
3. Click **Publish**.
4. **Test it:** click **Rules Playground** (or **Develop & test**). Set
   **Simulation type: create**, **Location: `players/test`**, leave
   **Authenticated** off, and click **Run**. It must say **denied**. Then try
   **Simulation type: get** on the same location. It must say **allowed**,
   because anyone may watch.

---

## Part 8: Put the code on GitHub (10 min)

The free GitHub plan only publishes websites from **public** repositories.
That's fine: the code contains no secrets, and everything is protected by the
rules (Part 7) and the logins (Part 4).

1. Install **GitHub Desktop** from <https://desktop.github.com> and sign in
   with your GitHub account.
2. **File → Add Local Repository →** choose `Desktop/Claude/fau-bd-cricketers`.
   It will say the folder isn't a repository yet. Click **create a repository**,
   keep the name `fau-bd-cricketers`, leave **README**, **Git ignore** and
   **License** unticked or set to *None* (the project already has its own
   `.gitignore`), and click **Create Repository**.
3. Click **Publish repository**. **Untick "Keep this code private"**, then
   click **Publish Repository**.

Or tell Claude "push it to GitHub" once you're signed in, and Claude does the
git steps.

---

## Part 9: Turn on the website (3 min)

1. On github.com, open your `fau-bd-cricketers` repository → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab. The workflow **"Test and deploy to GitHub Pages"**
   runs automatically on each push. Click **Run workflow** if it hasn't started.
   It installs exact package versions, runs the security audit and all tests,
   then publishes. If anything fails, nothing is published.
4. When it shows a green tick, open
   `https://YOUR-GITHUB-NAME.github.io/fau-bd-cricketers/`.
   The **setup check** page should show **four green ticks**. The fourth one
   proves a logged-out visitor can't write to your database.

---

## Part 10: Lock down the GitHub repository (5 min)

Repository **Settings** on github.com:

1. **Collaborators:** add nobody. You are the only person who can change the code.
2. **Rules → Rulesets → New ruleset → New branch ruleset**
   - Name: `protect main` · Enforcement status: **Active**
   - Target branches: **Add target → Include default branch**
   - Tick **Restrict deletions** and **Block force pushes** → **Create**
3. **Actions → General**
   - Actions permissions: **Allow YOUR-NAME, and select non-YOUR-NAME, actions
     and reusable workflows** → tick **Allow actions created by GitHub**.
   - Fork pull request workflows: **Require approval for all external contributors**.
   - Workflow permissions: **Read repository contents and packages permissions**.
   - **Save**.
4. **Code security** (or **Advanced Security**): turn on **Dependabot alerts**,
   **Dependabot security updates**, **Secret scanning** and **Push protection**.
5. **Environments → github-pages:** under deployment branches, make sure only
   **main** can deploy.

Each week Dependabot may open pull requests to update packages. Don't merge
them blindly: ask Claude to review them, or merge only those whose checks are green.

---

## Part 11 (optional, recommended): Restrict the Firebase key to your site (5 min)

This stops other websites from using your Firebase key.

1. Open <https://console.cloud.google.com>, then pick the `fau-bd-cricketers`
   project at the top.
2. **APIs & Services → Credentials →** click **Browser key (auto created by Firebase)**.
3. **Application restrictions: Websites.** Add:
   - `https://YOUR-GITHUB-NAME.github.io/*`
   - `http://localhost:5173/*`
   - `http://localhost:4173/*`
4. **API restrictions: Restrict key.** Tick **Cloud Firestore API**,
   **Identity Toolkit API** and **Token Service API** → **Save**.
5. Wait 5 minutes, then reload the website's setup check. If a tick turns red,
   go back and set **API restrictions** to **Don't restrict key**, keeping the
   website restriction. Tell Claude which tick failed.

---

## Part 12: First use (10 min)

1. Open `https://ahalimfau.github.io/fau-bd-cricketers/` and tap **Sign in**
   (top right). Sign in with the **admin** login.
2. **Players → + Add**: add every player with a name and, if you like, a
   photo. Tap a player later to rename them, change the photo, or hide them
   from the team picker (for someone who left).
3. **Settings** (gear icon on Home): rename or switch off any title, set the
   default overs and the Shahin weights, then **Save settings**.
4. Share the **scorer** login in your private group chat. Scorers sign in the
   same way and see **New match** on Home.
5. Put the app on each phone's home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).

### Scoring in 30 seconds
- **New match** → tap players to put them in team A or B (or **Random split**
  / **Captains pick**) → **Next** → overs, toss, openers, bowler → **Start match**.
- One tap per ball: **0 1 2 3 4 6**. **WD / NB / BYE / LB** open a small sheet.
  **OUT** asks how, who caught it, and who comes in next.
- **UNDO** removes the last entry, as many times as you like. To fix an older
  ball, tap it in "This over", or use **⋯ → Fix any entry**.
- After a 4 or 6, tap **Leaked?** on the bar to blame a fielder. **Fielding
  oops** logs dropped catches and misfields at any time.
- Tap a batter's name to swap strike. **⋯** also has mid-over bowler change,
  retire a batter, and end the innings early.
- When the match ends, tap **Finish match**. That locks it and hands out the
  titles. Only the admin can reopen or delete a finished match (on its match page).
- Anyone can watch live from the link, without signing in, and share the score,
  scorecard or Hall of Shame as a picture.

---

## Using it safely, week to week

- **Share the scorer login** only in your private group chat. Never share the
  admin login with anyone.
- **Change the scorer password each season,** or whenever someone leaves.
  In the Firebase console, go to **Authentication → Users →** the scorer row's
  **⋮ menu → Reset password**. The email goes to your Gmail thanks to the "+"
  address.
- **Shut the scorer out instantly:** same menu → **Disable account**. Phones
  already signed in lose access within about an hour.
- **Mistakes in a live match:** any scorer can fix them (UNDO or Edit ball).
  Once a match is marked finished, only you can change it.
- **If your admin password ever leaks:** change your Google password, then
  change the admin user's password in Firebase Authentication. Check
  Authentication → Users for any account you don't recognise (there shouldn't
  be any, because sign-up is off).

---

## What protects the app (and what can't be promised)

| Threat | Protection |
|---|---|
| Someone changes scores, players or settings | Server-side Firestore rules only accept the two UIDs. Scorers can't touch players, settings or finished matches. Every write must match a strict shape. |
| Someone creates their own account | Sign-up is disabled (Part 4c), and the rules ignore any other account anyway. |
| Malicious data sneaks into the database | The rules check every field's type and size. The app also rebuilds every record field by field and drops anything unexpected (`src/data/validate.ts`, 62 tests). |
| Booby-trapped photo (hidden script, malware payload, GPS location) | Photos are decoded and redrawn as plain pixels, then saved as small WebP/JPEG only. SVG and outside links are rejected by both the app and the rules. |
| Script injection (XSS) | React displays names as plain text. The Content Security Policy forbids inline scripts, `eval`, third-party scripts, iframes and plugins. Fonts are self-hosted, so the site loads nothing from other servers. |
| Another site embedding yours (clickjacking) | The app refuses to run inside a frame. |
| A poisoned npm package | Exact versions are locked, install scripts never run (`.npmrc`), `npm audit` blocks deploys on high-severity issues, and Dependabot raises alerts. |
| A hijacked GitHub Action | Every action is pinned to an exact commit, and the workflow runs with the least permissions. |
| Someone pushes bad code to your repo | 2FA on GitHub, no collaborators, branch ruleset, approval required for outside pull requests. |
| A surprise bill | The Spark plan can't bill you. |

### Testing the security rules (for developers)
`src/data/rules.emulator.test.ts` checks `firestore.rules` against the
official Firebase emulator, using the exact documents the app writes. It
needs Java 21 and `firebase-tools`, so it is skipped in the normal test run:

```
firebase emulators:start --only firestore,auth --project demo-fau-bd
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run src/data/rules.emulator.test.ts
```

`VITE_EMULATOR=1 npm run dev` runs the whole app against the same emulators.

**What no app can promise:** if someone gets your **admin password**, or your
Google or GitHub account, they get what you have. That's why Part 1 matters
most. A flood of fake traffic could also use up the free daily quota and pause
the app until midnight Pacific time. For a 30-person club that's unlikely, and
Firebase **App Check** can be added later if it ever happens.
