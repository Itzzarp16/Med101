import { createRoot } from 'react-dom/client'
import { getTheme } from '../lib/theme.js'
import App from './App.jsx'
import './styles.css'

// Same saved theme as the main Med101 site (light unless the person chose dark).
const light = getTheme() === 'light'
document.documentElement.classList.toggle('light', light)
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#eef1f7' : '#07090f')

createRoot(document.getElementById('root')).render(<App />)
