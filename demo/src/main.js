import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import 'katex/dist/katex.min.css';

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });
