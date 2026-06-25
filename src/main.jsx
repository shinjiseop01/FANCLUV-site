import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import LoginPage from './LoginPage.jsx'
import SignupPage from './SignupPage.jsx'
import TeamSelectPage from './TeamSelectPage.jsx'
import ClubHomePage from './ClubHomePage.jsx'
import OpinionsPage from './OpinionsPage.jsx'
import OpinionDetailPage from './OpinionDetailPage.jsx'
import SurveyPage from './SurveyPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/team-select" element={<TeamSelectPage />} />
        <Route path="/club/:teamId" element={<ClubHomePage />} />
        <Route path="/club/:teamId/opinions" element={<OpinionsPage />} />
        <Route path="/club/:teamId/opinions/:opinionId" element={<OpinionDetailPage />} />
        <Route path="/club/:teamId/survey" element={<SurveyPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
