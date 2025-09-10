'use client';

import { useState } from 'react';

export default function DevelopmentGuide() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      // html2pdf.js 동적 import
      const html2pdf = (await import('html2pdf.js')).default;
      
      const element = document.getElementById('development-guide');
      if (!element) return;

      const opt = {
        margin: 1,
        filename: 'work-schedule-next-개발환경가이드.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('PDF 생성 오류:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Work Schedule Next</h1>
              <p className="text-lg text-gray-600 mt-2">개발환경 가이드</p>
            </div>
            <button
              onClick={generatePDF}
              disabled={isGenerating}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {isGenerating ? 'PDF 생성 중...' : 'PDF 다운로드'}
            </button>
          </div>
        </div>

        {/* PDF 내용 */}
        <div id="development-guide" className="bg-white rounded-lg shadow-sm p-8">
          {/* 프로젝트 개요 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📋 프로젝트 개요</h2>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-gray-700 leading-relaxed">
                <strong>Work Schedule Next</strong>는 Next.js 기반의 근무 스케줄 관리 시스템입니다. 
                Firebase를 백엔드로 사용하여 실시간 데이터 동기화와 역할 기반 접근 제어를 제공합니다.
              </p>
            </div>
          </section>

          {/* 기술 스택 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🛠️ 기술 스택</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">프론트엔드</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• <strong>Next.js 15.5.2</strong> (App Router)</li>
                  <li>• <strong>TypeScript</strong></li>
                  <li>• <strong>Tailwind CSS</strong></li>
                  <li>• <strong>React Hooks</strong></li>
                </ul>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">백엔드 & 서비스</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• <strong>Firebase Firestore</strong> (데이터베이스)</li>
                  <li>• <strong>Firebase Auth</strong> (인증)</li>
                  <li>• <strong>Firebase Storage</strong> (파일 저장)</li>
                  <li>• <strong>html2pdf.js</strong> (PDF 생성)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 프로젝트 구조 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📁 프로젝트 구조</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
{`work-schedule-next/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx         # 전체 레이아웃
│   │   ├── page.tsx           # 메인 페이지
│   │   ├── globals.css        # 전역 스타일
│   │   ├── admin/             # 관리자 페이지
│   │   └── public/            # 공개 페이지
│   ├── components/            # React 컴포넌트
│   │   ├── Dashboard.tsx      # 메인 대시보드
│   │   ├── AuthForm.tsx       # 로그인/회원가입
│   │   ├── ScheduleManagement.tsx    # 스케줄 관리
│   │   ├── WeeklyScheduleView.tsx    # 주간 스케줄 보기
│   │   ├── MultiWeekScheduleView.tsx # 다중 주간 스케줄 입력
│   │   ├── EmployeeManagement.tsx    # 직원 관리
│   │   ├── BranchManagement.tsx      # 지점 관리
│   │   └── ReportManagement.tsx      # 보고서 관리
│   ├── lib/
│   │   └── firebase.ts        # Firebase 설정
│   └── scripts/
│       └── initTestData.ts    # 테스트 데이터 초기화
├── public/                    # 정적 파일
├── package.json              # 의존성 관리
├── next.config.ts            # Next.js 설정
├── tsconfig.json             # TypeScript 설정
├── tailwind.config.js        # Tailwind CSS 설정
└── .gitignore               # Git 무시 파일`}
              </pre>
            </div>
          </section>

          {/* 주요 기능 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">⚡ 주요 기능</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">🔐 인증 시스템</h3>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• 이메일/비밀번호 로그인</li>
                    <li>• 매니저 역할 기반 접근 제어</li>
                    <li>• 지점별 데이터 필터링</li>
                  </ul>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">📅 스케줄 관리</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 주간 보기: 시각적 주간 스케줄 표시</li>
                    <li>• 스케줄 입력: 다중 주간 텍스트 입력</li>
                    <li>• 달력 보기: 월별 달력 + 근무 내역</li>
                    <li>• 공유 기능: 읽기 전용 공개 링크</li>
                  </ul>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2">👥 직원 관리</h3>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• 직원 CRUD (생성, 읽기, 수정, 삭제)</li>
                    <li>• 재직/퇴사 상태 관리</li>
                    <li>• 재직증명서 PDF 자동 생성</li>
                    <li>• 근로계약서 히스토리 관리</li>
                  </ul>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-orange-900 mb-2">🏢 지점 & 보고서</h3>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• 지점 CRUD 및 매니저 할당</li>
                    <li>• 회사 정보 관리</li>
                    <li>• 직원별/지점별/전체 보고서</li>
                    <li>• 월별/연간 통계</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 데이터베이스 구조 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🗄️ 데이터베이스 구조</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Firestore Collections</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employees</h4>
                    <p className="text-gray-600">직원 정보, 지점 연결, 입사/퇴사일</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">branches</h4>
                    <p className="text-gray-600">지점 정보, 매니저 이메일, 회사 정보</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">schedules</h4>
                    <p className="text-gray-600">스케줄 데이터, 직원/지점 연결</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employmentContracts</h4>
                    <p className="text-gray-600">근로계약서 히스토리, 파일 정보</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 개발 워크플로우 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🔄 개발 워크플로우</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">로컬 개발</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• npm run dev</li>
                  <li>• npm run build</li>
                  <li>• npm run lint</li>
                </ul>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">배포 프로세스</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• GitHub 저장소</li>
                  <li>• Vercel 자동 배포</li>
                  <li>• Firebase 백엔드</li>
                </ul>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-2">품질 관리</h3>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• TypeScript 타입 안전성</li>
                  <li>• ESLint 코드 검사</li>
                  <li>• Prettier 코드 포맷팅</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 보안 및 권한 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🔒 보안 및 권한</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <h3 className="font-semibold text-red-900 mb-2">역할 기반 접근 제어</h3>
                <ul className="text-sm text-red-800 space-y-1">
                  <li>• <strong>관리자</strong>: 모든 기능 접근</li>
                  <li>• <strong>매니저</strong>: 할당된 지점만 관리</li>
                  <li>• <strong>공개</strong>: 읽기 전용 스케줄 보기</li>
                </ul>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-2">데이터 보안</h3>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Firebase 보안 규칙</li>
                  <li>• 클라이언트 사이드 검증</li>
                  <li>• 서버 사이드 권한 확인</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 성능 최적화 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">⚡ 성능 최적화</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">코드 분할</h3>
                <ul className="text-sm text-indigo-800 space-y-1">
                  <li>• Next.js 자동 코드 분할</li>
                  <li>• 동적 import 사용</li>
                  <li>• 컴포넌트 지연 로딩</li>
                </ul>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg">
                <h3 className="font-semibold text-teal-900 mb-2">데이터 최적화</h3>
                <ul className="text-sm text-teal-800 space-y-1">
                  <li>• Firebase 쿼리 최적화</li>
                  <li>• 클라이언트 사이드 필터링</li>
                  <li>• 실시간 업데이트 최소화</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 배포 환경 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🚀 배포 환경</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Vercel 설정</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 자동 GitHub 연동</li>
                  <li>• 환경 변수 관리</li>
                  <li>• 도메인 설정</li>
                  <li>• SSL 인증서 자동 적용</li>
                </ul>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Firebase 설정</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 프로덕션 데이터베이스</li>
                  <li>• 보안 규칙 설정</li>
                  <li>• 스토리지 버킷 구성</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 테스트 데이터 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🧪 테스트 데이터</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">샘플 데이터</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• <strong>지점</strong>: 청담장어마켓 송파점</li>
                <li>• <strong>직원</strong>: 6명 (이진영, 유은서, 권정희 등)</li>
                <li>• <strong>스케줄</strong>: 2025년 9월 8일 주간 샘플 데이터</li>
                <li>• <strong>초기화</strong>: /admin/init-data 페이지에서 실행 가능</li>
              </ul>
            </div>
          </section>

          {/* 마무리 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📝 마무리</h2>
            <div className="bg-blue-50 p-6 rounded-lg">
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Work Schedule Next</strong>는 현대적인 웹 기술을 활용하여 
                직관적이고 효율적인 근무 스케줄 관리 시스템을 제공합니다.
              </p>
              <p className="text-gray-700 leading-relaxed">
                이 가이드를 통해 프로젝트의 전체적인 구조와 기능을 이해하고, 
                향후 개발 및 유지보수에 활용하시기 바랍니다.
              </p>
            </div>
          </section>

          {/* 푸터 */}
          <footer className="border-t pt-6 mt-8">
            <div className="text-center text-sm text-gray-500">
              <p>Work Schedule Next - 개발환경 가이드</p>
              <p>생성일: {new Date().toLocaleDateString('ko-KR')}</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
