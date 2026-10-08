// Each subject gets its own colour: its position in the semester's subject
// list picks one of the 12 hues in styles/subjectTheme.css (.subj-hue-N), so
// no two subjects in a semester share a colour, and the dashboard card, the
// subtopic screen and the mode screen always agree.
export const SUBJECT_HUES = 12;

export function subjectHueIndex(name, mainSubjectMeta) {
  const keys = Object.keys(mainSubjectMeta || {});
  const i = keys.indexOf(name);
  if (i >= 0) return i % SUBJECT_HUES;
  // Unknown subject (shouldn't happen): stable hash so it still gets a colour.
  let h = 0;
  for (let k = 0; k < (name || '').length; k++) h = (h * 31 + name.charCodeAt(k)) >>> 0;
  return h % SUBJECT_HUES;
}
