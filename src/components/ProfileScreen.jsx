import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { changePassword, claimUsername, fetchMyUsername, updateDisplayName } from '../lib/profile';
import { playTapSound } from '../lib/sounds';

export default function ProfileScreen({ onBack }) {
  const { user } = useAuth();

  const [name, setName] = useState(user?.displayName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyUsername(user.uid).then((u) => {
      if (!cancelled) {
        setCurrentUsername(u);
        setUsername(u || '');
      }
    });
    return () => { cancelled = true; };
  }, [user.uid]);

  async function handleSaveName() {
    playTapSound();
    setNameMsg(null);
    setNameSaving(true);
    try {
      await updateDisplayName(user, name);
      setNameMsg({ type: 'success', text: 'Name updated.' });
    } catch (e) {
      setNameMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSaveUsername() {
    playTapSound();
    setUsernameMsg(null);
    if (!username.trim()) {
      setUsernameMsg({ type: 'error', text: 'Enter a username first.' });
      return;
    }
    setUsernameSaving(true);
    try {
      const saved = await claimUsername(user, username);
      setCurrentUsername(saved);
      setUsernameMsg({ type: 'success', text: 'Username claimed — it\'s yours.' });
    } catch (e) {
      setUsernameMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handleChangePassword() {
    playTapSound();
    setPwMsg(null);
    if (!currentPw || !newPw) {
      setPwMsg({ type: 'error', text: 'Fill in both password fields.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(user, currentPw, newPw);
      setPwMsg({ type: 'success', text: 'Password changed.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      const friendly = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : (e.message || String(e));
      setPwMsg({ type: 'error', text: friendly });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🙍 Your Profile</h1>
        <p className="std-sub">{user.email}</p>
      </div>

      {/* Display name */}
      <div className="glass std-card">
        <label className="auth-label">Display Name</label>
        <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        {nameMsg && <div className={`auth-msg ${nameMsg.type}`} style={{ display: 'block' }}>{nameMsg.text}</div>}
        <button className="btn-glow std-save-btn" onClick={handleSaveName} disabled={nameSaving}>
          {nameSaving ? 'Saving…' : 'Save Name'}
        </button>
      </div>

      {/* Username */}
      <div className="glass std-card" style={{ marginTop: 14 }}>
        <label className="auth-label">Unique Username</label>
        {currentUsername && (
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Currently: <strong style={{ color: 'var(--cyan)' }}>@{currentUsername}</strong></div>
        )}
        <input
          className="auth-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. priya_2027"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <p className="std-note">3–20 characters: letters, numbers, or underscore. No one else can have the same one.</p>
        {usernameMsg && <div className={`auth-msg ${usernameMsg.type}`} style={{ display: 'block' }}>{usernameMsg.text}</div>}
        <button className="btn-glow std-save-btn" onClick={handleSaveUsername} disabled={usernameSaving}>
          {usernameSaving ? 'Checking…' : (currentUsername ? 'Update Username' : 'Claim Username')}
        </button>
      </div>

      {/* Password */}
      <div className="glass std-card" style={{ marginTop: 14 }}>
        <label className="auth-label">Current Password</label>
        <input className="auth-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />

        <label className="auth-label" style={{ marginTop: 10 }}>New Password</label>
        <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" autoComplete="new-password" />

        <label className="auth-label" style={{ marginTop: 10 }}>Confirm New Password</label>
        <input className="auth-input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" />

        {pwMsg && <div className={`auth-msg ${pwMsg.type}`} style={{ display: 'block' }}>{pwMsg.text}</div>}
        <button className="btn-glow std-save-btn" onClick={handleChangePassword} disabled={pwSaving}>
          {pwSaving ? 'Changing…' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
