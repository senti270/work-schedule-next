This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```env
# 이메일 전송 설정 (Gmail 사용)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Firebase 설정
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCahLcE9AibVxzwYX8xqDr_SzTP3-vhtjo
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=workschedule-8fc6f.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=workschedule-8fc6f
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=workschedule-8fc6f.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=860832451
NEXT_PUBLIC_FIREBASE_APP_ID=1:860832451:web:21754e4c80bcc6f752d6fe
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-FE573RCHWZ
```

**이메일 설정 방법:**
1. Gmail 계정에서 2단계 인증 활성화
2. Google 계정 설정 > 보안 > 2단계 인증 > 앱 비밀번호 생성
3. 생성된 앱 비밀번호를 `EMAIL_PASS`에 입력

### 개발 서버 실행

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
