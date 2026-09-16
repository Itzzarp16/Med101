import { auth } from './firebase';

// Reads a File object as a base64 string (no data: prefix), for
// sending PDFs to api/upload-questions.py as JSON.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadQuestionPdf({ semesterId, mainSubject, subtopic, emoji, desc, file, saveMethod }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in as admin to upload questions.');

  const pdfBase64 = await fileToBase64(file);
  const idToken = await user.getIdToken();

  const response = await fetch('/api/upload-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ semesterId, mainSubject, subtopic, emoji, desc, pdfBase64, saveMethod }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Could not upload questions.');
    error.status = response.status;
    error.incompleteQuestionNumbers = data.incompleteQuestionNumbers;
    throw error;
  }

  return data;
}
