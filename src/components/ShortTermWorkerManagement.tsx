'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ShortTermWorker {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  socialSecurityNumber: string; // 주민번호 (마스킹 처리)
  hourlyWage: number;
  totalWorkHours: number;
  totalPay: number;
  depositAmount: number;
  depositDate: string;
  notes: string;
  workDetails: WorkDetail[];
  createdAt: Date;
  updatedAt: Date;
}

interface WorkDetail {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakTime: number; // 분 단위
  workHours: number; // 시간 단위
}

interface Branch {
  id: string;
  name: string;
}

interface ShortTermWorkerManagementProps {
  userBranch?: {
    id: string;
    name: string;
  } | null;
  isManager?: boolean;
}

export default function ShortTermWorkerManagement({ userBranch, isManager }: ShortTermWorkerManagementProps) {
  const [workers, setWorkers] = useState<ShortTermWorker[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ShortTermWorker | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // 새 직원 추가 폼 상태
  const [newWorker, setNewWorker] = useState({
    branchId: '',
    name: '',
    socialSecurityNumber: '',
    hourlyWage: 0,
    notes: ''
  });

  // 근무 상세 추가 폼 상태
  const [newWorkDetail, setNewWorkDetail] = useState({
    workDate: '',
    startTime: '',
    endTime: '',
    breakTime: 0,
    notes: ''
  });

  // 엑셀형 근무 추가 상태
  const [showExcelForm, setShowExcelForm] = useState(false);
  const [excelWorkDetails, setExcelWorkDetails] = useState<Array<{
    workDate: string;
    startTime: string;
    endTime: string;
    breakTime: number;
    notes: string;
  }>>([{ workDate: '', startTime: '', endTime: '', breakTime: 0, notes: '' }]);

  // 지점 목록 로드
  const loadBranches = async () => {
    try {
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = branchesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록 로드 실패:', error);
    }
  };

  // 단기알바 목록 로드
  const loadWorkers = async () => {
    if (!selectedMonth) {
      setWorkers([]);
      return;
    }

    setLoading(true);
    try {
      let workersQuery;
      
      if (isManager && userBranch) {
        // 매니저는 자신의 지점만 조회
        workersQuery = query(
          collection(db, 'shortTermWorkers'),
          where('branchId', '==', userBranch.id),
          where('month', '==', selectedMonth),
          orderBy('createdAt', 'desc')
        );
      } else {
        // 관리자는 모든 지점 조회
        workersQuery = query(
          collection(db, 'shortTermWorkers'),
          where('month', '==', selectedMonth),
          orderBy('createdAt', 'desc')
        );
      }

      const workersSnapshot = await getDocs(workersQuery);
      const workersData = workersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as ShortTermWorker;
      });


      setWorkers(workersData);
    } catch (error) {
      console.error('단기알바 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 근무시간 계산
  const calculateWorkHours = (startTime: string, endTime: string, breakTime: number): number => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.max(0, diffHours - (breakTime / 60));
  };

  // 총 근무시간 계산
  const calculateTotalWorkHours = (workDetails: WorkDetail[]): number => {
    return workDetails.reduce((total, detail) => total + detail.workHours, 0);
  };

  // 총 급여 계산
  const calculateTotalPay = (hourlyWage: number, totalWorkHours: number): number => {
    return hourlyWage * totalWorkHours;
  };

  // 주민번호 마스킹
  const maskSocialSecurityNumber = (ssn: string): string => {
    if (ssn.length >= 8) {
      return ssn.substring(0, 6) + '****';
    }
    return ssn;
  };

  // 시간 포맷팅
  const formatTime = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  // 근무 상세 토글
  const toggleWorkDetails = (workerId: string) => {
    setExpandedWorker(expandedWorker === workerId ? null : workerId);
  };

  // 새 직원 추가
  const handleAddWorker = async () => {
    if (!newWorker.name || !newWorker.socialSecurityNumber || !newWorker.branchId) {
      alert('필수 정보를 입력해주세요.');
      return;
    }

    if (!selectedMonth) {
      alert('월을 선택해주세요.');
      return;
    }

    try {
      const branch = branches.find(b => b.id === newWorker.branchId);
      const workerData = {
        branchId: newWorker.branchId,
        branchName: branch?.name || '',
        month: selectedMonth,
        name: newWorker.name,
        socialSecurityNumber: newWorker.socialSecurityNumber,
        hourlyWage: newWorker.hourlyWage,
        totalWorkHours: 0,
        totalPay: 0,
        depositAmount: 0,
        depositDate: '',
        notes: newWorker.notes,
        workDetails: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await addDoc(collection(db, 'shortTermWorkers'), workerData);
      setNewWorker({ branchId: '', name: '', socialSecurityNumber: '', hourlyWage: 0, notes: '' });
      setShowAddForm(false);
      loadWorkers();
    } catch (error) {
      console.error('직원 추가 실패:', error);
      alert('직원 추가에 실패했습니다.');
    }
  };

  // 근무 상세 추가
  const handleAddWorkDetail = async (workerId: string) => {
    if (!newWorkDetail.workDate || !newWorkDetail.startTime || !newWorkDetail.endTime) {
      alert('근무일, 출근시각, 퇴근시각을 입력해주세요.');
      return;
    }

    try {
      const workHours = calculateWorkHours(
        newWorkDetail.startTime,
        newWorkDetail.endTime,
        newWorkDetail.breakTime
      );

      const workDetail: WorkDetail = {
        id: Date.now().toString(),
        workDate: newWorkDetail.workDate,
        startTime: newWorkDetail.startTime,
        endTime: newWorkDetail.endTime,
        breakTime: newWorkDetail.breakTime,
        workHours: workHours
      };

      const worker = workers.find(w => w.id === workerId);
      if (!worker) return;

      const updatedWorkDetails = [...worker.workDetails, workDetail];
      const totalWorkHours = calculateTotalWorkHours(updatedWorkDetails);
      const totalPay = calculateTotalPay(worker.hourlyWage, totalWorkHours);

      await updateDoc(doc(db, 'shortTermWorkers', workerId), {
        workDetails: updatedWorkDetails,
        totalWorkHours: totalWorkHours,
        totalPay: totalPay,
        updatedAt: new Date()
      });

      setNewWorkDetail({ workDate: '', startTime: '', endTime: '', breakTime: 0, notes: '' });
      loadWorkers();
    } catch (error) {
      console.error('근무 상세 추가 실패:', error);
      alert('근무 상세 추가에 실패했습니다.');
    }
  };

  // 입금 정보 업데이트
  const handleUpdateDeposit = async (workerId: string, depositAmount: number, depositDate: string) => {
    try {
      await updateDoc(doc(db, 'shortTermWorkers', workerId), {
        depositAmount: depositAmount,
        depositDate: depositDate,
        updatedAt: new Date()
      });
      loadWorkers();
    } catch (error) {
      console.error('입금 정보 업데이트 실패:', error);
      alert('입금 정보 업데이트에 실패했습니다.');
    }
  };

  // 엑셀형 근무 추가 - 행 추가
  const addExcelRow = () => {
    setExcelWorkDetails(prev => [...prev, { workDate: '', startTime: '', endTime: '', breakTime: 0, notes: '' }]);
  };

  // 엑셀형 근무 추가 - 행 삭제
  const removeExcelRow = (index: number) => {
    if (excelWorkDetails.length > 1) {
      setExcelWorkDetails(prev => prev.filter((_, i) => i !== index));
    }
  };

  // 엑셀형 근무 추가 - 데이터 변경
  const updateExcelRow = (index: number, field: string, value: string | number) => {
    setExcelWorkDetails(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: value } : row
    ));
  };

  // 엑셀형 근무 일괄 추가
  const handleExcelAddWorkDetails = async (workerId: string) => {
    const validRows = excelWorkDetails.filter(row => 
      row.workDate && row.startTime && row.endTime
    );

    if (validRows.length === 0) {
      alert('유효한 근무 데이터를 입력해주세요.');
      return;
    }

    try {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) return;

      const newWorkDetails: WorkDetail[] = validRows.map(row => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        workDate: row.workDate,
        startTime: row.startTime,
        endTime: row.endTime,
        breakTime: row.breakTime,
        workHours: calculateWorkHours(row.startTime, row.endTime, row.breakTime)
      }));

      const updatedWorkDetails = [...worker.workDetails, ...newWorkDetails];
      const totalWorkHours = calculateTotalWorkHours(updatedWorkDetails);
      const totalPay = calculateTotalPay(worker.hourlyWage, totalWorkHours);

      await updateDoc(doc(db, 'shortTermWorkers', workerId), {
        workDetails: updatedWorkDetails,
        totalWorkHours: totalWorkHours,
        totalPay: totalPay,
        updatedAt: new Date()
      });

      // 폼 초기화
      setExcelWorkDetails([{ workDate: '', startTime: '', endTime: '', breakTime: 0, notes: '' }]);
      setShowExcelForm(false);
      loadWorkers();
    } catch (error) {
      console.error('엑셀형 근무 추가 실패:', error);
      alert('근무 추가에 실패했습니다.');
    }
  };

  // 월별 데이터 로드
  useEffect(() => {
    loadWorkers();
  }, [selectedMonth]);

  useEffect(() => {
    loadBranches();
    
    // 현재 월을 기본값으로 설정
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">단기알바 관리</h2>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">처리할 월:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          disabled={!selectedMonth}
        >
          {showAddForm ? '취소' : '새 직원 추가'}
        </button>
      </div>

      {/* 새 직원 추가 폼 */}
      {showAddForm && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">새 직원 추가</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">지점</label>
              <select
                value={newWorker.branchId}
                onChange={(e) => setNewWorker({...newWorker, branchId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">지점 선택</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <input
                type="text"
                value={newWorker.name}
                onChange={(e) => setNewWorker({...newWorker, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="이름을 입력하세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주민번호</label>
              <input
                type="text"
                value={newWorker.socialSecurityNumber}
                onChange={(e) => setNewWorker({...newWorker, socialSecurityNumber: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="주민번호를 입력하세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시급</label>
              <input
                type="number"
                value={newWorker.hourlyWage}
                onChange={(e) => setNewWorker({...newWorker, hourlyWage: Number(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="시급을 입력하세요"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
              <textarea
                value={newWorker.notes}
                onChange={(e) => setNewWorker({...newWorker, notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="비고를 입력하세요"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAddWorker}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        </div>
      )}

      {/* 단기알바 목록 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지점</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">주민번호</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시급</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">총근무시간</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">총급여</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">입금액</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">입금일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">근무상세보기</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center text-gray-500">로딩중...</td>
                </tr>
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center text-gray-500">등록된 단기알바가 없습니다.</td>
                </tr>
              ) : (
                workers.map((worker) => (
                  <React.Fragment key={worker.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{worker.branchName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{worker.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{maskSocialSecurityNumber(worker.socialSecurityNumber)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{worker.hourlyWage.toLocaleString()}원</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(worker.totalWorkHours)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{worker.totalPay.toLocaleString()}원</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <input
                          type="number"
                          value={worker.depositAmount}
                          onChange={(e) => {
                            const amount = Number(e.target.value);
                            handleUpdateDeposit(worker.id, amount, worker.depositDate);
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="입금액"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <input
                          type="date"
                          value={worker.depositDate}
                          onChange={(e) => {
                            handleUpdateDeposit(worker.id, worker.depositAmount, e.target.value);
                          }}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">{worker.notes}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => toggleWorkDetails(worker.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {expandedWorker === worker.id ? '접기' : '펼쳐보기'}
                        </button>
                      </td>
                    </tr>
                    
                    {/* 근무 상세 보기 */}
                    {expandedWorker === worker.id && (
                      <tr>
                        <td colSpan={10} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="text-lg font-medium text-gray-900">{worker.name} 근무 상세</h4>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => setShowExcelForm(!showExcelForm)}
                                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                                >
                                  {showExcelForm ? '엑셀형 닫기' : '엑셀형 추가'}
                                </button>
                                <button
                                  onClick={() => {
                                    const workDate = prompt('근무일 (YYYY-MM-DD):');
                                    const startTime = prompt('출근시각 (HH:MM):');
                                    const endTime = prompt('퇴근시각 (HH:MM):');
                                    const breakTime = Number(prompt('휴식시간 (분):') || '0');
                                    
                                    if (workDate && startTime && endTime) {
                                      setNewWorkDetail({ workDate, startTime, endTime, breakTime, notes: '' });
                                      handleAddWorkDetail(worker.id);
                                    }
                                  }}
                                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                                >
                                  개별 추가
                                </button>
                              </div>
                            </div>
                            
                            {/* 엑셀형 근무 추가 폼 */}
                            {showExcelForm && (
                              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h5 className="text-md font-medium text-gray-900 mb-3">엑셀형 근무 추가</h5>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">근무일</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">출근시각</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">퇴근시각</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">휴식시간(분)</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">비고</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {excelWorkDetails.map((row, index) => (
                                        <tr key={index}>
                                          <td className="px-3 py-2">
                                            <input
                                              type="date"
                                              value={row.workDate}
                                              onChange={(e) => updateExcelRow(index, 'workDate', e.target.value)}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input
                                              type="time"
                                              value={row.startTime}
                                              onChange={(e) => updateExcelRow(index, 'startTime', e.target.value)}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input
                                              type="time"
                                              value={row.endTime}
                                              onChange={(e) => updateExcelRow(index, 'endTime', e.target.value)}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input
                                              type="number"
                                              value={row.breakTime}
                                              onChange={(e) => updateExcelRow(index, 'breakTime', Number(e.target.value))}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                              min="0"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <input
                                              type="text"
                                              value={row.notes}
                                              onChange={(e) => updateExcelRow(index, 'notes', e.target.value)}
                                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                              placeholder="비고"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <div className="flex space-x-1">
                                              <button
                                                onClick={addExcelRow}
                                                className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"
                                                title="행 추가"
                                              >
                                                +
                                              </button>
                                              {excelWorkDetails.length > 1 && (
                                                <button
                                                  onClick={() => removeExcelRow(index)}
                                                  className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                                                  title="행 삭제"
                                                >
                                                  -
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex justify-end space-x-2 mt-3">
                                  <button
                                    onClick={() => setShowExcelForm(false)}
                                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                                  >
                                    취소
                                  </button>
                                  <button
                                    onClick={() => handleExcelAddWorkDetails(worker.id)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                  >
                                    일괄 추가
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">근무일</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">출근시각</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">퇴근시각</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">휴식시간</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">근무시간</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {worker.workDetails.map((detail) => (
                                    <tr key={detail.id}>
                                      <td className="px-4 py-2 text-sm text-gray-900">{detail.workDate}</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{detail.startTime}</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{detail.endTime}</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{detail.breakTime}분</td>
                                      <td className="px-4 py-2 text-sm text-gray-900">{formatTime(detail.workHours)}</td>
                                    </tr>
                                  ))}
                                  {worker.workDetails.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-4 py-2 text-center text-gray-500">등록된 근무가 없습니다.</td>
                                    </tr>
                                  )}
                                  {/* 합계 행 */}
                                  <tr className="bg-gray-100 font-medium">
                                    <td className="px-4 py-2 text-sm text-gray-900">합계</td>
                                    <td className="px-4 py-2 text-sm text-gray-900">-</td>
                                    <td className="px-4 py-2 text-sm text-gray-900">-</td>
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                      {worker.workDetails.reduce((total, detail) => total + detail.breakTime, 0)}분
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-900">{formatTime(worker.totalWorkHours)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
