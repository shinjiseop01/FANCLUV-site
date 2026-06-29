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
import CreateOpinionPage from './CreateOpinionPage.jsx'
import MyActivityPage from './MyActivityPage.jsx'
import MatchCenterPage from './MatchCenterPage.jsx'
import TeamNewsPage from './TeamNewsPage.jsx'
import AIInsightsPage from './AIInsightsPage.jsx'

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
        <Route path="/club/:teamId/write" element={<CreateOpinionPage />} />
        <Route path="/club/:teamId/activity" element={<MyActivityPage />} />
        <Route path="/club/:teamId/matches" element={<MatchCenterPage />} />
        <Route path="/club/:teamId/news" element={<TeamNewsPage />} />
        <Route path="/club/:teamId/news/:newsId" element={<TeamNewsPage />} />
        <Route path="/club/:teamId/insights" element={<AIInsightsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
