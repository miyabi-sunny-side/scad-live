import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: globalThis.document.getElementById('app') });
