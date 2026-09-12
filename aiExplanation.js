import { auth } from './firebase';

export async function getAIExplanation({ subject, subtopic, question, options, correctIndex }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to use AI explanations.');

  const idToken = await user.getIdToken();
  const response = await fetch('/api/ai-explanation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ subject, subtopic, question, options, correctIndex }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Could not generate an AI explanation.');
    error.status = response.status;
    throw error;
  }

  return data;
}
