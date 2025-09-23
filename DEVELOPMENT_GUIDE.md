# 근무시간 관리 시스템 개발가이드

## 📋 프로젝트 개요
근무시간 스케줄링, 실제 근무시간 비교, 급여계산을 통합 관리하는 시스템입니다.

## 🏗️ 프로젝트 구조

```
work-schedule-next/
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
└── tailwind.config.js        # Tailwind CSS 설정
```

## 🏗️ 시스템 아키텍처

### 기술 스택
- **Frontend**: Next.js 15.5.2, React 19.1.0, TypeScript 5
- **Backend**: Firebase Firestore 12.2.1
- **UI**: Tailwind CSS 4.1.12
- **PDF 생성**: jsPDF, html2pdf.js, html2canvas
- **개발환경**: Turbopack

### 주요 컴포넌트
- `Dashboard.tsx`: 메인 대시보드 (탭 기반 네비게이션)
- `ScheduleInputNew.tsx`: 스케줄 입력 (신규 버전)
- `WorkTimeComparison.tsx`: 근무시간 비교
- `PayrollCalculation.tsx`: 급여계산
- `EmployeeManagement.tsx`: 직원 관리 (근로계약서 포함)
- `BranchManagement.tsx`: 지점 관리
- `ReportManagement.tsx`: 보고서 관리
- `AuthForm.tsx`: 인증 시스템

## 🗄️ 데이터베이스 구조

### 주요 컬렉션

#### 1. `employees` - 직원 정보
```typescript
{
  id: string;
  name: string;
  type: string; // '근로소득자', '사업소득자', '일용직', '외국인'
  branchId: string;
  weeklyWorkHours?: number; // 기본값 40
}
```

#### 2. `employmentContracts` - 근로계약서
```typescript
{
  id: string;
  employeeId: string;
  employmentType: '근로소득' | '사업소득' | '일용직' | '외국인';
  salaryType: 'hourly' | 'monthly';
  salaryAmount: number; // 시급 또는 월급
  weeklyWorkHours: number; // 기본값 40
  startDate: Date;
  endDate?: Date; // 종료일이 없으면 현재까지 유효
  contractFile?: string; // Base64 또는 Storage URL
  contractFileName?: string;
}
```

#### 3. `schedules` - 스케줄
```typescript
{
  id: string;
  employeeId: string;
  branchId: string;
  date: Date;
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  breakTime: number; // 휴게시간 (시간 단위)
}
```

#### 4. `actualWorkRecords` - 실제 근무 기록
```typescript
{
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  month: string; // "2025-09"
  date: string; // "2025-09-15"
  scheduledHours: number;
  actualHours: number;
  actualWorkHours: number; // actualHours - breakTime
  breakTime: number;
  difference: number; // actualHours - scheduledHours
  status: 'time_match' | 'review_required' | 'review_completed';
  scheduledTimeRange: string; // "09:00-18:00"
  actualTimeRange: string; // "09:05-18:10"
  isModified: boolean;
  modifiedAt?: Date;
}
```

#### 5. `employeeReviewStatus` - 직원별 검토 상태
```typescript
{
  id: string;
  employeeId: string;
  month: string; // "2025-09"
  branchId: string;
  status: '검토전' | '검토중' | '검토완료';
  updatedAt: Date;
}
```

#### 6. `employeeMemos` - 직원별 급여메모
```typescript
{
  id: string;
  employeeId: string;
  month: string; // "2025-09"
  memo: string;
  updatedAt: Date;
}
```

#### 7. `payrollRecords` - 급여확정 기록
```typescript
{
  id: string;
  employeeId: string;
  employeeName: string;
  month: string; // "2025-09"
  branchId: string;
  
  // 계산된 금액값 (변경 불가)
  totalWorkHours: number;
  hourlyWage: number; // 해당 월에 유효했던 시급
  monthlySalary: number;
  actualPayment: number;
  
  // 지점별 근무시간 상세
  branchWorkHours: Array<{
    branchId: string;
    branchName: string;
    workHours: number;
    reviewStatus: '검토전' | '검토중' | '검토완료';
  }>;
  
  // 급여 계산 근거
  calculationBasis: {
    employmentType: string;
    salaryType: string;
    weeklyWorkHours: number;
    taxRate: number; // 외국인 3.3%
    calculationDate: Date;
  };
  
  status: 'confirmed';
  confirmedAt: Date;
  confirmedBy: string;
  version: string;
}
```

