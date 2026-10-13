// Subjects shown for each year, in this order. `name` must match the folder name under
// public/medpdf/pdfs/<Year>/ (case-insensitive). `hue` is the small colour dot.
// Extra folders found on disk are added after these automatically.
export const SUBJECTS = {
  '1st Year': [
    { name: 'Physiology', hue: 355 },
    { name: 'Anatomy', hue: 35 },
    { name: 'Biochemistry', hue: 165 },
  ],
  '2nd Year': [
    { name: 'Pathology', hue: 275 },
    { name: 'Microbiology', hue: 100 },
    { name: 'PSM', hue: 210 },
    { name: 'Pharmacology', hue: 320 },
  ],
}
