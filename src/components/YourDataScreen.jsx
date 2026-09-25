import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { playTapSound } from '../lib/sounds';
import { emailMyDataExport } from '../lib/dataExport';
import LegalFooter from './LegalFooter';

// Split out of SettingsScreen into its own hamburger-menu item - same
// self-service export, just no longer buried inside Settings.
export default function YourDataScreen({ onBack }) {
  const { user } = useAuth();
  const [dataExportBusy, setDataExportBusy] = useState(false);
  const [dataExportError, setDataExportError] = useState(null);
  const [dataExportSentTo, setDataExportSentTo] = useState(null);

  async function handleEmailMyData() {
    playTapSound();
    setDataExportError(null);
    setDataExportSentTo(null);
    setDataExportBusy(true);
    try {
      const { to } = await emailMyDataExport(user);
      setDataExportSentTo(to);
    } catch (e) {
      setDataExportError(e.message || String(e));
    } finally {
      setDataExportBusy(false);
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
        <label className="auth-label">Email My Data Export</label>
        <p className="std-note">
          Get a full copy of everything Med101 stores about your account (profile, quiz history, flagged/wrong questions, payments, etc.) emailed to you as a PDF - usually within a few seconds.
        </p>
        <button className="btn-ghost std-save-btn" onClick={handleEmailMyData} disabled={dataExportBusy}>
          {dataExportBusy ? 'Preparing your export…' : '✉️ Email My Data Export'}
        </button>
        {dataExportError && <div className="auth-msg error" style={{ display: 'block' }}>{dataExportError}</div>}
        {dataExportSentTo && <div className="auth-msg success" style={{ display: 'block' }}>Sent to {dataExportSentTo} - check your inbox in a moment.</div>}
      </div>
    </div>
      <LegalFooter />
    </>
  );
}
