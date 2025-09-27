import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "드로잉컴퍼니 스케줄 관리",
  description: "드로잉컴퍼니 직원 스케줄 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {children}
        
        {/* 모바일 PC 최적화 안내 메시지 (하단 고정) */}
        <div className="fixed bottom-0 left-0 right-0 bg-blue-600 text-white text-center py-2 px-4 z-50 md:hidden">
          <p className="text-sm font-medium">
            💻 본 시스템은 PC화면에서 최적화되어있습니다
          </p>
        </div>
        
        {/* Footer */}
        <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <a
                  href="/development-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  개발가이드
                </a>
              </div>
              <div className="text-sm text-gray-600">
                시스템 관련 문의: 
                <a
                  href="tel:010-9741-7415"
                  className="ml-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  010-9741-7415
                </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
