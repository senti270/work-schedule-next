'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ManagerAccount {
  id: string;
  userId: string;
  password: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Branch {
  id: string;
  name: string;
  companyName?: string;
  ceoName?: string;
  businessNumber?: string;
}

interface ManagerAccountManagementProps {
  userBranch?: {
    id: string;
    name: string;
    managerId?: string;
  } | null;
  isManager?: boolean;
}

export default function ManagerAccountManagement({ }: ManagerAccountManagementProps) {
  const [managerAccounts, setManagerAccounts] = useState<ManagerAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManagerAccount | null>(null);
  const [formData, setFormData] = useState({
    userId: '',
    password: '',
    branchId: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadManagerAccounts();
    loadBranches();
  }, []);

  const loadManagerAccounts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'managerAccounts'));
      const accountsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || '',
          password: data.password || '',
          branchId: data.branchId || '',
          branchName: data.branchName || '',
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      }) as ManagerAccount[];
      
      setManagerAccounts(accountsData);
    } catch (error) {
      console.error('매니저 계정 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        companyName: doc.data().companyName,
        ceoName: doc.data().ceoName,
        businessNumber: doc.data().businessNumber
      })) as Branch[];
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 필수입력 검증
    if (!formData.userId.trim()) {
      alert('매니저 ID를 입력해주세요.');
      return;
    }
    if (!formData.password.trim()) {
      alert('비밀번호를 입력해주세요.');
      return;
    }
    if (!formData.branchId) {
      alert('지점을 선택해주세요.');
      return;
    }

    // ID 중복 검사
    const existingAccount = managerAccounts.find(account => 
      account.userId === formData.userId && account.id !== editingAccount?.id
    );
    if (existingAccount) {
      alert('이미 존재하는 매니저 ID입니다.');
      return;
    }

    setLoading(true);
    try {
      const selectedBranch = branches.find(branch => branch.id === formData.branchId);
      const branchName = formData.branchId === 'master' ? '마스터' : (selectedBranch ? selectedBranch.name : '');

      if (editingAccount) {
        // 수정
        const accountRef = doc(db, 'managerAccounts', editingAccount.id);
        await updateDoc(accountRef, {
          userId: formData.userId,
          password: formData.password,
          branchId: formData.branchId,
          branchName: branchName,
          isActive: formData.isActive,
          updatedAt: new Date()
        });
        alert('계정이 수정되었습니다.');
      } else {
        // 추가
        const accountData = {
          userId: formData.userId,
          password: formData.password,
          branchId: formData.branchId,
          branchName: branchName,
          isActive: formData.isActive,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await addDoc(collection(db, 'managerAccounts'), accountData);
        alert('계정이 추가되었습니다.');
      }

      // 폼 초기화
      setFormData({
        userId: '',
        password: '',
        branchId: '',
        isActive: true
      });
      setShowForm(false);
      setEditingAccount(null);
      
      // 목록 새로고침
      await loadManagerAccounts();
    } catch (error) {
      console.error('매니저 계정 저장 중 오류:', error);
      alert('매니저 계정 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (account: ManagerAccount) => {
    setEditingAccount(account);
    setFormData({
      userId: account.userId,
      password: account.password,
      branchId: account.branchId,
      isActive: account.isActive
    });
    setShowForm(true);
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('정말로 이 매니저 계정을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'managerAccounts', accountId));
      alert('매니저 계정이 삭제되었습니다.');
      await loadManagerAccounts();
    } catch (error) {
      console.error('매니저 계정 삭제 중 오류:', error);
      alert('매니저 계정 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleToggleActive = async (account: ManagerAccount) => {
    try {
      const accountRef = doc(db, 'managerAccounts', account.id);
      await updateDoc(accountRef, {
        isActive: !account.isActive,
        updatedAt: new Date()
      });
      alert(`매니저 계정이 ${!account.isActive ? '활성화' : '비활성화'}되었습니다.`);
      await loadManagerAccounts();
    } catch (error) {
      console.error('매니저 계정 상태 변경 중 오류:', error);
      alert('매니저 계정 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      password: '',
      branchId: '',
      isActive: true
    });
    setShowForm(false);
    setEditingAccount(null);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">매니저 계정 관리</h1>
        <p className="text-gray-600">각 지점의 매니저 계정을 생성하고 관리할 수 있습니다.</p>
      </div>

      {/* 매니저 계정 추가 버튼 */}
      <div className="mb-6">
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          매니저 계정 추가
        </button>
      </div>

      {/* 매니저 계정 추가/수정 폼 */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingAccount ? '매니저 계정 수정' : '매니저 계정 추가'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  매니저 ID *
                </label>
                <input
                  type="text"
                  required
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="매니저 ID를 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 *
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호를 입력하세요"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지점 *
                </label>
                <select
                  required
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">지점을 선택하세요</option>
                  <option value="master">마스터 계정</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">활성 상태</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? '저장 중...' : (editingAccount ? '수정' : '추가')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 매니저 계정 목록 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">매니저 계정 목록</h2>
        </div>
        
        {managerAccounts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            등록된 매니저 계정이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    매니저 ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    지점
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    생성일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {managerAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.branchName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        account.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {account.isActive ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.createdAt.toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleToggleActive(account)}
                          className={`${
                            account.isActive 
                              ? 'text-orange-600 hover:text-orange-900' 
                              : 'text-green-600 hover:text-green-900'
                          }`}
                        >
                          {account.isActive ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
