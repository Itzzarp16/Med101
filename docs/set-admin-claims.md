# Granting admin access (one-time, per account)

Admin status now runs on a Firebase **custom claim** (`{admin: true}`
on the account's ID token) instead of a hardcoded email list. This
needs to be set once per admin account, and needs your own Firebase
Admin credentials to do - it can't be done from client code (that's
the whole point: nothing in the browser can grant itself admin).

There are two ways to run the script. Option 1 (Cloud Shell) needs no
downloads and nothing sensitive to handle afterward - use that unless
you already have Node set up locally and prefer Option 2.

## Option 1: Google Cloud Shell (recommended - no key file at all)

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   make sure the `med101-1` project is selected (top left), and click
   the **Cloud Shell** icon (`>_`) in the top-right toolbar.
2. Clone the repo (or upload just `scripts/set-admin-claims.js` via
   Cloud Shell's upload button - either works):
   ```bash
   git clone https://github.com/Itzzarp16/Med101.git
   cd Med101
   git checkout react-rebuild
   ```
3. Install the one dependency and run it:
   ```bash
   npm install firebase-admin --no-save
   node scripts/set-admin-claims.js
   ```
   Cloud Shell already runs as your logged-in Google account, which
   `applicationDefault()` picks up automatically - no key file, no
   `GOOGLE_APPLICATION_CREDENTIALS`, nothing to clean up afterward.
   Your Google account needs Owner or Editor on the Firebase project
   for this to have permission to set custom claims.

## Option 2: Locally, with a downloaded service account key

1. Firebase Console → ⚙️ Project Settings → **Service Accounts** tab →
   **Generate new private key**. This downloads a JSON file.

   **Treat this file like a master password to your entire Firebase
   project** - it can do anything the Admin SDK can do. Don't commit
   it, don't paste it anywhere, don't leave it lying around after
   you're done.

2. From the repo root, with Node installed:
   ```bash
   npm install firebase-admin --no-save
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-downloaded-key.json node scripts/set-admin-claims.js
   ```
3. Delete the downloaded JSON key file once step 3 below is confirmed.

## 3. Sign out and back in on each admin account

Either option sets `{admin: true}` on all three admin accounts
(`admin.med101@gmail.com`, `admin1.med101@gmail.com`,
`admin2.med101@gmail.com`). Edit the `ADMIN_EMAILS` array at the top
of `set-admin-claims.js` first if that list ever changes.

A custom claim only appears on a token minted *after* it was granted.
Any admin account that's currently signed in anywhere won't see the
new claim (and will lose admin access in the app's UI, and in
firestore.rules/storage.rules) until they sign out and back in again,
or their session naturally refreshes (the SDK does this roughly
hourly on its own).
