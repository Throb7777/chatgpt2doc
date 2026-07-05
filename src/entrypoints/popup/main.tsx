import { render } from 'preact';

import { App } from './App';
import './style.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Popup root element was not found.');
}

render(<App />, root);
