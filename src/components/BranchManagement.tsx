'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  ceoName?: string; // 대표자명
  businessNumber?: string; // 사업자등록번호
  companyName?: string; // 회사명
  closureDate?: Date; // 폐업일
  createdAt: Date;
  updatedAt: Date;
}

export default function BranchManagement() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchDeleteStatus, setBranchDeleteStatus] = useState<{[key: string]: boolean}>({});
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    ceoName: '',
    businessNumber: '',
    companyName: '',
    closureDate: ''
  });

  useEffect(() => {
    console.log('BranchManagement 컴포넌트가 마운트되었습니다.');
    loadBranches();
  }, []);

  const loadBranches = async () => {
    console.log('지점 목록을 불러오는 중...');
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      console.log('Firestore에서 받은 지점 데이터:', querySnapshot.docs);
      const branchesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const branch = {
          id: doc.id,
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          ceoName: data.ceoName || '',
          businessNumber: data.businessNumber || '',
          companyName: data.companyName || '',
          closureDate: data.closureDate?.toDate ? data.closureDate.toDate() : undefined,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
        console.log('처리된 지점:', branch);
        return branch;
      }) as Branch[];
      console.log('처리된 지점 데이터:', branchesData);
      setBranches(branchesData);
      
      // 각 지점의 삭제 가능 여부 확인
      await checkBranchDeleteStatus(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  const checkBranchDeleteStatus = async (branchesData: Branch[]) => {
    const deleteStatus: {[key: string]: boolean} = {};
    
    for (const branch of branchesData) {
      try {
        // 직원 확인
        const employeesQuery = query(collection(db, 'employees'), where('branchId', '==', branch.id));
        const employeesSnapshot = await getDocs(employeesQuery);
        
        // 스케줄 확인
        const schedulesQuery = query(collection(db, 'schedules'), where('branchId', '==', branch.id));
        const schedulesSnapshot = await getDocs(schedulesQuery);
        
        // 둘 다 비어있으면 삭제 가능
        deleteStatus[branch.id] = employeesSnapshot.empty && schedulesSnapshot.empty;
      } catch (error) {
        console.error(`지점 ${branch.name} 삭제 가능 여부 확인 중 오류:`, error);
        deleteStatus[branch.id] = false; // 오류 시 삭제 불가로 설정
      }
    }
    
    setBranchDeleteStatus(deleteStatus);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('지점 폼 제출됨:', formData);

    try {
      if (editingBranch) {
        // 수정
        console.log('지점 수정 시도:', editingBranch.id);
        
        if (!editingBranch.id) {
          throw new Error('지점 ID가 없습니다.');
        }
        
        const branchRef = doc(db, 'branches', editingBranch.id);
        console.log('문서 참조:', branchRef);
        
        const updateData: any = {
          address: formData.address || '',
          phone: formData.phone || '',
          ceoName: formData.ceoName || '',
          businessNumber: formData.businessNumber || '',
          companyName: formData.companyName || '',
          updatedAt: new Date()
        };
        
        // 폐업일 처리
        if (formData.closureDate) {
          updateData.closureDate = new Date(formData.closureDate);
        } else {
          updateData.closureDate = null;
        }
        
        // 지점명은 변경하지 않음 (데이터 일관성 유지)
        console.log('업데이트할 데이터:', updateData);
        
        await updateDoc(branchRef, updateData);
        console.log('지점 정보가 수정되었습니다.');
      } else {
        // 추가
        console.log('새 지점 추가 시도');
        console.log('formData:', formData);
        
        const branchData: any = {
          name: formData.name,
          address: formData.address || '',
          phone: formData.phone || '',
          ceoName: formData.ceoName || '',
          businessNumber: formData.businessNumber || '',
          companyName: formData.companyName || '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // 폐업일 처리
        if (formData.closureDate) {
          branchData.closureDate = new Date(formData.closureDate);
        }
        
        console.log('저장할 데이터:', branchData);
        
        const docRef = await addDoc(collection(db, 'branches'), branchData);
        console.log('새 지점이 추가되었습니다. ID:', docRef.id);
      }

      // 폼 초기화
      setFormData({
        name: '',
        address: '',
        phone: '',
        ceoName: '',
        businessNumber: '',
        companyName: '',
        closureDate: ''
      });
      setShowForm(false);
      setEditingBranch(null);
      
      // 목록 새로고침
      await loadBranches();
    } catch (error) {
      console.error('지점 정보 저장 중 오류가 발생했습니다:', error);
      console.error('오류 상세:', error);
      alert('지점 정보 저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    }
  };

  const handleEdit = (branch: Branch) => {
    console.log('지점 수정 시작:', branch);
    console.log('지점 ID:', branch.id);
    
    if (!branch.id) {
      console.error('지점 ID가 없습니다:', branch);
      alert('지점 ID가 없어서 수정할 수 없습니다.');
      return;
    }
    
    setEditingBranch(branch);
    setFormData({
      name: branch.name || '',
      address: branch.address || '',
      phone: branch.phone || '',
      ceoName: branch.ceoName || '',
      businessNumber: branch.businessNumber || '',
      companyName: branch.companyName || '',
      closureDate: branch.closureDate ? branch.closureDate.toISOString().split('T')[0] : ''
    });
    setShowForm(true);
  };

  const handleDelete = async (branchId: string) => {
    try {
      // 해당 지점에 연결된 직원이 있는지 확인
      const employeesQuery = query(collection(db, 'employees'), where('branchId', '==', branchId));
      const employeesSnapshot = await getDocs(employeesQuery);
      
      if (!employeesSnapshot.empty) {
        alert('해당 지점에 등록된 직원이 있어서 삭제할 수 없습니다.\n먼저 직원을 다른 지점으로 이동하거나 퇴사 처리해주세요.');
        return;
      }
      
      // 해당 지점에 연결된 스케줄이 있는지 확인
      const schedulesQuery = query(collection(db, 'schedules'), where('branchId', '==', branchId));
      const schedulesSnapshot = await getDocs(schedulesQuery);
      
      if (!schedulesSnapshot.empty) {
        alert('해당 지점에 등록된 스케줄이 있어서 삭제할 수 없습니다.\n먼저 스케줄을 삭제해주세요.');
        return;
      }
      
      // 데이터가 없으면 삭제 진행
      if (confirm('정말로 이 지점을 삭제하시겠습니까?')) {
        await deleteDoc(doc(db, 'branches', branchId));
        console.log('지점이 삭제되었습니다.');
        await loadBranches();
        alert('지점이 성공적으로 삭제되었습니다.');
      }
    } catch (error) {
      console.error('지점 삭제 중 오류가 발생했습니다:', error);
      alert('지점 삭제 중 오류가 발생했습니다.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      phone: '',
      ceoName: '',
      businessNumber: '',
      companyName: '',
      closureDate: ''
    });
    setEditingBranch(null);
    setShowForm(false);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">지점 관리</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          지점 추가
        </button>
      </div>

      {/* 지점 추가/수정 폼 */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingBranch ? '지점 정보 수정' : '새 지점 추가'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  지점명 *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingBranch}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    editingBranch ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  placeholder="지점명"
                  title={editingBranch ? '지점명은 변경할 수 없습니다. 새 지점을 추가해주세요.' : ''}
                />
                {editingBranch && (
                  <p className="mt-1 text-xs text-gray-500">
                    지점명은 변경할 수 없습니다. 새 지점을 추가해주세요.
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  주소
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="주소"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  전화번호
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="전화번호"
                />
              </div>
              
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  회사명
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="회사명"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  대표자명
                </label>
                <input
                  type="text"
                  value={formData.ceoName}
                  onChange={(e) => setFormData({ ...formData, ceoName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="대표자명"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사업자등록번호
                </label>
                <input
                  type="text"
                  value={formData.businessNumber}
                  onChange={(e) => setFormData({ ...formData, businessNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="사업자등록번호"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  폐업일
                </label>
                <input
                  type="date"
                  value={formData.closureDate}
                  onChange={(e) => setFormData({ ...formData, closureDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  폐업일을 입력하면 해당 지점이 폐업된 것으로 표시됩니다.
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
              >
                {editingBranch ? '수정' : '추가'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 지점 목록 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">지점 목록</h2>
        </div>
        
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  사업자등록번호
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  주소
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  전화번호
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  폐업일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {branches.map((branch) => {
                const isClosed = branch.closureDate && branch.closureDate <= new Date();
                return (
                  <tr key={branch.id} className={`hover:bg-gray-50 ${isClosed ? 'bg-red-50 opacity-75' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {branch.name}
                      {isClosed && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 rounded">
                          폐업
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {branch.businessNumber || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {branch.address || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {branch.phone || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {branch.closureDate 
                        ? branch.closureDate.toLocaleDateString('ko-KR')
                        : '-'
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(branch)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(branch.id)}
                      disabled={!branchDeleteStatus[branch.id]}
                      className={`${
                        branchDeleteStatus[branch.id] 
                          ? 'text-red-600 hover:text-red-900' 
                          : 'text-gray-400 cursor-not-allowed'
                      }`}
                      title={
                        branchDeleteStatus[branch.id] 
                          ? '지점 삭제' 
                          : '직원이나 스케줄이 있어서 삭제할 수 없습니다'
                      }
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 뷰 */}
        <div className="md:hidden">
          {branches.map((branch) => (
            <div key={branch.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900">{branch.name}</h3>
                </div>
                <div className="flex items-center space-x-3">
                  {branch.phone && (
                    <a
                      href={`tel:${branch.phone}`}
                      className="text-green-600 hover:text-green-800"
                      title={`${branch.phone}로 전화걸기`}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={() => handleEdit(branch)}
                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  >
                    수정
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {branches.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            등록된 지점이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