#### 8. `overtimeRecords` - 연장근무 기록
```typescript
{
  id: string;
  employeeId: string;
  weekStart: Date;
  accumulatedOvertime: number;
  createdAt: Date;
}
```

## 🔧 주요 기능

### 1. 인증 시스템 (AuthForm.tsx)
- **이메일/비밀번호 로그인**: Firebase Authentication
- **관리자 역할 기반 접근 제어**: Manager 권한 관리
- **지점별 데이터 필터링**: 사용자별 지점 권한

### 2. 직원 관리 (EmployeeManagement.tsx)

#### 근로계약서 관리
- **파일 업로드**: Base64 또는 Firebase Storage
- **계약 정보**: 고용형태, 시급/월급, 주간근무시간
- **히스토리 관리**: 계약서 다운로드, 수정, 삭제
- **자동 저장**: 주간근무시간 기본값 40시간
- **콤마 포맷팅**: 급여 입력 시 자동 콤마 표시

#### 고용형태별 급여 계산 방식
- **근로소득**: 4대보험, 시급/월급 선택
- **사업소득**: 3.3% 세금, 시급/월급 선택
- **일용직**: 세금 없음, 시급만
- **외국인**: 3.3% 세금, 시급만

### 3. 스케줄 관리

#### ScheduleInputNew.tsx (신규 버전)
- **다주간 스케줄 입력**: 텍스트 기반 일괄 입력
- **POS 데이터 파싱**: 실제 근무시간 자동 파싱
- **휴일 관리**: holidays.ts를 통한 휴일 처리

#### WeeklyScheduleView.tsx
- **주간 뷰**: 시각적 주간 스케줄 표시
- **스케줄 입력**: 개별 시간 입력

#### MultiWeekScheduleView.tsx
- **다주간 뷰**: 여러 주간 스케줄 관리
- **공개 링크**: 읽기 전용 공개 스케줄 보기

### 4. 근무시간 비교 (WorkTimeComparison.tsx)

#### 상태 관리
- **검토전**: 비교 데이터 없음
- **검토중**: 비교 작업 진행 중
- **검토완료**: 모든 비교 항목 확인완료

#### 작업 기능
- **실근무시간 직접 편집**: 팝업 없이 인라인 편집
- **확인/확인취소**: 상태 변경 및 저장
- **스케줄시간복사**: 확인 전에만 활성화
- **검토완료**: 모든 항목 확인완료 시 활성화
- **전월 이월 연장근무시간**: 근로소득, 사업소득자만 입력

#### 급여메모 통합
- **실시간 편집**: 근무시간 비교에서도 급여메모 편집 가능
- **자동저장**: 포커스 해제 시 저장 (한글 입력 문제 해결)
- **통합 관리**: 급여계산작업과 동일한 메모 공유

#### 지점별 분리
- **독립적 데이터**: 각 지점별로 근무시간 비교 데이터 분리
- **상태 독립**: 지점별로 검토 상태 독립 관리

### 5. 급여계산 (PayrollCalculation.tsx)

#### 직원 선택 조건
- **검토완료만 선택 가능**: 근무시간 비교가 완료된 직원만
- **상태 표시**: 
  - 💰 급여계산작업중 (검토완료)
  - 🔄 근무시간 작업중 (검토중)
  - ⏳ 비교작업필요 (검토전)

#### 다지점 근무 지원
- **통합 계산**: 모든 지점의 근무시간 합산
- **지점별 표시**: 각 지점별 근무시간과 상태 표시
- **미집계 체크**: 미집계 지점이 있으면 급여확정 비활성화

#### 시급 계산 로직
- **해당 월 유효 시급**: 급여계산 시점의 시급이 아닌 해당 월에 유효했던 시급 사용
- **계약서 기간 확인**: 시작일~종료일 범위로 유효한 계약서 선별
- **Fallback**: 해당 월에 유효한 계약서가 없으면 최신 계약서 사용

#### 급여확정 데이터 저장
- **변경 불가 금액**: 모든 계산된 금액값을 DB에 저장
- **계산 근거**: 고용형태, 시급, 세율 등 모든 계산 근거 저장
- **감사 추적**: 확정 시점, 확정자, 버전 정보 저장

### 6. 지점 & 보고서 관리

