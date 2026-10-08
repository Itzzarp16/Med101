// Rotating one-liners shown while a screen loads. Keep them short, clean and
// kind: gentle med-student humour, nothing about patients or real conditions.
// Add as many as you like; the picker below chooses at random.
export const LOADING_LINES = [
  "Warming up the neurons…",
  "Fetching questions. Mitochondria is already here.",
  "Auscultating the server…",
  "Checking the pulse of the database…",
  "Dissecting the loading bar…",
  "Brewing chai for the servers…",
  "Counting the Krebs cycle steps. Still eight.",
  "Asking Gray's Anatomy to hurry up…",
  "Convincing the vagus nerve to cooperate…",
  "Memorising the cranial nerves in the background…",
  "Sterilising the pixels…",
  "Rehydrating the flashcards…",
  "Taking the history of this page…",
  "Ordering a full blood count of data…",
  "Doing a quick ward round of the cache…",
  "Tying surgeon's knots in the wiring…",
  "Waiting for the coffee to reach the cortex…",
  "Revising while you wait. You should too.",
  "Charging the defibrillator. Just a drill.",
  "Loading faster than the lecture hall heater…",
  "Looking for the origin and insertion of this page…",
  "Calibrating the stethoscope of the internet…",
  "Palpating the pixels gently…",
  "Reciting the carpal bones: Some Lovers Try Positions…",
  "Telling the cerebellum to balance the bar…",
  "Pretending to be very busy, like an intern.",
  "Swotting up on pharmacology so you don't have to…",
  "Giving the servers a stern anatomy lecture…",
  "Waking up the hippocampus. It forgot something.",
  "Running a differential diagnosis on slow Wi-Fi…",
  "Cross-matching your questions with the database…",
  "Suturing a loose connection…",
  "Making the loading bar sound like a heartbeat. Lub-dub…",
  "Adding extra mnemonics. Do not ask what they mean.",
  "Boiling the kettle for the night shift…",
  "Pinning the question paper to the cork board of the cloud…",
  "Fetching a fresh batch of high-yield facts…",
  "Locating the missing millilitre of data…",
  "Going over the 12 cranial nerves. Olfactory is first. Still.",
  "Crossing the blood-brain barrier of your Wi-Fi…",
  "Taking a deep breath. Inhale, exhale, load.",
  "Counting sheep, sorry, counting sarcomeres…",
  "Nudging a stubborn neuron into action…",
  "Reading your ECG: it says you're about to ace this.",
  "Prepping the OSCE station. Please stand by.",
  "Checking the vital signs of the app: all good!",
  "Looking up whether that is a muscle or a tendon…",
  "Sending the data through the proper channels. And veins.",
  "Reviewing the Krebs cycle on a sticky note…",
  "Syncing with the circadian rhythm of the server…",
  "Dusting off the skeleton in the corner…",
  "Letting the pixels have their tea break…",
  "Spinning up the centrifuge…",
  "Reminding the liver it has 500 jobs. Loading is job 501.",
  "Wearing a white coat for extra speed…",
  "Dilating the pupils of the progress bar…",
  "Tapping the knee of the loading screen for a reflex…",
  "Committing this wait to long-term memory…",
  "Hydrating. You should too. Seriously.",
  "Almost there. Just one more cup of tea…",
  "Rerouting through the coronary arteries of the network…",
  "Counting the ribs. Twelve pairs, as expected.",
  "Studying the syllabus faster than your last all-nighter…",
  "Reading the label on the question bank twice…",
];

let last = -1;

// A purely random pick each time, never the same line twice in a row. Start
// index and every following index are independent draws, so students see a
// different mix on every load.
export function randomLineIndex(exclude = last) {
  const n = LOADING_LINES.length;
  if (n < 2) return 0;
  let i = Math.floor(Math.random() * n);
  if (i === exclude) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
  last = i;
  return i;
}
