import ReactDOM from 'react-dom/client';
import { PopupApp } from '@/src/app/surfaces/popup/PopupApp';
import '@/src/styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<PopupApp loadRuntimeJobs />);
