'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function AuthForm() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 기존 계정들은 기존 방식 유지
      if (userId === 'drawing555') {
        const email = 'drawing555@naver.com';
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }
      
      // 기존 계정들을 임시로 특별 처리
      const legacyAccounts = ['yes0619', 'cdeel_dt'];
      if (legacyAccounts.includes(userId)) {
        // 여러 가능한 이메일 형식을 시도
        const possibleEmails = [
          `${userId}@naver.com`,
          `${userId}@gmail.com`, 
          `${userId}@workschedule.local`
        ];
        
        // 첫 번째로 성공하는 이메일 사용
        for (const testEmail of possibleEmails) {
          try {
            await signInWithEmailAndPassword(auth, testEmail, password);
            return; // 성공하면 함수 종료
          } catch (error) {
            console.log(`${testEmail} 로그인 실패, 다음 시도...`);
          }
        }
        
        // 모든 기존 이메일 실패시 매니저 계정으로 시도
        console.log('기존 이메일 형식 모두 실패, 매니저 계정으로 시도...');
      }
      
      // 기타 계정들은 매니저 계정 DB에서 확인
      const managerAccountsSnapshot = await getDocs(collection(db, 'managerAccounts'));
      const managerAccount = managerAccountsSnapshot.docs.find(doc => {
        const data = doc.data();
        return data.userId === userId && data.password === password && data.isActive;
      });
      
      if (!managerAccount) {
        alert('등록되지 않은 계정이거나 아이디/비밀번호가 틀렸습니다.');
        return;
      }
      
      // 매니저 계정이 확인되면 Firebase Auth로 로그인
      // 각 매니저 계정마다 고유한 이메일 생성
      const email = `${userId}@manager.workschedule.local`;
      const firebasePassword = 'workschedule_manager_2024'; // 모든 매니저 공통 Firebase 비밀번호
      
      try {
        // 기존 Firebase Auth 계정으로 로그인 시도
        await signInWithEmailAndPassword(auth, email, firebasePassword);
      } catch (authError) {
        console.log('Firebase 계정이 없어서 생성합니다...');
        // Firebase Auth 계정이 없으면 생성 후 로그인
        await createUserWithEmailAndPassword(auth, email, firebasePassword);
      }
      
    } catch (error) {
      console.error('인증 오류:', error);
      alert('로그인에 실패했습니다. 관리자에게 문의하세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            로그인
          </h2>
          <p className="text-sm text-gray-600">
            근무 스케줄 관리 시스템
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                아이디
              </label>
              <input
                type="text"
                placeholder="아이디를 입력하세요"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
          
        </div>
      </div>
    </div>
  );
}