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
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
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
              <h1 className="text-3xl font-bold text-gray-900">근무시간 관리 시스템</h1>
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
                근무시간 스케줄링, 실제 근무시간 비교, 급여계산을 통합 관리하는 시스템입니다.
                Next.js와 Firebase를 기반으로 한 현대적인 웹 애플리케이션입니다.
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
                  <li>• <strong>React 19.1.0</strong></li>
                  <li>• <strong>TypeScript 5</strong></li>
                  <li>• <strong>Tailwind CSS 4.1.12</strong></li>
                </ul>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">백엔드 & 서비스</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• <strong>Firebase Firestore 12.2.1</strong> (데이터베이스)</li>
                  <li>• <strong>Firebase Auth</strong> (인증)</li>
                  <li>• <strong>Firebase Storage</strong> (파일 저장)</li>
                  <li>• <strong>jsPDF, html2pdf.js</strong> (PDF 생성)</li>
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
│   │   │   ├── bank-codes/    # 은행코드 관리
│   │   │   └── init-data/     # 초기 데이터 설정
│   │   ├── development-guide/ # 개발가이드 페이지
│   │   └── public/            # 공개 페이지
│   │       └── schedule/      # 공개 스케줄 보기
│   ├── components/            # React 컴포넌트
│   │   ├── Dashboard.tsx      # 메인 대시보드
│   │   ├── AuthForm.tsx       # 로그인/회원가입
│   │   ├── ScheduleInputNew.tsx # 스케줄 입력 (신규)
│   │   ├── ScheduleManagement.tsx # 스케줄 관리
│   │   ├── WeeklyScheduleView.tsx # 주간 스케줄 보기
│   │   ├── MultiWeekScheduleView.tsx # 다주간 스케줄 입력
│   │   ├── EmployeeManagement.tsx # 직원 관리
│   │   ├── WorkTimeComparison.tsx # 근무시간 비교
│   │   ├── PayrollCalculation.tsx # 급여계산
│   │   ├── BranchManagement.tsx # 지점 관리
│   │   ├── ReportManagement.tsx # 보고서 관리
│   │   ├── FormManagement.tsx # 양식 관리
│   │   └── ManagerAccountManagement.tsx # 관리자 계정 관리
│   ├── lib/                   # 라이브러리
│   │   ├── firebase.ts        # Firebase 설정
│   │   └── holidays.ts        # 휴일 관리
│   └── scripts/               # 스크립트
│       ├── initTestData.ts    # 테스트 데이터 초기화
│       ├── initBankCodes.ts   # 은행코드 초기화
│       └── addBankCodes.ts    # 은행코드 추가
├── public/                    # 정적 파일
├── package.json              # 의존성 관리
├── next.config.ts            # Next.js 설정
├── tsconfig.json             # TypeScript 설정
└── tailwind.config.js        # Tailwind CSS 설정`}
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
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2">👥 직원 관리</h3>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• 직원 CRUD (생성, 읽기, 수정, 삭제)</li>
                    <li>• 재직/퇴사 상태 관리</li>
                    <li>• 근로계약서 히스토리 관리</li>
                    <li>• 고용형태별 급여 계산</li>
                  </ul>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-orange-900 mb-2">⏰ 근무시간 비교</h3>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• 스케줄 vs 실제 근무시간 비교</li>
                    <li>• 실근무시간 직접 편집</li>
                    <li>• 검토 상태 관리 (검토전/검토중/검토완료)</li>
                    <li>• 지점별 독립적 데이터 관리</li>
                  </ul>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-red-900 mb-2">💰 급여계산</h3>
                  <ul className="text-sm text-red-800 space-y-1">
                    <li>• 다지점 근무시간 통합 계산</li>
                    <li>• 해당 월 유효 시급으로 계산</li>
                    <li>• 급여확정 시 모든 금액값 DB 저장</li>
                    <li>• 급여메모 통합 관리</li>
                  </ul>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-indigo-900 mb-2">🏢 지점 & 보고서</h3>
                  <ul className="text-sm text-indigo-800 space-y-1">
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
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">actualWorkRecords</h4>
                    <p className="text-gray-600">실제 근무 기록, 비교 데이터</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">workTimeComparisonResults</h4>
                    <p className="text-gray-600">근무시간 비교 결과, 차이점 분석</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employeeReviewStatus</h4>
                    <p className="text-gray-600">직원별 검토 상태 관리</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employeeMemos</h4>
                    <p className="text-gray-600">직원별 급여메모 (통합 관리)</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">confirmedPayrolls</h4>
                    <p className="text-gray-600">급여확정 기록 (변경 불가)</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">overtimeRecords</h4>
                    <p className="text-gray-600">연장근무 기록, 이월 시간</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employeeBranches</h4>
                    <p className="text-gray-600">직원-지점 연결 관계</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">weeklyNotes</h4>
                    <p className="text-gray-600">주간 노트, 공유 링크</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">payrollLocks</h4>
                    <p className="text-gray-600">급여 처리 잠금 상태</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">managerAccounts</h4>
                    <p className="text-gray-600">매니저 계정 정보</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">comments</h4>
                    <p className="text-gray-600">댓글 시스템</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">formDocuments</h4>
                    <p className="text-gray-600">양식 문서 관리</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">bankCodes</h4>
                    <p className="text-gray-600">은행 코드 정보</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">employeeMonthlyStats</h4>
                    <p className="text-gray-600">직원 월별 통계 (캐시)</p>
                  </div>
                </div>
              </div>
            </div>
          </section>


          {/* 데이터 흐름 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🔄 데이터 흐름</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">1. 스케줄 입력 → 근무시간 비교</h3>
                <ol className="text-sm text-gray-700 space-y-1 ml-4">
                  <li>1. 스케줄 입력</li>
                  <li>2. 실제 근무 데이터 입력 (POS 데이터 파싱)</li>
                  <li>3. 근무시간 비교 실행</li>
                  <li>4. 차이점 확인 및 수정</li>
                  <li>5. 검토완료 상태로 변경</li>
                </ol>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">2. 근무시간 비교 → 급여계산</h3>
                <ol className="text-sm text-gray-700 space-y-1 ml-4">
                  <li>1. 모든 지점의 검토완료 확인</li>
                  <li>2. 직원 선택 (검토완료된 직원만)</li>
                  <li>3. 해당 월에 유효한 시급으로 계산</li>
                  <li>4. 지점별 근무시간 합산</li>
                  <li>5. 급여확정 (모든 금액값 DB 저장)</li>
                </ol>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">3. 급여메모 관리</h3>
                <ol className="text-sm text-gray-700 space-y-1 ml-4">
                  <li>1. 급여계산작업 또는 근무시간비교에서 메모 입력</li>
                  <li>2. 실시간 로컬 상태 업데이트</li>
                  <li>3. 포커스 해제 시 DB 저장</li>
                  <li>4. 모든 화면에서 동일한 메모 표시</li>
                </ol>
              </div>
            </div>
          </section>

          {/* 주의사항 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🚨 주의사항</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <h3 className="font-semibold text-red-900 mb-2">데이터 무결성</h3>
                <ul className="text-sm text-red-800 space-y-1">
                  <li>• 급여확정 후 변경 불가</li>
                  <li>• 시급 변경 영향 없음</li>
                  <li>• 계약서 기간 확인 필수</li>
                </ul>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-2">한글 입력 처리</h3>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• onBlur 저장으로 조합 중복 방지</li>
                  <li>• onChange로 실시간 표시</li>
                </ul>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">지점별 분리</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• 독립적 데이터 관리</li>
                  <li>• 상태 독립 관리</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 개발 환경 설정 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🛠️ 개발 환경 설정</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">실행 명령어</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• <code>npm install</code> - 의존성 설치</li>
                  <li>• <code>npm run dev</code> - 개발 서버 실행 (Turbopack)</li>
                  <li>• <code>npm run build</code> - 프로덕션 빌드</li>
                  <li>• <code>npm run start</code> - 프로덕션 서버 실행</li>
                  <li>• <code>npm run lint</code> - ESLint 실행</li>
                </ul>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">초기 데이터 설정</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• <code>npm run init-test-data</code> - 테스트 데이터 초기화</li>
                  <li>• <code>npm run init-bank-codes</code> - 은행코드 초기화</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 성능 최적화 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">⚡ 성능 최적화</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">데이터 로딩</h3>
                <ul className="text-sm text-indigo-800 space-y-1">
                  <li>• 지점별 필터링</li>
                  <li>• 월별 필터링</li>
                  <li>• 중복 데이터 정리</li>
                </ul>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg">
                <h3 className="font-semibold text-teal-900 mb-2">사용자 경험</h3>
                <ul className="text-sm text-teal-800 space-y-1">
                  <li>• 실시간 저장</li>
                  <li>• 명확한 상태 표시</li>
                  <li>• 조건부 활성화</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 마무리 */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📝 마무리</h2>
            <div className="bg-blue-50 p-6 rounded-lg">
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>근무시간 관리 시스템</strong>은 현대적인 웹 기술을 활용하여 
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
              <p>근무시간 관리 시스템 - 개발환경 가이드</p>
              <p>생성일: {new Date().toLocaleDateString('ko-KR')}</p>
              <p>버전: 1.0 | 마지막 업데이트: 2025년 1월</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}