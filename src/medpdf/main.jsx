import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { startLockupFit } from '../lib/lockup'
createRoot(document.getElementById('root')).render(<App />)
startLockupFit() // fits the tagline to the wordmark width, exactly like the main site
