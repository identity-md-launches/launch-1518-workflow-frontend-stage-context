import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadRuntime, type Runtime } from './config';
import './fonts.css';
import './styles.css';
function Bootstrap() {
  const [runtime, setRuntime] = useState<Runtime>();
  const [error, setError] = useState('');
  useEffect(() => { let mounted = true; void loadRuntime().then(r => { if (mounted) setRuntime(r); }).catch(e => { if (mounted) setError(e.message); }); return () => { mounted = false; }; }, []);
  return runtime ? <App runtime={runtime}/> : <main className="bootstrap"><h1>Swarm Cats</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading the verified deployment…'}</p>{error && <button className="button" type="button" onClick={() => location.reload()}>Reload deployment</button>}</main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Bootstrap/></StrictMode>);
