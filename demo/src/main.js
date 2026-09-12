import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import 'katex/dist/katex.min.css';

const target = document.getElementById('app');
// getElementById returns HTMLElement | null. Casting the null away here would
// mean a missing div surfaces as an unreadable error from inside Svelte's
// mount, on a page that renders nothing and explains nothing.
if (!target) throw new Error('#app is missing from index.html; nothing to mount into');

mount(App, { target });
