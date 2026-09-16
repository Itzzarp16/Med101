// One-time script: grants {admin: true} custom claim to the admin
// accounts. See docs/set-admin-claims.md for full instructions.
//
// Usage:
//   npm install firebase-admin --no-save
//   node scripts/set-admin-claims.js /path/to/service-account-key.json

const admin = require('firebase-admin');

const ADMIN_EMAILS = [
  'admin.med101@gmail.com',
  'admin1.med101@gmail.com',
  'admin2.med101@gmail.com',
];

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Usage: node scripts/set-admin-claims.js /path/to/service-account-key.json');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(require('path').resolve(keyPath))),
});

async function main() {
  for (const email of ADMIN_EMAILS) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().setCustomUserClaims(user.uid, { admin: true });
      console.log(`✓ ${email} (${user.uid}) - admin claim set`);
    } catch (e) {
      console.error(`✗ ${email} - failed: ${e.message}`);
    }
  }
  console.log('\nDone. Each admin needs to sign out/in for this to take effect - see step 3 in docs/set-admin-claims.md.');
}

main().then(() => process.exit(0));
