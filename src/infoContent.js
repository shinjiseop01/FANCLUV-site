// Static content for the info / policy pages (about, privacy, terms).
// Kept here (not in locale files) so the long-form copy stays readable.
// Each page: { titleKey, intro, sections: [{ h?, p?: [], ul?: [] }] }.

export const INFO_CONTENT = {
  about: {
    ko: {
      title: 'FANCLUV 소개',
      intro: 'FANCLUV는 K리그 팬들이 응원하는 구단에 대한 의견을 남기고, 설문에 참여하며, 팬들의 목소리를 데이터로 모아 구단에 전달하는 팬 의견 수집 플랫폼입니다.',
      sections: [
        { h: '주요 기능', ul: [
          '팬 의견 작성 — 경기장, 응원 문화, 티켓, MD 등 다양한 주제로 의견을 남길 수 있습니다.',
          '설문 참여 — 구단이 궁금해하는 주제에 응답하고 만족도를 표현합니다.',
          '팀 뉴스 — 응원 구단의 최신 소식을 확인합니다.',
          '경기센터 — 다가오는 경기 일정과 지난 경기 결과를 확인합니다.',
          'AI 인사이트 — 모인 팬 의견과 설문을 AI가 분석해 핵심 인사이트를 제공합니다.',
          '팬 랭킹 — 활동에 따라 팬 랭킹과 배지를 확인합니다.',
        ] },
        { h: 'FANCLUV의 목표', p: [
          '흩어져 있던 팬들의 목소리를 한곳에 모아, 구단 운영과 팬 경험 개선에 실질적으로 반영되도록 돕는 것이 FANCLUV의 목표입니다.',
        ] },
        { h: '팬 의견은 이렇게 활용됩니다', p: [
          '작성된 의견과 설문 응답은 카테고리별로 정리되고, AI 분석을 거쳐 핵심 주제와 만족도로 요약됩니다. 요약된 결과는 구단이 팬의 needs를 이해하고 의사결정에 참고할 수 있는 형태로 전달됩니다.',
          '※ 현재는 MVP 단계로, 일부 데이터는 예시(Mock)로 제공됩니다.',
        ] },
      ],
    },
    en: {
      title: 'About FANCLUV',
      intro: 'FANCLUV is a fan-opinion platform where K League fans share thoughts about their club, take part in surveys, and turn fan voices into data that is delivered to the club.',
      sections: [
        { h: 'Key features', ul: [
          'Write opinions — share thoughts on the stadium, supporter culture, tickets, merchandise and more.',
          'Take surveys — respond to topics the club wants to hear about and express your satisfaction.',
          'Team news — keep up with the latest news from your club.',
          'Match center — check upcoming fixtures and past results.',
          'AI insights — AI analyzes collected opinions and surveys to surface key insights.',
          'Fan ranking — see fan rankings and badges based on your activity.',
        ] },
        { h: 'Our goal', p: [
          'FANCLUV aims to gather scattered fan voices in one place so they can meaningfully inform club operations and improve the fan experience.',
        ] },
        { h: 'How fan opinions are used', p: [
          'Opinions and survey responses are organized by category and summarized into key themes and satisfaction levels through AI analysis. The summary is delivered in a form the club can reference when understanding fan needs and making decisions.',
          '※ This is an MVP, so some data is provided as examples (mock).',
        ] },
      ],
    },
  },

  privacy: {
    ko: {
      title: '개인정보처리방침',
      intro: '본 문서는 FANCLUV(이하 "서비스")가 이용자의 개인정보를 어떻게 수집·이용·보관하는지 안내하는 MVP 단계의 기본 문서입니다. 정식 서비스 시 관련 법령에 맞게 보완될 예정입니다.',
      sections: [
        { h: '1. 수집하는 정보', ul: [
          '이메일', '닉네임', '성별(선택)', '나이대', '응원팀', '작성한 의견', '댓글', '설문 응답',
        ] },
        { h: '2. 정보 이용 목적', p: [
          '회원 식별 및 로그인, 팬 의견·설문 데이터의 집계와 분석, 서비스 개선, 구단 전달용 통계 생성을 위해 이용합니다.',
        ] },
        { h: '3. 보관 및 삭제', p: [
          '수집된 정보는 서비스 제공 기간 동안 보관되며, 회원 탈퇴 또는 삭제 요청 시 지체 없이 파기합니다. (MVP 단계에서는 데이터가 이용자의 브라우저(localStorage)에 저장됩니다.)',
        ] },
        { h: '4. 제3자 제공', p: [
          '서비스는 이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 구단에 전달되는 자료는 개인을 식별할 수 없는 집계·통계 형태로만 제공됩니다.',
        ] },
        { h: '5. 이용자의 권리', p: [
          '이용자는 자신의 정보에 대한 열람·수정·삭제를 요청할 수 있으며, 프로필 설정에서 닉네임·프로필 이미지 등을 직접 변경할 수 있습니다.',
        ] },
        { h: '6. 문의', p: [
          '개인정보 관련 문의는 support@fancluv.kr 로 연락해 주세요.',
        ] },
      ],
    },
    en: {
      title: 'Privacy Policy',
      intro: 'This is a basic MVP-stage document describing how FANCLUV (the "Service") collects, uses and stores user information. It will be expanded to meet legal requirements for the full service.',
      sections: [
        { h: '1. Information we collect', ul: [
          'Email', 'Nickname', 'Gender (optional)', 'Age group', 'Supported club', 'Opinions you write', 'Comments', 'Survey responses',
        ] },
        { h: '2. Purpose of use', p: [
          'Member identification and login, aggregation and analysis of opinion/survey data, service improvement, and generation of statistics delivered to clubs.',
        ] },
        { h: '3. Retention and deletion', p: [
          'Collected information is retained while the service is provided and is destroyed without delay upon withdrawal or a deletion request. (At the MVP stage, data is stored in the user\'s browser via localStorage.)',
        ] },
        { h: '4. Third-party sharing', p: [
          'The Service does not sell or provide your personal information to outside parties. Material delivered to clubs is provided only as aggregated, non-identifiable statistics.',
        ] },
        { h: '5. Your rights', p: [
          'You may request access to, correction of, or deletion of your information, and can change your nickname, profile image and more directly in profile settings.',
        ] },
        { h: '6. Contact', p: [
          'For privacy inquiries, please contact support@fancluv.kr.',
        ] },
      ],
    },
  },

  terms: {
    ko: {
      title: '이용약관',
      intro: '본 약관은 FANCLUV(이하 "서비스") 이용에 관한 기본 사항을 안내하는 MVP 단계 문서입니다.',
      sections: [
        { h: '1. 서비스 목적', p: [
          'FANCLUV는 K리그 팬들이 의견과 설문으로 목소리를 남기고, 이를 데이터로 모아 구단에 전달하는 것을 목적으로 합니다.',
        ] },
        { h: '2. 회원가입 및 계정', p: [
          '이메일 인증을 거쳐 회원가입을 완료할 수 있으며, 계정 정보는 정확하게 입력·관리해야 합니다. 계정 도용 및 부정 사용은 금지됩니다.',
        ] },
        { h: '3. 팬 의견 작성 규칙', p: [
          '의견과 댓글은 건설적이고 서로 존중하는 태도로 작성해 주세요. 사실에 근거한 의견은 구단에 더 큰 도움이 됩니다.',
        ] },
        { h: '4. 금지 행위', ul: [
          '욕설·비방·차별·혐오 표현',
          '허위 사실 유포',
          '스팸·광고·도배',
          '타인의 권리 침해 및 개인정보 노출',
          '서비스 운영을 방해하는 행위',
        ] },
        { h: '5. 게시글 숨김/삭제 기준', p: [
          '금지 행위에 해당하거나 신고가 누적된 게시글은 운영자가 숨김 또는 삭제 처리할 수 있습니다.',
        ] },
        { h: '6. 서비스 변경 및 중단', p: [
          '서비스는 개선을 위해 기능이 변경되거나 일시 중단될 수 있으며, 중요한 변경은 사전에 안내하도록 노력합니다.',
        ] },
        { h: '7. 책임 제한', p: [
          'MVP 단계의 서비스로서 제공되는 일부 데이터는 예시(Mock)일 수 있으며, 서비스 이용으로 발생한 손해에 대해 관련 법령이 허용하는 범위에서 책임을 제한합니다.',
        ] },
        { h: '8. 문의', p: [
          '약관 관련 문의는 support@fancluv.kr 로 연락해 주세요.',
        ] },
      ],
    },
    en: {
      title: 'Terms of Service',
      intro: 'These terms are an MVP-stage document outlining the basics of using FANCLUV (the "Service").',
      sections: [
        { h: '1. Purpose of the service', p: [
          'FANCLUV exists so K League fans can voice opinions and survey responses, which are gathered as data and delivered to clubs.',
        ] },
        { h: '2. Sign-up and accounts', p: [
          'You can complete sign-up after email verification, and must enter and manage account information accurately. Account theft and fraudulent use are prohibited.',
        ] },
        { h: '3. Opinion writing rules', p: [
          'Please write opinions and comments constructively and with mutual respect. Fact-based opinions are more helpful to clubs.',
        ] },
        { h: '4. Prohibited conduct', ul: [
          'Profanity, slander, discrimination or hate speech',
          'Spreading false information',
          'Spam, advertising or flooding',
          'Infringing others\' rights or exposing personal information',
          'Disrupting the operation of the service',
        ] },
        { h: '5. Hiding/removing posts', p: [
          'Posts that violate the prohibited-conduct rules or accumulate reports may be hidden or deleted by administrators.',
        ] },
        { h: '6. Changes and suspension', p: [
          'Features may change or be temporarily suspended for improvement, and we will try to give advance notice of important changes.',
        ] },
        { h: '7. Limitation of liability', p: [
          'As an MVP-stage service, some provided data may be examples (mock), and liability for damages arising from use of the service is limited to the extent permitted by applicable law.',
        ] },
        { h: '8. Contact', p: [
          'For inquiries about these terms, please contact support@fancluv.kr.',
        ] },
      ],
    },
  },
}

export function getInfo(page, lang) {
  const entry = INFO_CONTENT[page]
  if (!entry) return null
  return entry[lang] || entry.ko
}
