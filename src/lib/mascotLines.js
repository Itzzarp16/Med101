const LINES = ['Nice one!', 'Yes!', 'Correct!', 'You got it!', 'Big brain!', 'Smooth!', 'Future doctor!', 'Spot on!'];

// What Pulse says for a run of `streak` correct answers in a row.
export function cheerLine(streak) {
  if (streak >= 3 && streak % 5 === 0) return `🔥 ${streak} in a row!`;
  if (streak === 3) return '3 in a row!';
  return LINES[Math.floor(Math.random() * LINES.length)];
}
