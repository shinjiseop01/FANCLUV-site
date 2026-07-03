import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated, isAdmin } from './lib/auth.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { LanguageProvider } from './contexts/LanguageContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import './index.css'
import './theme.css'
import './components/components.css'
import LoginPage from './LoginPage.jsx'
import SignupPage from './SignupPage.jsx'
import FindIdPage from './FindIdPage.jsx'
import FindPasswordPage from './FindPasswordPage.jsx'
import VerifyEmailPage from './VerifyEmailPage.jsx'
import OnboardingPage from './OnboardingPage.jsx'
import ProfileEditPage from './ProfileEditPage.jsx'
import ChangePasswordPage from './ChangePasswordPage.jsx'
import InfoPage from './InfoPage.jsx'
import TeamSelectPage from './TeamSelectPage.jsx'
import ClubHomePage from './ClubHomePage.jsx'
import OpinionsPage from './OpinionsPage.jsx'
import OpinionDetailPage from './OpinionDetailPage.jsx'
import SurveyPage from './SurveyPage.jsx'
import SurveyDetailPage from './SurveyDetailPage.jsx'
import CreateOpinionPage from './CreateOpinionPage.jsx'
import MyActivityPage from './MyActivityPage.jsx'
import MatchCenterPage from './MatchCenterPage.jsx'
import TeamNewsPage from './TeamNewsPage.jsx'
import AIInsightsPage from './AIInsightsPage.jsx'
import FanRankingPage from './FanRankingPage.jsx'
import SettingsPage from './SettingsPage.jsx'
import NotFoundPage from './NotFoundPage.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminDashboard from './admin/AdminDashboard.jsx'
import AdminMembers from './admin/AdminMembers.jsx'
import AdminOpinions from './admin/AdminOpinions.jsx'
import AdminSurveys from './admin/AdminSurveys.jsx'
import AdminNews from './admin/AdminNews.jsx'
import AdminReports from './admin/AdminReports.jsx'
import AdminSettings from './admin/AdminSettings.jsx'
import AccessDenied from './admin/AccessDenied.jsx'

// 세션 로딩 중 표시(잠깐). Supabase 모드에서 초기 세션 확인 동안 노출.
function AuthGate() {
  return <div style={{ minHeight: '100vh' }} aria-busy="true" />
}

// 보호 라우트: 로그인하지 않은 사용자가 접근하면 로그인 페이지로 이동.
// - Supabase 모드: 세션 로딩(loading) 동안 대기 후 판단.
// - Mock 모드: 기존처럼 동기 isAuthenticated() 로 즉시 판단.
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (!isSupabaseConfigured) return isAuthenticated() ? children : <Navigate to="/" replace />
  if (loading) return <AuthGate />
  return user ? children : <Navigate to="/" replace />
}

// 운영자 전용 라우트: 비로그인 → 로그인, 로그인했지만 일반 사용자 → 접근 거부 안내
function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  if (!isSupabaseConfigured) {
    if (!isAuthenticated()) return <Navigate to="/" replace />
    if (!isAdmin()) return <AccessDenied />
    return children
  }
  if (loading) return <AuthGate />
  if (!user) return <Navigate to="/" replace />
  if (!isAdmin()) return <AccessDenied />
  return children
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/find-id" element={<FindIdPage />} />
        <Route path="/find-password" element={<FindPasswordPage />} />
        <Route path="/verify-email" element={<RequireAuth><VerifyEmailPage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/team-select" element={<RequireAuth><TeamSelectPage /></RequireAuth>} />
        <Route path="/club/:teamId" element={<RequireAuth><ClubHomePage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions" element={<RequireAuth><OpinionsPage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions/:opinionId" element={<RequireAuth><OpinionDetailPage /></RequireAuth>} />
        <Route path="/club/:teamId/survey" element={<RequireAuth><SurveyPage /></RequireAuth>} />
        <Route path="/club/:teamId/survey/:surveyId" element={<RequireAuth><SurveyDetailPage /></RequireAuth>} />
        <Route path="/club/:teamId/write" element={<RequireAuth><CreateOpinionPage /></RequireAuth>} />
        <Route path="/club/:teamId/activity" element={<RequireAuth><MyActivityPage /></RequireAuth>} />
        <Route path="/club/:teamId/matches" element={<RequireAuth><MatchCenterPage /></RequireAuth>} />
        <Route path="/club/:teamId/news" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/news/:newsId" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/insights" element={<RequireAuth><AIInsightsPage /></RequireAuth>} />
        <Route path="/club/:teamId/ranking" element={<RequireAuth><FanRankingPage /></RequireAuth>} />
        <Route path="/club/:teamId/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/club/:teamId/profile" element={<RequireAuth><ProfileEditPage /></RequireAuth>} />
        <Route path="/club/:teamId/password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
        <Route path="/club/:teamId/about" element={<RequireAuth><InfoPage page="about" /></RequireAuth>} />
        <Route path="/club/:teamId/privacy" element={<RequireAuth><InfoPage page="privacy" /></RequireAuth>} />
        <Route path="/club/:teamId/terms" element={<RequireAuth><InfoPage page="terms" /></RequireAuth>} />

        {/* ── Admin Console (운영자 전용) ── */}
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminDashboard />} />
          <Route path="members" element={<AdminMembers />} />
          <Route path="opinions" element={<AdminOpinions />} />
          <Route path="surveys" element={<AdminSurveys />} />
          <Route path="news" element={<AdminNews />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)
