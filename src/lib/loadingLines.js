// Rotating one-liners shown while a screen loads. Keep them short, clean and
// kind: gentle med-student humour, nothing about patients or real conditions.
export const LOADING_LINES = [
  "Warming up the neurons…",
  "Fetching questions. Mitochondria is already here.",
  "Auscultating the server…",
  "Checking the pulse of the database…",
  "Dissecting the loading bar…",
  "Brewing chai for the servers…",
  "Counting the Krebs cycle steps. Still eight.",
  "Asking Gray's Anatomy to hurry up…",
  "Reticulating the splines of the spleen…",
  "Convincing the vagus nerve to cooperate…",
  "Memorising the cranial nerves in the background…",
  "Sterilising the pixels…",
  "Rehydrating the flashcards…",
  "Taking the history of this page…",
  "Ordering a full blood count of data…",
  "Pretending to be a very important scan…",
  "Doing a quick ward round of the cache…",
  "Tying surgeon's knots in the wiring…",
  "Waiting for the coffee to reach the cortex…",
  "Revising while you wait. You should too.",
  "Charging the defibrillator. Just a drill.",
];

// Start somewhere random so the first line a student sees isn't always the
// same, then walk the list in a shuffled order without immediate repeats.
export function shuffledLines() {
  const a = [...LOADING_LINES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
