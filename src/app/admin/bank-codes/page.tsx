'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface BankCode {
  id: string;
  name: string;
  code: string;
  createdAt: Date;
}

const bankCodesData = [
  { name: '국민은행', code: '004' },
  { name: '신한은행', code: '088' },
  { name: '우리은행', code: '020' },
  { name: '하나은행', code: '081' },
  { name: '농협은행', code: '011' },
  { name: '기업은행', code: '003' },
  { name: '카카오뱅크', code: '090' },
  { name: '케이뱅크', code: '089' },
  { name: 'SC제일은행', code: '023' },
  { name: '한국씨티은행', code: '027' },
  { name: '부산은행', code: '032' },
  { name: '대구은행', code: '031' },
  { name: '경남은행', code: '039' },
  { name: '광주은행', code: '034' },
  { name: '전북은행', code: '037' },
  { name: '제주은행', code: '035' },
  { name: '수협은행', code: '007' },
  { name: '우체국', code: '071' },
  { name: '새마을금고', code: '045' },
  { name: '신협', code: '048' },
  { name: '산업은행', code: '002' },
  { name: '한국은행', code: '001' },
  { name: '저축은행중앙회', code: '050' },
  { name: 'HSBC은행', code: '054' },
  { name: '도이치은행', code: '055' }
];

export default function BankCodesPage() {
  const [bankCodes, setBankCodes] = useState<BankCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadBankCodes();
  }, []);

  const loadBankCodes = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'bankCodes'));
      const bankCodesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        code: doc.data().code,
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      })) as BankCode[];
      setBankCodes(bankCodesData);
    } catch (error) {
      console.error('은행코드 목록을 불러올 수 없습니다:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAllBankCodes = async () => {
    setAdding(true);
    try {
      // 기존 데이터 삭제
      for (const bankCode of bankCodes) {
        await deleteDoc(doc(db, 'bankCodes', bankCode.id));
      }
      
      // 새 데이터 추가
      const promises = bankCodesData.map(async (bankCode) => {
        const docRef = await addDoc(collection(db, 'bankCodes'), {
          ...bankCode,
          createdAt: new Date()
        });
        return docRef;
      });
      
      await Promise.all(promises);
      alert('모든 은행코드가 성공적으로 추가되었습니다!');
      await loadBankCodes();
    } catch (error) {
      console.error('은행코드 추가 중 오류:', error);
      alert('은행코드 추가 중 오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">은행코드 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">은행코드 관리</h1>
            <button
              onClick={addAllBankCodes}
              disabled={adding}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? '추가 중...' : '모든 은행코드 추가'}
            </button>
          </div>

          <div className="mb-4">
            <p className="text-gray-600">
              현재 {bankCodes.length}개의 은행코드가 등록되어 있습니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    은행명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    은행코드
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    등록일
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bankCodes.map((bankCode) => (
                  <tr key={bankCode.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {bankCode.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {bankCode.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {bankCode.createdAt.toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bankCodes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">등록된 은행코드가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-2">
                &quot;모든 은행코드 추가&quot; 버튼을 클릭하여 기본 은행코드를 추가하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
