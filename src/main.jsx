import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext'
import { initTheme } from './lib/theme'
import ErrorBoundary from './components/ErrorBoundary'

initTheme();

// Register the service worker so the browser will actually offer
// "Add to Home Screen" / install (Chrome requires one to be present,
// even though it doesn't cache anything - see public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
