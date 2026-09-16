import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// Reads a File object as a base64 string (no data: prefix), for
// sending PDFs to api/upload-questions.py.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

// Safely under Firestore's ~1MiB per-document field size limit.
const CHUNK_SIZE = 700_000;

export async function uploadQuestionPdf({ semesterId, mainSubject, subtopic, emoji, desc, file, saveMethod }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in as admin to upload questions.');

  const pdfBase64 = await fileToBase64(file);

  // Sent to Firestore in chunks rather than directly in the request
  // body, and not via Firebase Storage - see api/upload-questions.py's
  // header comment for why: Vercel caps a request body at 4.5MB (a
  // base64-encoded PDF of any real size blows through that), and
  // Storage requires the Blaze plan, which this project isn't on.
  // Firestore has no such per-upload ceiling.
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const chunks = [];
  for (let i = 0; i < pdfBase64.length; i += CHUNK_SIZE) {
    chunks.push(pdfBase64.slice(i, i + CHUNK_SIZE));
  }

  const chunkRefs = chunks.map((_, i) => doc(db, 'pdfUploadChunks', `${uploadId}_${i}`));
  try {
    await Promise.all(chunks.map((data, i) => setDoc(chunkRefs[i], { uploadId, index: i, data })));
  } catch (e) {
    throw new Error(`Could not upload the file: ${e.message}`);
  }

  const idToken = await user.getIdToken();

  let response;
  try {
    response = await fetch('/api/upload-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ semesterId, mainSubject, subtopic, emoji, desc, saveMethod, uploadId, chunkCount: chunks.length }),
    });
  } finally {
    // The server also does best-effort cleanup on its end, but clean up
    // here too in case the request itself never reached it.
    Promise.all(chunkRefs.map((ref) => deleteDoc(ref).catch(() => {}))).catch(() => {});
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Could not upload questions.');
    error.status = response.status;
    error.incompleteQuestionNumbers = data.incompleteQuestionNumbers;
    error.malformedQuestions = data.malformedQuestions;
    throw error;
  }

  return data;
}
