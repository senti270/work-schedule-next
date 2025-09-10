'use client';

import { useState } from 'react';
import { initTestData, clearAllData } from '@/scripts/initTestData';

export default function InitDataPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInitData = async () => {
    setLoading(true);
    setMessage('데이터 초기화 중...');
    
    try {
      await initTestData();
      setMessage('청담장어마켓 송파점 테스트 데이터 초기화 완료!');
    } catch (error) {
      setMessage('오류 발생: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    setLoading(true);
    setMessage('데이터 삭제 중...');
    
    try {
      await clearAllData();
      setMessage('모든 데이터 삭제 완료!');
    } catch (error) {
      setMessage('오류 발생: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            테스트 데이터 관리
          </h1>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">
                청담장어마켓 송파점 테스트 데이터
              </h2>
              <p className="text-blue-700 text-sm mb-4">
                다음 데이터가 추가됩니다:
              </p>
              <ul className="text-blue-700 text-sm space-y-1 ml-4">
                <li>• 지점: 청담장어마켓 송파점</li>
                <li>• 직원: 김아잉, 나인, 박영미, 빠잉, 실장님, 양현아</li>
                <li>• 2025년 9월 8일 주간 스케줄</li>
              </ul>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleInitData}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '처리 중...' : '테스트 데이터 초기화'}
              </button>
              
              <button
                onClick={handleClearData}
                disabled={loading}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '처리 중...' : '모든 데이터 삭제'}
              </button>
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('완료') 
                  ? 'bg-green-50 text-green-700' 
                  : message.includes('오류') 
                    ? 'bg-red-50 text-red-700'
                    : 'bg-yellow-50 text-yellow-700'
              }`}>
                {message}
              </div>
            )}

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                주의사항:
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 이 작업은 기존 데이터를 모두 삭제합니다</li>
                <li>• 테스트 목적으로만 사용하세요</li>
                <li>• 실제 운영 데이터가 있다면 백업 후 실행하세요</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
