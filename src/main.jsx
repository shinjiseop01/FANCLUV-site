import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth.js'
import { LanguageProvider } from './contexts/LanguageContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import './index.css'
import './theme.css'
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
import FanRankingPage from './FanRankingPage.jsx'
import SettingsPage from './SettingsPage.jsx'

// 보호 라우트: 로그인하지 않은 사용자가 접근하면 로그인 페이지로 이동
function RequireAuth({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <LanguageProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/team-select" element={<RequireAuth><TeamSelectPage /></RequireAuth>} />
        <Route path="/club/:teamId" element={<RequireAuth><ClubHomePage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions" element={<RequireAuth><OpinionsPage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions/:opinionId" element={<RequireAuth><OpinionDetailPage /></RequireAuth>} />
        <Route path="/club/:teamId/survey" element={<RequireAuth><SurveyPage /></RequireAuth>} />
        <Route path="/club/:teamId/write" element={<RequireAuth><CreateOpinionPage /></RequireAuth>} />
        <Route path="/club/:teamId/activity" element={<RequireAuth><MyActivityPage /></RequireAuth>} />
        <Route path="/club/:teamId/matches" element={<RequireAuth><MatchCenterPage /></RequireAuth>} />
        <Route path="/club/:teamId/news" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/news/:newsId" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/insights" element={<RequireAuth><AIInsightsPage /></RequireAuth>} />
        <Route path="/club/:teamId/ranking" element={<RequireAuth><FanRankingPage /></RequireAuth>} />
        <Route path="/club/:teamId/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)
