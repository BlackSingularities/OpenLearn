import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Home } from './components/Home';
import { TopicPlayer } from './components/TopicPlayer';
import { applyStoredLabels, applyStoredTheme } from './components/ui';
import './styles.css';
import './scenes.css';
import './polish.css';

applyStoredTheme();
applyStoredLabels();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/temat/:topicId/:step?" element={<TopicPlayer />} />
        <Route path="/temat/:topicId/:mod/:step" element={<TopicPlayer />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
