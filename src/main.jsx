import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { isAuthenticated, isAdmin, isClub, getClubId } from './lib/auth.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { LanguageProvider } from './contexts/LanguageContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { registerServiceWorker } from './lib/registerSW.js'
import { initAnalytics, analytics } from './services/analytics/index.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import './index.css'
import './theme.css'
import './components/components.css'

// 랜딩 라우트(로그인)만 즉시 로드해 첫 페인트 지연을 막고,
// 나머지 페이지는 라우트 단위 코드 스플리팅(React.lazy)으로 필요할 때 로드한다.
import LoginPage from './LoginPage.jsx'
import AuthCallbackPage from './AuthCallbackPage.jsx'

const SignupPage = lazy(() => import('./SignupPage.jsx'))
const FindIdPage = lazy(() => import('./FindIdPage.jsx'))
const FindPasswordPage = lazy(() => import('./FindPasswordPage.jsx'))
const ResetPasswordPage = lazy(() => import('./ResetPasswordPage.jsx'))
const NotificationCenterPage = lazy(() => import('./NotificationCenterPage.jsx'))
const VerifyEmailPage = lazy(() => import('./VerifyEmailPage.jsx'))
const OnboardingPage = lazy(() => import('./OnboardingPage.jsx'))
const VerifyIdentityPage = lazy(() => import('./VerifyIdentityPage.jsx'))
const ProfileEditPage = lazy(() => import('./ProfileEditPage.jsx'))
const ChangePasswordPage = lazy(() => import('./ChangePasswordPage.jsx'))
const InfoPage = lazy(() => import('./InfoPage.jsx'))
const TeamSelectPage = lazy(() => import('./TeamSelectPage.jsx'))
const ClubHomePage = lazy(() => import('./ClubHomePage.jsx'))
const OpinionsPage = lazy(() => import('./OpinionsPage.jsx'))
const OpinionDetailPage = lazy(() => import('./OpinionDetailPage.jsx'))
const SurveyPage = lazy(() => import('./SurveyPage.jsx'))
const SurveyDetailPage = lazy(() => import('./SurveyDetailPage.jsx'))
const CreateOpinionPage = lazy(() => import('./CreateOpinionPage.jsx'))
const MyActivityPage = lazy(() => import('./MyActivityPage.jsx'))
const MatchCenterPage = lazy(() => import('./MatchCenterPage.jsx'))
const TeamNewsPage = lazy(() => import('./TeamNewsPage.jsx'))
const FanPulsePage = lazy(() => import('./FanPulsePage.jsx'))
const AIInsightsPage = lazy(() => import('./AIInsightsPage.jsx'))
const FanRankingPage = lazy(() => import('./FanRankingPage.jsx'))
const SettingsPage = lazy(() => import('./SettingsPage.jsx'))
const NotFoundPage = lazy(() => import('./NotFoundPage.jsx'))
// 관리자 콘솔은 팬 화면과 별개 청크로 분리(운영자만 로드).
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.jsx'))
const AdminMembers = lazy(() => import('./admin/AdminMembers.jsx'))
const AdminOpinions = lazy(() => import('./admin/AdminOpinions.jsx'))
const AdminSurveys = lazy(() => import('./admin/AdminSurveys.jsx'))
const SurveyBuilder = lazy(() => import('./admin/SurveyBuilder.jsx'))
const SurveyResults = lazy(() => import('./admin/SurveyResults.jsx'))
const AdminNews = lazy(() => import('./admin/AdminNews.jsx'))
const AdminNewsSources = lazy(() => import('./admin/AdminNewsSources.jsx'))
const AdminNotices = lazy(() => import('./admin/AdminNotices.jsx'))
const AdminReports = lazy(() => import('./admin/AdminReports.jsx'))
const AdminReportDocs = lazy(() => import('./admin/AdminReportDocs.jsx'))
const AdminClubActions = lazy(() => import('./admin/AdminClubActions.jsx'))
const AdminActionTracker = lazy(() => import('./admin/AdminActionTracker.jsx'))
const AdminCustomers = lazy(() => import('./admin/AdminCustomers.jsx'))
const AdminLeagueApi = lazy(() => import('./admin/AdminLeagueApi.jsx'))
const AdminSystemStatus = lazy(() => import('./admin/AdminSystemStatus.jsx'))
const AdminIdentity = lazy(() => import('./admin/AdminIdentity.jsx'))
const AdminPulse = lazy(() => import('./admin/AdminPulse.jsx'))
const AdminSettings = lazy(() => import('./admin/AdminSettings.jsx'))
const AccessDenied = lazy(() => import('./admin/AccessDenied.jsx'))
// 구단(고객) Executive Dashboard
const ClubExecutiveDashboard = lazy(() => import('./club/ClubExecutiveDashboard.jsx'))

// 세션 로딩 중 표시(잠깐). Supabase 모드에서 초기 세션 확인 동안 노출.
function AuthGate() {
  return <div style={{ minHeight: '100vh' }} aria-busy="true" />
}

