import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('ChartSense: #root element is missing from sidepanel.html');

// While this port is open the panel counts as open; when the panel closes the background pauses
// monitoring (D-025). Reconnect if Chrome restarts the service worker, which drops the port.
function holdPanelPort() {
  chrome.runtime.connect({ name: 'sidepanel' }).onDisconnect.addListener(() => setTimeout(holdPanelPort, 500));
}
holdPanelPort();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
