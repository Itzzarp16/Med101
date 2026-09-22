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

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState(null);

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

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🙍 Your Profile</h1>
        <p className="std-sub">{user.email}</p>
      </div>

      <div className="glass std-card profile-avatar-card">
        <button
          type="button"
          onClick={() => { playTapSound(); fileInputRef.current?.click(); }}
          disabled={photoUploading}
          title="Change profile photo"
          className="profile-avatar-btn"
          style={profile?.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}
        >
          {!profile?.photoURL && (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase()}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoPicked}
          style={{ display: 'none' }}
        />
        <button className="btn-ghost profile-avatar-change-btn" onClick={() => { playTapSound(); fileInputRef.current?.click(); }} disabled={photoUploading}>
          {photoUploading ? 'Uploading…' : (profile?.photoURL ? 'Change Photo' : 'Add Profile Photo')}
        </button>
        {photoMsg && <div className={`auth-msg ${photoMsg.type}`} style={{ display: 'block' }}>{photoMsg.text}</div>}
      </div>

      <div className="quiz-stats-grid profile-stats-grid">
        <div className="stat-card profile-stat-streak">
          <div className="stat-label">🔥 Current Streak</div>
          <div className="stat-value">{profile?.streakCount || 0}</div>
        </div>
        <div className="stat-card profile-stat-longest">
          <div className="stat-label">Longest Streak</div>
          <div className="stat-value">{profile?.longestStreak || 0}</div>
        </div>
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
      <div className="glass std-card profile-card">
        <label className="auth-label">Unique Username</label>
        {currentUsername && (
          <div className="profile-current-username">Currently: <strong>@{currentUsername}</strong></div>
        )}
        <input
          className="auth-input profile-username-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. sanjana_2027"
        />
        <p className="std-note">3–20 characters: letters, numbers, or underscore. No one else can have the same one.</p>
        {usernameMsg && <div className={`auth-msg ${usernameMsg.type}`} style={{ display: 'block' }}>{usernameMsg.text}</div>}
        <button className="btn-glow std-save-btn" onClick={handleSaveUsername} disabled={usernameSaving}>
          {usernameSaving ? 'Checking…' : (currentUsername ? 'Update Username' : 'Claim Username')}
        </button>
      </div>

      {/* Password */}
      <div className="glass std-card profile-card">
        <div className="auth-label" style={{ margin: 0 }}>Change Password</div>

        {!showPwForm ? (
          <button
            className="btn-ghost std-save-btn profile-pw-toggle-btn"
            onClick={() => { playTapSound(); setShowPwForm(true); }}
          >
            Change Your Password
          </button>
        ) : (
          <>
            <label className="auth-label profile-pw-label">Current Password</label>
            <input className="auth-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            <div className="profile-forgot-row">
              <button type="button" className="auth-forgot" onClick={handleForgotPassword}>Forgot password?</button>
            </div>

            <label className="auth-label profile-pw-label">New Password</label>
            <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" autoComplete="new-password" />

            <label className="auth-label profile-pw-label">Confirm New Password</label>
            <input className="auth-input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" />

            {pwMsg && <div className={`auth-msg ${pwMsg.type}`} style={{ display: 'block' }}>{pwMsg.text}</div>}
            <button className="btn-glow std-save-btn" onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? 'Changing…' : 'Change Password'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
