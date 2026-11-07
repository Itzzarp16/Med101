import AdminPdfLinkCard from './AdminPdfLinkCard';

// Admin > PDF Library: add / remove the externally hosted PDFs shown at med101.space/medpdf.
export default function AdminPdfLibraryScreen() {
  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">📚 PDF Library</h1>
        <p className="std-sub">The study PDFs students see at med101.space/medpdf.</p>
      </div>
      <AdminPdfLinkCard standalone />
    </div>
  );
}
