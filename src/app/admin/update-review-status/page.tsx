'use client';

import React, { useState } from 'react';
import { runUpdateReviewStatusScript } from '@/scripts/updateReviewStatusForConfirmedPayrolls';

export default function UpdateReviewStatusPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string>('');

  const handleUpdateReviewStatus = async () => {
    setIsRunning(true);
    setResult('업데이트 중...');
    
    try {
      await runUpdateReviewStatusScript();
      setResult('✅ employeeReviewStatus 업데이트가 완료되었습니다.');
    } catch (error) {
      console.error('업데이트 실패:', error);
      setResult(`❌ 업데이트 실패: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">급여확정완료 직원 ReviewStatus 업데이트</h1>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">⚠️ 주의사항</h2>
        <ul className="text-yellow-700 space-y-1">
          <li>• 이 작업은 confirmedPayrolls에 데이터가 있는 모든 직원의 employeeReviewStatus를 &quot;급여확정완료&quot;로 변경합니다.</li>
          <li>• 기존 상태가 &quot;급여확정완료&quot;가 아닌 경우에만 업데이트됩니다.</li>
          <li>• employeeReviewStatus에 해당 직원의 데이터가 없으면 새로 생성됩니다.</li>
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-2">📋 작업 내용</h2>
        <ol className="text-blue-700 space-y-1">
          <li>1. confirmedPayrolls 컬렉션에서 모든 급여확정 데이터 조회</li>
          <li>2. 각 직원별로 employeeReviewStatus 조회</li>
          <li>3. 상태가 &quot;급여확정완료&quot;가 아닌 경우 업데이트</li>
          <li>4. 해당 직원의 데이터가 없으면 새로 생성</li>
        </ol>
      </div>

      <button
        onClick={handleUpdateReviewStatus}
        disabled={isRunning}
        className={`px-6 py-3 rounded-lg font-semibold ${
          isRunning
            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-700 text-white'
        }`}
      >
        {isRunning ? '업데이트 중...' : 'ReviewStatus 업데이트 실행'}
      </button>

      {result && (
        <div className={`mt-6 p-4 rounded-lg ${
          result.includes('✅') 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}
    </div>
  );
}