#### BranchManagement.tsx
- **지점 CRUD**: 지점 생성, 수정, 삭제
- **관리자 배정**: 지점별 관리자 계정 연결
- **회사 정보 관리**: 회사 기본 정보 설정

#### ReportManagement.tsx
- **직원별 보고서**: 개별 직원 근무 현황
- **지점별 보고서**: 지점별 통계 및 현황
- **전체 보고서**: 회사 전체 통계
- **월별/연간 통계**: 기간별 분석

#### FormManagement.tsx
- **양식 관리**: 각종 업무 양식 관리
- **PDF 생성**: jsPDF를 통한 문서 생성

#### ManagerAccountManagement.tsx
- **관리자 계정 관리**: 관리자 계정 CRUD
- **권한 관리**: 지점별 접근 권한 설정

### 7. 급여메모 시스템

#### 통합 관리
- **월별 직원당 하나**: 다지점 근무해도 통합된 메모
- **실시간 동기화**: 모든 화면에서 동일한 메모 공유
- **자동저장**: 별도 저장 버튼 없이 자동 저장

#### 표시 위치
- **급여계산작업**: 급여확정 버튼 아래
- **근무시간비교**: 비교결과 테이블 아래

## 🔄 데이터 흐름

### 1. 스케줄 입력 → 근무시간 비교
1. 스케줄 입력
2. 실제 근무 데이터 입력 (POS 데이터 파싱)
3. 근무시간 비교 실행
4. 차이점 확인 및 수정
5. 검토완료 상태로 변경

### 2. 근무시간 비교 → 급여계산
1. 모든 지점의 검토완료 확인
2. 직원 선택 (검토완료된 직원만)
3. 해당 월에 유효한 시급으로 계산
4. 지점별 근무시간 합산
5. 급여확정 (모든 금액값 DB 저장)

### 3. 급여메모 관리
1. 급여계산작업 또는 근무시간비교에서 메모 입력
2. 실시간 로컬 상태 업데이트
3. 포커스 해제 시 DB 저장
4. 모든 화면에서 동일한 메모 표시

## 🚨 주의사항

### 데이터 무결성
- **급여확정 후 변경 불가**: 급여는 돈이 지급되는 것이므로 확정 후 절대 변경되지 않음
- **시급 변경 영향 없음**: 과거 급여는 해당 시점의 시급으로 계산되어 저장됨
- **계약서 기간 확인**: 급여계산 시 해당 월에 유효했던 계약서만 사용

### 한글 입력 처리
- **onBlur 저장**: 한글 조합 중인 문자가 중복 저장되지 않도록 포커스 해제 시 저장
- **실시간 표시**: onChange로 로컬 상태는 실시간 업데이트

### 지점별 분리
- **독립적 데이터**: 각 지점의 데이터는 완전히 분리되어 관리
- **상태 독립**: 지점별로 검토 상태가 독립적으로 관리

## 🛠️ 개발 환경 설정

### 필수 요구사항
- Node.js 18+
- Firebase 프로젝트 설정
- Firestore 데이터베이스

### 실행 명령어
```bash
npm install
npm run dev          # 개발 서버 실행 (Turbopack)
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버 실행
npm run lint         # ESLint 실행
```

### 환경 변수
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 초기 데이터 설정
```bash
# 테스트 데이터 초기화
npm run init-test-data

# 은행코드 초기화
npm run init-bank-codes
```

## 📊 성능 최적화

### 데이터 로딩
- **지점별 필터링**: 모든 쿼리에 branchId 필터 적용
- **월별 필터링**: 데이터 범위를 월별로 제한
- **중복 데이터 정리**: 자동으로 중복 레코드 정리

### 사용자 경험
- **실시간 저장**: 급여메모 자동저장
- **상태 표시**: 명확한 상태 표시로 사용자 혼란 방지
- **조건부 활성화**: 작업 상태에 따른 버튼 활성화/비활성화

## 🔍 디버깅

### 콘솔 로그
- 급여계산 과정 상세 로그
- 검토 상태 변경 로그
- 메모 저장/로드 로그
- 시급 계산 로직 로그

### 주요 체크포인트
1. 지점별 데이터 분리 확인
2. 급여메모 동기화 확인
3. 시급 계산 로직 확인
4. 급여확정 데이터 저장 확인

---

**마지막 업데이트**: 2025년 1월
**버전**: 1.0
