import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import { buildUserDataExportPdf } from '../lib/dataExport';
import LegalFooter from './LegalFooter';

// Split out of SettingsScreen into its own hamburger-menu item - same
// self-service export, just no longer buried inside Settings.
export default function YourDataScreen({ onBack }) {
  const { user } = useAuth();
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  async function handleDownload() {
    playTapSound();
    setDownloadError(null);
    setDownloadBusy(true);
    try {
      const doc = await buildUserDataExportPdf(user.uid);
      const safeName = (user.displayName || user.email || user.uid).replace(/[^a-zA-Z0-9._-]/g, '_');
      doc.save(`med101-data-export-${safeName}.pdf`);
    } catch (e) {
      setDownloadError(e.message || String(e));
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <>
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">📄 Your Data</h1>
      </div>

      <div className="glass std-card">
        <label className="auth-label">Download My Data Export</label>
        <p className="std-note">
          Get a full copy of everything Med101 stores about your account (profile, quiz history, flagged/wrong questions, payments, etc.) as a PDF, saved straight to this device.
        </p>
        <button className="btn-ghost std-save-btn" onClick={handleDownload} disabled={downloadBusy}>
          {downloadBusy ? 'Preparing your export…' : '📥 Download My Data Export'}
        </button>
        {downloadError && <div className="auth-msg error" style={{ display: 'block' }}>{downloadError}</div>}
      </div>
    </div>
      <LegalFooter />
    </>
  );
}
