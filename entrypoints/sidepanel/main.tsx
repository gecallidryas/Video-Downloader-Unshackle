import ReactDOM from 'react-dom/client';
import { SidePanelApp } from '@/src/app/surfaces/sidepanel/SidePanelApp';
import { resolveActiveTabIdFromSearch } from '@/src/app/surfaces/sidepanel/resolve-active-tab-id';
import '@/src/styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SidePanelApp activeTabId={resolveActiveTabIdFromSearch(location.search)} />,
);
