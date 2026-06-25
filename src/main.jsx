import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import LoginPage from './LoginPage.jsx'
import SignupPage from './SignupPage.jsx'
import TeamSelectPage from './TeamSelectPage.jsx'
import ClubHomePage from './ClubHomePage.jsx'
import OpinionsPage from './OpinionsPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/team-select" element={<TeamSelectPage />} />
        <Route path="/club/:teamId" element={<ClubHomePage />} />
        <Route path="/club/:teamId/opinions" element={<OpinionsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
