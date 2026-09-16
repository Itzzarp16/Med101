# Granting admin access (one-time, per account)

Admin status now runs on a Firebase **custom claim** (`{admin: true}`
on the account's ID token) instead of a hardcoded email list. This
needs to be set once per admin account, and needs your own Firebase
Admin credentials to do - it can't be done from client code (that's
the whole point: nothing in the browser can grant itself admin).

## 1. Get a service account key (do this once)

Firebase Console → ⚙️ Project Settings → **Service Accounts** tab →
**Generate new private key**. This downloads a JSON file.

**Treat this file like a master password to your entire Firebase
project** - it can do anything the Admin SDK can do. Don't commit it,
don't paste it anywhere, don't leave it lying around after you're
done. Delete it once the claims below are set (you can always
generate a new one later if needed).

## 2. Run the script

From the repo root, with Node installed:

```bash
npm install firebase-admin --no-save
node scripts/set-admin-claims.js /path/to/your-downloaded-key.json
```

This sets `{admin: true}` on all three admin accounts
(`admin.med101@gmail.com`, `admin1.med101@gmail.com`,
`admin2.med101@gmail.com`). Edit the `ADMIN_EMAILS` array at the top
of `set-admin-claims.js` first if that list ever changes.

## 3. Sign out and back in on each admin account

A custom claim only appears on a token minted *after* it was granted.
Any admin account that's currently signed in anywhere won't see the
new claim (and will lose admin access in the app's UI, and in
firestore.rules/storage.rules) until they sign out and back in again,
or their session naturally refreshes (the SDK does this roughly
hourly on its own).

## 4. Delete the service account key file

Once you've confirmed all three admins can still get into `/admin`
and see admin-only screens, delete the downloaded JSON key from step 1.
