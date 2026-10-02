import React, { createContext, useContext, useEffect, useState } from 'react';
export const ACCENTS = { indigo:'#5b5bf0', emerald:'#10b981', rose:'#f43f5e', amber:'#f59e0b', sky:'#0ea5e9' };
const Ctx = createContext();
export const useTheme = () => useContext(Ctx);
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(localStorage.getItem('mode') || 'system');
  const [accent, setAccent] = useState(localStorage.getItem('accent') || 'indigo');
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply(); mq.addEventListener('change', apply);
    localStorage.setItem('mode', mode);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
  useEffect(() => { document.documentElement.dataset.accent = accent; localStorage.setItem('accent', accent); }, [accent]);
  return <Ctx.Provider value={{ mode, setMode, accent, setAccent }}>{children}</Ctx.Provider>;
}
export function ThemeSwitcher() {
  const { mode, setMode, accent, setAccent } = useTheme();
  return (
    <div className="dots">
      <div className="seg">
        {['light','dark','system'].map(m => <button key={m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{m[0].toUpperCase()+m.slice(1)}</button>)}
      </div>
      {Object.entries(ACCENTS).map(([k,c]) => <span key={k} title={k} className={'dot'+(accent===k?' on':'')} style={{background:c}} onClick={()=>setAccent(k)} />)}
    </div>
  );
}
