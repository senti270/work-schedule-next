'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as XLSX from 'xlsx';

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string;
  confirmedAt: Date;
  netPay: number;
  grossPay: number;
  memo?: string;
}

interface Employee {
  id: string;
  name: string;
  residentNumber?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  hireDate?: Date;
}

interface Branch {
  id: string;
  name: string;
}

interface Deposit {
  id: string;
  employeeId: string;
  month: string;
  depositDate: Date;
  amount: number;
  memo?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TransferData {
  employeeId: string;
  employeeName: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  netPay: number;
  totalDeposits: number;
  difference: number;
  deposits: Deposit[];
  branchId: string;
  branchName: string;
  paymentMethod: 'transfer' | 'cash';
}

const TransferFileGeneration: React.FC = () => {
  // 🔥 매월 5일까지는 전달 급여를 기본값으로 설정
  const getCurrentMonth = () => {
    const now = new Date();
    const currentDay = now.getDate();
    
    // 매월 5일까지는 전달 급여
    let targetMonth: Date;
    if (currentDay <= 5) {
      // 전달로 설정
      targetMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else {
      // 이번 달
      targetMonth = now;
    }
    
    return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
  };
  
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [confirmedPayrolls, setConfirmedPayrolls] = useState<ConfirmedPayroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingDeposit, setEditingDeposit] = useState<{id: string, employeeId: string, amount: number, memo: string} | null>(null);
  const [newDeposit, setNewDeposit] = useState<{employeeId: string, amount: number, memo: string}>({employeeId: '', amount: 0, memo: ''});

  // 지점 로드
  const loadBranches = useCallback(async () => {
    try {
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = branchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Branch[];
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 로드 실패:', error);
    }
  }, []);

  // 직원 로드
  const loadEmployees = useCallback(async () => {
    try {
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      const employeesData = employeesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          hireDate: data.hireDate?.toDate ? data.hireDate.toDate() : data.hireDate
        };
      }) as Employee[];
      setEmployees(employeesData);
    } catch (error) {
      console.error('직원 로드 실패:', error);
    }
  }, []);

  // 확정된 급여 데이터 로드
  const loadConfirmedPayrolls = useCallback(async () => {
    if (!selectedMonth) return;
    
    setLoading(true);
    try {
      const confirmedPayrollsQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('month', '==', selectedMonth)
      );
      const confirmedPayrollsSnapshot = await getDocs(confirmedPayrollsQuery);
      
      const confirmedPayrollsData = confirmedPayrollsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          confirmedAt: data.confirmedAt?.toDate() || new Date()
        };
      }) as ConfirmedPayroll[];
      
      setConfirmedPayrolls(confirmedPayrollsData);
    } catch (error) {
      console.error('확정된 급여 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  // 입금내역 로드
  const loadDeposits = useCallback(async () => {
    if (!selectedMonth) return;
    
    try {
      const depositsQuery = query(
        collection(db, 'deposits'),
        where('month', '==', selectedMonth)
      );
      const depositsSnapshot = await getDocs(depositsQuery);
      
      const depositsData = depositsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          depositDate: data.depositDate?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      }) as Deposit[];
      
      setDeposits(depositsData);
    } catch (error) {
      console.error('입금내역 로드 실패:', error);
    }
  }, [selectedMonth]);

  // 컴포넌트 마운트 시 초기 데이터 로드
  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, [loadBranches, loadEmployees]);

  // 월이 변경될 때 데이터 로드
  useEffect(() => {
    loadConfirmedPayrolls();
    loadDeposits();
  }, [loadConfirmedPayrolls, loadDeposits]);

  // 지점별 필터링된 데이터
  const filteredPayrolls = selectedBranchId 
    ? confirmedPayrolls.filter(payroll => payroll.branchId === selectedBranchId)
    : confirmedPayrolls;

  // 이체 데이터 생성 (대표지점 기준으로 그룹화)
  const transferDataMap = new Map<string, TransferData>();
  
  filteredPayrolls.forEach(payroll => {
    const employee = employees.find(emp => emp.id === payroll.employeeId);
    if (!employee) return;
    
    // 대표지점이 있으면 대표지점 사용, 없으면 첫 번째 지점 사용
    const primaryBranchId = employee.primaryBranchId || payroll.branchId;
    const primaryBranchName = employee.primaryBranchName || payroll.branchName;
    
    const key = payroll.employeeId;
    
    if (!transferDataMap.has(key)) {
      const employeeDeposits = deposits.filter(deposit => deposit.employeeId === payroll.employeeId);
      const totalDeposits = employeeDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
      
      transferDataMap.set(key, {
        employeeId: payroll.employeeId,
        employeeName: payroll.employeeName,
        bankCode: employee?.bankCode || '-',
        bankName: employee?.bankName || '-',
        accountNumber: employee?.accountNumber || '-',
        netPay: payroll.netPay,
        totalDeposits,
        difference: payroll.netPay - totalDeposits,
        deposits: employeeDeposits,
        branchId: primaryBranchId,
        branchName: primaryBranchName,
        paymentMethod: (employee?.accountNumber && employee.accountNumber !== '-') ? 'transfer' : 'cash'
      });
    } else {
      // 이미 있는 경우 netPay 누적
      const existing = transferDataMap.get(key)!;
      existing.netPay += payroll.netPay;
      existing.difference = existing.netPay - existing.totalDeposits;
    }
  });
  
  const transferData: TransferData[] = Array.from(transferDataMap.values());

  // 행 펼치기/접기
  const toggleRow = (employeeId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  // 입금내역 추가
  const addDeposit = async (employeeId: string) => {
    if (newDeposit.amount <= 0) {
      alert('입금액을 입력해주세요.');
      return;
    }

    try {
      const depositData = {
        employeeId,
        month: selectedMonth,
        depositDate: new Date(),
        amount: newDeposit.amount,
        memo: newDeposit.memo || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await addDoc(collection(db, 'deposits'), depositData);
      await loadDeposits();
      
      setNewDeposit({employeeId: '', amount: 0, memo: ''});
      alert('입금내역이 추가되었습니다.');
    } catch (error) {
      console.error('입금내역 추가 실패:', error);
      alert('입금내역 추가에 실패했습니다.');
    }
  };

  // 입금내역 수정
  const updateDeposit = async (depositId: string, amount: number, memo: string) => {
    try {
      await updateDoc(doc(db, 'deposits', depositId), {
        amount,
        memo,
        updatedAt: new Date()
      });
      await loadDeposits();
      setEditingDeposit(null);
      alert('입금내역이 수정되었습니다.');
    } catch (error) {
      console.error('입금내역 수정 실패:', error);
      alert('입금내역 수정에 실패했습니다.');
    }
  };

  // 입금내역 삭제
  const deleteDeposit = async (depositId: string) => {
    if (!confirm('입금내역을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'deposits', depositId));
      await loadDeposits();
      alert('입금내역이 삭제되었습니다.');
    } catch (error) {
      console.error('입금내역 삭제 실패:', error);
      alert('입금내역 삭제에 실패했습니다.');
    }
  };

  // 엑셀 다운로드
  const downloadExcel = () => {
    const excelData = transferData.map(data => ({
      '은행코드': data.bankCode,
      '은행': data.bankName,
      '계좌번호': data.accountNumber,
      '직원명': data.employeeName,
      '입금액': data.netPay || 0,
      '기입금액': data.totalDeposits || 0,
      '차액': data.difference || 0
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '계좌이체파일');
    
    const fileName = `계좌이체파일_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">급여이체파일 생성</h1>
            <p className="mt-1 text-sm text-gray-600">급여확정된 데이터를 기반으로 계좌이체파일을 생성합니다</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">처리할 월:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={downloadExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              📊 엑셀 다운로드
            </button>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              🔄 상태 새로고침
            </button>
          </div>
        </div>
      </div>

      {/* 지점 탭 */}
      {selectedMonth && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setSelectedBranchId('')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  selectedBranchId === ''
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                전체 ({confirmedPayrolls.length}건)
              </button>
              {branches.map((branch) => {
                const branchCount = confirmedPayrolls.filter(p => p.branchId === branch.id).length;
                return (
                  <button
                    key={branch.id}
                    onClick={() => setSelectedBranchId(branch.id)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      selectedBranchId === branch.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {branch.name} ({branchCount}건)
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 데이터 테이블 */}
      {selectedMonth && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              계좌이체 데이터 ({transferData.length}건)
            </h3>
          </div>
          
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-500">로딩 중...</div>
            </div>
          ) : transferData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      은행코드
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      은행
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      계좌번호
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      직원명
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      입금액
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      기입금액
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      차액
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transferData.map((data, index) => (
                    <React.Fragment key={`${data.employeeId}-${data.branchId}`}>
                      <tr className={`hover:bg-gray-50 ${(data.difference || 0) !== 0 ? 'bg-yellow-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {data.bankCode}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {data.bankName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {data.accountNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {data.employeeName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                          {(data.netPay || 0).toLocaleString()}원
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <span>{(data.totalDeposits || 0).toLocaleString()}원</span>
                            <button
                              onClick={() => toggleRow(data.employeeId)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              {expandedRows.has(data.employeeId) ? '▼' : '▶'}
                            </button>
                          </div>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                          (data.difference || 0) > 0 ? 'text-red-600' : (data.difference || 0) < 0 ? 'text-blue-600' : 'text-gray-900'
                        }`}>
                          {(data.difference || 0).toLocaleString()}원
                        </td>
                      </tr>
                      
                      {/* 펼쳐진 행 - 입금내역 상세 */}
                      {expandedRows.has(data.employeeId) && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="font-medium text-gray-900">입금내역 관리</h4>
                              
                              {/* 기존 입금내역 목록 */}
                              <div className="space-y-2">
                                {data.deposits.map((deposit) => (
                                  <div key={deposit.id} className="flex items-center space-x-4 p-3 bg-white rounded border">
                                    {editingDeposit?.id === deposit.id ? (
                                      <>
                                        <input
                                          type="date"
                                          value={deposit.depositDate.toISOString().split('T')[0]}
                                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                                          readOnly
                                        />
                                        <input
                                          type="number"
                                          value={editingDeposit.amount}
                                          onChange={(e) => setEditingDeposit(prev => prev ? {...prev, amount: Number(e.target.value) || 0} : null)}
                                          className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
                                          placeholder="입금액"
                                        />
                                        <div className="flex items-center space-x-2">
                                          <label className="flex items-center space-x-1 text-xs">
                                            <input
                                              type="radio"
                                              name={`edit-payment-${deposit.id}`}
                                              value="transfer"
                                              className="text-blue-600"
                                            />
                                            <span>계좌이체</span>
                                          </label>
                                          <label className="flex items-center space-x-1 text-xs">
                                            <input
                                              type="radio"
                                              name={`edit-payment-${deposit.id}`}
                                              value="cash"
                                              className="text-blue-600"
                                            />
                                            <span>현금지급</span>
                                          </label>
                                        </div>
                                        <input
                                          type="text"
                                          value={editingDeposit.memo}
                                          onChange={(e) => setEditingDeposit(prev => prev ? {...prev, memo: e.target.value} : null)}
                                          className="px-2 py-1 border border-gray-300 rounded text-sm flex-1"
                                          placeholder="메모"
                                        />
                                        <button
                                          onClick={() => updateDeposit(deposit.id, editingDeposit.amount, editingDeposit.memo)}
                                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                        >
                                          저장
                                        </button>
                                        <button
                                          onClick={() => setEditingDeposit(null)}
                                          className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                                        >
                                          취소
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm text-gray-600 w-24">
                                          {deposit.depositDate.toLocaleDateString('ko-KR')}
                                        </span>
                                        <span className="text-sm font-medium w-24">
                                          {deposit.amount.toLocaleString()}원
                                        </span>
                                        <span className="text-sm text-gray-600 flex-1">
                                          {deposit.memo || '-'}
                                        </span>
                                        <button
                                          onClick={() => setEditingDeposit({id: deposit.id, employeeId: data.employeeId, amount: deposit.amount, memo: deposit.memo || ''})}
                                          className="px-2 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                                        >
                                          수정
                                        </button>
                                        <button
                                          onClick={() => deleteDeposit(deposit.id)}
                                          className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                                        >
                                          삭제
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                              
                              {/* 새 입금내역 추가 */}
                              <div className="flex items-center space-x-4 p-3 bg-blue-50 rounded border">
                                <input
                                  type="date"
                                  value={new Date().toISOString().split('T')[0]}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  readOnly
                                />
                                <input
                                  type="number"
                                  value={newDeposit.employeeId === data.employeeId ? newDeposit.amount : ''}
                                  onChange={(e) => setNewDeposit(prev => ({
                                    ...prev,
                                    employeeId: data.employeeId,
                                    amount: Number(e.target.value) || 0
                                  }))}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
                                  placeholder="입금액"
                                />
                                <div className="flex items-center space-x-2">
                                  <label className="flex items-center space-x-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`new-payment-${data.employeeId}`}
                                      value="transfer"
                                      defaultChecked={data.accountNumber !== '-'}
                                      className="text-blue-600"
                                    />
                                    <span>계좌이체</span>
                                  </label>
                                  <label className="flex items-center space-x-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`new-payment-${data.employeeId}`}
                                      value="cash"
                                      defaultChecked={data.accountNumber === '-'}
                                      className="text-blue-600"
                                    />
                                    <span>현금지급</span>
                                  </label>
                                </div>
                                <input
                                  type="text"
                                  value={newDeposit.employeeId === data.employeeId ? newDeposit.memo : ''}
                                  onChange={(e) => setNewDeposit(prev => ({
                                    ...prev,
                                    employeeId: data.employeeId,
                                    memo: e.target.value
                                  }))}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm flex-1"
                                  placeholder="메모"
                                />
                                <button
                                  onClick={() => addDeposit(data.employeeId)}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                >
                                  추가
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-500 text-lg mb-2">📊</div>
              <div className="text-gray-500 text-lg mb-2">데이터 없음</div>
              <div className="text-gray-400 text-sm">
                선택한 월에 급여확정된 데이터가 없습니다.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransferFileGeneration;
