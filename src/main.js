import './styles.css';
import './emonos/emonos.css';
import { initApp } from './app.js';

initApp().catch((err) => console.error(err));
