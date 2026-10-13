// Subjects shown as cards for each year, in this order. `name` must match the folder
// name under public/medpdf/pdfs/<Year>/ (case-insensitive). Extra folders found on disk
// are added after these automatically.
export const SUBJECTS = {
  '1st Year': [
    { name: 'Physiology', icon: '🫀', hue: 352, blurb: 'How the body works' },
    { name: 'Anatomy', icon: '🦴', hue: 38, blurb: 'Structure, region by region' },
    { name: 'Biochemistry', icon: '🧪', hue: 165, blurb: 'Molecules and metabolism' },
  ],
  '2nd Year': [
    { name: 'Pathology', icon: '🔬', hue: 280, blurb: 'What goes wrong, and why' },
    { name: 'Microbiology', icon: '🦠', hue: 100, blurb: 'Bacteria, viruses, fungi' },
    { name: 'PSM', icon: '🌍', hue: 205, blurb: 'Preventive & social medicine' },
    { name: 'Pharmacology', icon: '💊', hue: 322, blurb: 'Drugs and how they act' },
  ],
}
