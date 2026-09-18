// One-time script: grants {admin: true} custom claim to the admin
// accounts. See docs/set-admin-claims.md for full instructions on
// both ways to run this (Cloud Shell - no key file needed - or
// locally with a downloaded service account key).
//
// Usage (from Cloud Shell, or locally with gcloud application-default
// credentials already set up):
//   npm install firebase-admin --no-save
//   node scripts/set-admin-claims.js
//
// Usage (locally, with a downloaded service account key - see
// docs/set-admin-claims.md "Option 2"):
//   npm install firebase-admin --no-save
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/set-admin-claims.js

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const ADMIN_EMAILS = [
  'admin.med101@gmail.com',
  'admin1.med101@gmail.com',
  'admin2.med101@gmail.com',
];

initializeApp({ credential: applicationDefault() });

async function main() {
  for (const email of ADMIN_EMAILS) {
    try {
      const user = await getAuth().getUserByEmail(email);
      await getAuth().setCustomUserClaims(user.uid, { admin: true });
      console.log(`✓ ${email} (${user.uid}) - admin claim set`);
    } catch (e) {
      console.error(`✗ ${email} - failed: ${e.message}`);
    }
  }
  console.log('\nDone. Each admin needs to sign out/in for this to take effect.');
}

main().then(() => process.exit(0));
