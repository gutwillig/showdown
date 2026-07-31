import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Debug env vars
console.log('=== ENV VAR DEBUG ===');
console.log('SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Has ANON_KEY:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log('ANON_KEY length:', import.meta.env.VITE_SUPABASE_ANON_KEY?.length);
console.log('=====================');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