// 코드 스플리팅으로 페이지 청크를 불러오는 동안 보여줄 로딩 화면(Skeleton).
function RouteFallback() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }} role="status" aria-busy="true">
      <SkeletonList count={4} />
    </div>
  )
}

// 라우트 변경 시 페이지뷰 계측(현재 mock Analytics Provider). 화면에는 아무것도 안 그림.
function RouteAnalytics() {
  const location = useLocation()
  useEffect(() => {
    analytics.pageView(location.pathname, { search: location.search })
  }, [location.pathname, location.search])
  return null
}

// 보호 라우트: 로그인하지 않은 사용자가 접근하면 로그인 페이지로 이동.
// - Supabase 모드: 세션 로딩(loading) 동안 대기 후 판단.
// - Mock 모드: 기존처럼 동기 isAuthenticated() 로 즉시 판단.
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (isSupabaseConfigured && loading) return <AuthGate />
  if (!isAuthenticated()) return <Navigate to="/" replace />
  // 구단(고객) 계정은 팬 화면(원본 데이터)에 접근 불가 → Executive Dashboard 로.
  if (isClub()) return <Navigate to="/executive" replace />
  return children
}

// 운영자 전용 라우트: 비로그인 → 로그인, 로그인했지만 일반 사용자/구단 → 접근 거부 안내
function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  if (isSupabaseConfigured && loading) return <AuthGate />
  if (!isAuthenticated()) return <Navigate to="/" replace />
  if (!isAdmin()) return <AccessDenied />
  return children
}

// 구단(고객) Executive Dashboard 전용: 구단 계정 + 관리자(구단 대시보드 확인 가능)만.
// 비로그인 → 로그인, 일반 팬 → 자기 구단 홈.
function RequireClub({ children }) {
  const { user, loading } = useAuth()
  if (isSupabaseConfigured && loading) return <AuthGate />
  if (!isAuthenticated()) return <Navigate to="/" replace />
  if (isClub() || isAdmin()) return children
  const team = getClubId()
  return <Navigate to={team ? `/club/${team}` : '/team-select'} replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <LanguageProvider>
    <ErrorBoundary>
    <AuthProvider>
    <ToastProvider>
    <BrowserRouter>
      <RouteAnalytics />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/find-id" element={<FindIdPage />} />
        <Route path="/find-password" element={<FindPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<RequireAuth><VerifyEmailPage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/verify-identity" element={<RequireAuth><VerifyIdentityPage /></RequireAuth>} />
        <Route path="/team-select" element={<RequireAuth><TeamSelectPage /></RequireAuth>} />
        <Route path="/club/:teamId" element={<RequireAuth><ClubHomePage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions" element={<RequireAuth><OpinionsPage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions/:opinionId" element={<RequireAuth><OpinionDetailPage /></RequireAuth>} />
        <Route path="/club/:teamId/survey" element={<RequireAuth><SurveyPage /></RequireAuth>} />
        <Route path="/club/:teamId/survey/:surveyId" element={<RequireAuth><SurveyDetailPage /></RequireAuth>} />
        <Route path="/club/:teamId/write" element={<RequireAuth><CreateOpinionPage /></RequireAuth>} />
        <Route path="/club/:teamId/opinions/:opinionId/edit" element={<RequireAuth><CreateOpinionPage /></RequireAuth>} />
        <Route path="/club/:teamId/activity" element={<RequireAuth><MyActivityPage /></RequireAuth>} />
        <Route path="/club/:teamId/notifications" element={<RequireAuth><NotificationCenterPage /></RequireAuth>} />
        <Route path="/club/:teamId/matches" element={<RequireAuth><MatchCenterPage /></RequireAuth>} />
        <Route path="/club/:teamId/news" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/news/:newsId" element={<RequireAuth><TeamNewsPage /></RequireAuth>} />
        <Route path="/club/:teamId/pulse" element={<RequireAuth><FanPulsePage /></RequireAuth>} />
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
          <Route path="surveys/new" element={<SurveyBuilder />} />
          <Route path="surveys/:id/edit" element={<SurveyBuilder />} />
          <Route path="surveys/:id/results" element={<SurveyResults />} />
          <Route path="news" element={<AdminNews />} />
          <Route path="news-sources" element={<AdminNewsSources />} />
          <Route path="notices" element={<AdminNotices />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="report-docs" element={<AdminReportDocs />} />
          <Route path="actions" element={<AdminClubActions />} />
          <Route path="tracker" element={<AdminActionTracker />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="league" element={<AdminLeagueApi />} />
          <Route path="system" element={<AdminSystemStatus />} />
          <Route path="identity" element={<AdminIdentity />} />
          <Route path="pulse" element={<AdminPulse />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* ── Club Executive Dashboard (B2B 구단 고객 전용) ── */}
        <Route path="/executive" element={<RequireClub><ClubExecutiveDashboard /></RequireClub>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
    </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)

// 성능/사용성 계측 초기화 (현재 mock Provider — GA4/Clarity 는 추후 교체)
initAnalytics()

// PWA: Service Worker 등록 (프로덕션 빌드에서만 — dev HMR 보호)
registerServiceWorker()
