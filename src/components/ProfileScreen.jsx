import { useEffect, useRef, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { changePassword, claimUsername, fetchMyUsername, updateDisplayName, uploadProfilePhoto } from '../lib/profile';
import { playTapSound } from '../lib/sounds';
import './ProfileScreen.css';

export default function ProfileScreen({ onBack }) {
  const { user, profile } = useAuth();

  const [name, setName] = useState(user?.displayName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);
  const [editingName, setEditingName] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState(null);
  const [editingUsername, setEditingUsername] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
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
      setEditingName(false);
    } catch (e) {
      setNameMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePhotoPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    playTapSound();
    setPhotoMsg(null);
    setPhotoUploading(true);
    try {
      await uploadProfilePhoto(user, file);
      setPhotoMsg({ type: 'success', text: 'Profile photo updated.' });
    } catch (e) {
      setPhotoMsg({ type: 'error', text: e.message || String(e) });
    } finally {
      setPhotoUploading(false);
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
      setUsernameMsg({ type: 'success', text: 'Username claimed. It\'s yours.' });
      setEditingUsername(false);
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

  async function handleForgotPassword() {
    playTapSound();
    setPwMsg(null);
    if (!user?.email) return;
    try {
      // Same reasoning as AuthScreen's handleForgotPassword: points the
      // reset link at our own /reset-password page via actionCodeSettings
      // rather than Firebase Console's broken "Customize action URL" toggle.
      await sendPasswordResetEmail(auth, user.email, {
        url: 'https://med101.space/reset-password',
        handleCodeInApp: true,
      });
      setPwMsg({ type: 'success', text: `Password reset email sent to ${user.email}. Check your inbox.` });
    } catch (e) {
      setPwMsg({ type: 'error', text: e.message || String(e) });
    }
  }

  const initial = (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase();

  return (
    <div className="std-screen profile-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="profile-hero">
        <div className="profile-avatar-wrap">
          <button
            type="button"
            onClick={() => { playTapSound(); fileInputRef.current?.click(); }}
            disabled={photoUploading}
            title="Change profile photo"
            className="profile-avatar-btn"
            style={profile?.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}
          >
            {!profile?.photoURL && initial}
          </button>
          <button
            type="button"
            className="profile-avatar-edit-badge"
            onClick={() => { playTapSound(); fileInputRef.current?.click(); }}
            disabled={photoUploading}
            title="Change profile photo"
          >
            {photoUploading ? (
              <span className="profile-avatar-spinner" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoPicked}
            style={{ display: 'none' }}
          />
        </div>

        <h1 className="profile-name">{name || 'Your Name'}</h1>
        {currentUsername && <div className="profile-handle">@{currentUsername}</div>}
        <div className="profile-email">{user.email}</div>

        {photoMsg && <div className={`auth-msg ${photoMsg.type} profile-hero-msg`} style={{ display: 'block' }}>{photoMsg.text}</div>}

        <div className="profile-stat-row">
          <div className="profile-stat">
            <span className="profile-stat-value">🔥 {profile?.streakCount || 0}</span>
            <span className="profile-stat-label">Current Streak</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="profile-stat-value">{profile?.longestStreak || 0}</span>
            <span className="profile-stat-label">Longest Streak</span>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Account</div>
        <div className="profile-list">

          {/* Display name */}
          <div className="profile-row">
            {!editingName ? (
              <div className="profile-row-summary">
                <div className="profile-row-main">
                  <div className="profile-row-label">Display Name</div>
                  <div className="profile-row-value">{name || '(not set)'}</div>
                </div>
                <button className="profile-row-edit" onClick={() => { playTapSound(); setNameMsg(null); setEditingName(true); }}>Edit</button>
              </div>
            ) : (
              <div className="profile-row-edit-form">
                <input
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                />
                {nameMsg && <div className={`auth-msg ${nameMsg.type}`} style={{ display: 'block' }}>{nameMsg.text}</div>}
                <div className="profile-row-edit-actions">
                  <button className="btn-ghost" onClick={() => { playTapSound(); setEditingName(false); setNameMsg(null); }} disabled={nameSaving}>Cancel</button>
                  <button className="btn-glow" onClick={handleSaveName} disabled={nameSaving}>
                    {nameSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Username */}
          <div className="profile-row">
            {!editingUsername ? (
              <div className="profile-row-summary">
                <div className="profile-row-main">
                  <div className="profile-row-label">Username</div>
                  <div className="profile-row-value">{currentUsername ? `@${currentUsername}` : '(not set)'}</div>
                </div>
                <button className="profile-row-edit" onClick={() => { playTapSound(); setUsernameMsg(null); setEditingUsername(true); }}>
                  {currentUsername ? 'Edit' : 'Claim'}
                </button>
              </div>
            ) : (
              <div className="profile-row-edit-form">
                <input
                  className="auth-input profile-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. sanjana_2027"
                  autoFocus
                />
                <p className="std-note">3–20 characters: letters, numbers, or underscore. No one else can have the same one.</p>
                {usernameMsg && <div className={`auth-msg ${usernameMsg.type}`} style={{ display: 'block' }}>{usernameMsg.text}</div>}
                <div className="profile-row-edit-actions">
                  <button className="btn-ghost" onClick={() => { playTapSound(); setEditingUsername(false); setUsernameMsg(null); }} disabled={usernameSaving}>Cancel</button>
                  <button className="btn-glow" onClick={handleSaveUsername} disabled={usernameSaving}>
                    {usernameSaving ? 'Checking…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">Security</div>
        <div className="profile-list">
          <div className="profile-row">
            {!showPwForm ? (
              <div className="profile-row-summary">
                <div className="profile-row-main">
                  <div className="profile-row-label">Password</div>
                  <div className="profile-row-value">••••••••</div>
                </div>
                <button className="profile-row-edit" onClick={() => { playTapSound(); setShowPwForm(true); }}>Change</button>
              </div>
            ) : (
              <div className="profile-row-edit-form">
                <input className="auth-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Current password" autoComplete="current-password" autoFocus />
                <input className="auth-input profile-pw-gap" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
                <input className="auth-input profile-pw-gap" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" />

                <div className="profile-forgot-row">
                  <button type="button" className="auth-forgot" onClick={handleForgotPassword}>Forgot password?</button>
                </div>

                {pwMsg && <div className={`auth-msg ${pwMsg.type}`} style={{ display: 'block' }}>{pwMsg.text}</div>}
                <div className="profile-row-edit-actions">
                  <button className="btn-ghost" onClick={() => { playTapSound(); setShowPwForm(false); setPwMsg(null); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} disabled={pwSaving}>Cancel</button>
                  <button className="btn-glow" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? 'Changing…' : 'Change Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
