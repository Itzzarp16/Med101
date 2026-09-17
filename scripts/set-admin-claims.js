// One-time script: grants {admin: true} custom claim to the admin
// accounts. See docs/set-admin-claims.md for full instructions.
//
// Usage:
//   npm install firebase-admin --no-save
//   node scripts/set-admin-claims.js /path/to/service-account-key.json

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Cloud Shell variant: uses whoever is logged into Cloud Shell (via
// `gcloud auth application-default login`) instead of a downloaded
// service account key file - nothing sensitive to handle or delete
// afterward. See docs/set-admin-claims.md, "Option 2".

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
