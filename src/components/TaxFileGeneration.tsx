'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string;
  confirmedAt: Date;
  grossPay: number;
  deductions: number;
  netPay: number;
  branches: {
    branchId: string;
    branchName: string;
    workHours: number;
  }[];
}

interface Employee {
  id: string;
  name: string;
  residentNumber?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
}

interface Branch {
  id: string;
  name: string;
}

const TaxFileGeneration: React.FC = () => {
  // 현재 월을 기본값으로 설정
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };
  
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [confirmedPayrolls, setConfirmedPayrolls] = useState<ConfirmedPayroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

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
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
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
      
      const confirmedPayrollsData = confirmedPayrollsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        confirmedAt: doc.data().confirmedAt?.toDate() || new Date()
      })) as ConfirmedPayroll[];
      
      setConfirmedPayrolls(confirmedPayrollsData);
    } catch (error) {
      console.error('확정된 급여 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  // 컴포넌트 마운트 시 초기 데이터 로드
  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, [loadBranches, loadEmployees]);

  // 월이 변경될 때 확정된 급여 데이터 로드
  useEffect(() => {
    loadConfirmedPayrolls();
  }, [loadConfirmedPayrolls]);

  // 지점별 필터링된 데이터
  const filteredPayrolls = selectedBranchId 
    ? confirmedPayrolls.filter(payroll => payroll.branchId === selectedBranchId)
    : confirmedPayrolls;

  // 테이블 데이터 생성
  const tableData = filteredPayrolls.map(payroll => {
    const employee = employees.find(emp => emp.id === payroll.employeeId);
    return {
      residentNumber: employee?.residentNumber || '정보없음',
      bankName: employee?.bankName || '정보없음',
      bankCode: employee?.bankCode || '정보없음',
      accountNumber: employee?.accountNumber || '정보없음',
      netPay: payroll.netPay,
      employeeName: payroll.employeeName,
      grossPay: payroll.grossPay
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">세무사 전송파일 생성</h1>
        <p className="text-gray-600">급여확정된 데이터를 기반으로 세무사 전송파일을 생성합니다.</p>
      </div>

      {/* 월 선택 */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">처리할 월</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
              세무사 전송 데이터 ({filteredPayrolls.length}건)
            </h3>
          </div>
          
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-500">로딩 중...</div>
            </div>
          ) : tableData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      주민번호
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      은행
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      은행코드
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      계좌번호
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      지급액
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      성명
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      신고총액(월급여)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tableData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.residentNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.bankName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.bankCode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.accountNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        {row.netPay.toLocaleString()}원
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.employeeName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        {row.grossPay.toLocaleString()}원
                      </td>
                    </tr>
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

export default TaxFileGeneration;
