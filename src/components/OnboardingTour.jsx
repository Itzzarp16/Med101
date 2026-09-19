import { useState } from 'react';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';

const STEPS = [
  {
    emoji: '👋',
    title: 'Welcome to Med101',
    text: "Your year and semester's full question bank is ready. Here's a quick look at what you can do.",
  },
  {
    emoji: '📝',
    title: 'Take a quiz',
    text: 'Pick a subject and start quizzing. Your progress is tracked automatically as you go, question by question.',
  },
  {
    emoji: '🎯',
    title: 'Weak Topics',
    text: 'After a few quizzes, check Weak Topics in the menu to see exactly what to focus on before an exam.',
  },
  {
    emoji: '👥',
    title: 'Challenge a friend',
    text: 'Go head-to-head with a classmate in real time, or check the Leaderboard to see where you stand.',
  },
  {
    emoji: '📌',
    title: 'Wrong & Flagged Questions',
    text: "Anything you get wrong, or flag yourself, is saved here automatically so you can revisit it later.",
  },
  {
    emoji: '🎉',
    title: "You're all set!",
    text: 'Open the menu anytime (☰ top-left) to find all of this. Good luck studying!',
  },
];

export default function OnboardingTour({ onFinish }) {
  useLockBodyScroll();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function next() {
    playTapSound();
    if (isLast) {
      onFinish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    playTapSound();
    setStep((s) => Math.max(0, s - 1));
  }

  function skip() {
    playTapSound();
    onFinish();
  }

  return (
    <div className="onboarding-overlay">
      <div className="glass onboarding-card">
        <button className="onboarding-skip" onClick={skip}>Skip</button>

        <div className="onboarding-emoji">{current.emoji}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-text">{current.text}</p>

        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn-ghost onboarding-back" onClick={back}>Back</button>
          )}
          <button className="onboarding-next" onClick={next}>
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
