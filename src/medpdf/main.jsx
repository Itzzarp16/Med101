import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import '../styles/motion.css'
import '../components/AnswerKey.css'
import './medpdf.css'
import { initTheme } from '../lib/theme'
import App from './App.jsx'

initTheme()
createRoot(document.getElementById('root')).render(<App />)
