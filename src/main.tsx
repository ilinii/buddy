import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import './ui/styles.css';
import './ui/modern.css';
import './ui/experience.css';
import './ui/window.css';
import './ui/phone.css';
import { App } from './ui/App';
import { WindowChrome } from './ui/WindowChrome';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WindowChrome><App /></WindowChrome></React.StrictMode>);
