'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';

interface Employee {
  id: string;
  name: string;
  employmentType: string;
  salaryType: string;
  branches: string[];
  probationStartDate?: Date;
  probationEndDate?: Date;
}

interface Branch {
  id: string;
  name: string;
}

interface PayrollStatus {
  employeeId: string;
  month: string;
  branchId: string;
  status: '미처리' | '근무시간확인완료' | '급여계산완료' | '급여확정완료';
  lastUpdated: Date;
}

interface EmployeePayrollProcessingProps {
  user: User;
  userBranch?: {
    id: string;
    name: string;
  } | null;
  isManager: boolean;
}

const EmployeePayrollProcessing: React.FC<EmployeePayrollProcessingProps> = ({ 
  user, 
  userBranch, 
  isManager 
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'workTime' | 'payroll'>('workTime');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [payrollStatuses, setPayrollStatuses] = useState<PayrollStatus[]>([]);
  const [loading, setLoading] = useState(false);

  // 직원 목록 로드
  const loadEmployees = useCallback(async () => {
    if (!selectedBranchId || !selectedMonth) return;

    try {
      setLoading(true);
      
      // 지점별 직원 로드
      const employeesQuery = query(
        collection(db, 'employees'),
        where('branches', 'array-contains', selectedBranchId),
        orderBy('name')
      );
      
      const employeesSnapshot = await getDocs(employeesQuery);
      const employeesData = employeesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          employmentType: data.employmentType,
          salaryType: data.salaryType,
          branches: data.branches || [],
          probationStartDate: data.probationStartDate?.toDate(),
          probationEndDate: data.probationEndDate?.toDate()
        };
      });

      setEmployees(employeesData);
      
      // 급여 처리 상태 로드
      await loadPayrollStatuses(employeesData);
      
    } catch (error) {
      console.error('직원 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, selectedMonth]);

  // 급여 처리 상태 로드
  const loadPayrollStatuses = async (employeesData: Employee[]) => {
    try {
      const statuses: PayrollStatus[] = [];
      
      for (const employee of employeesData) {
        // 근무시간비교 완료 상태 확인
        const workTimeQuery = query(
          collection(db, 'workTimeComparisonResults'),
          where('employeeId', '==', employee.id),
          where('month', '==', selectedMonth),
          where('branchId', '==', selectedBranchId)
        );
        
        const workTimeSnapshot = await getDocs(workTimeQuery);
        const workTimeCompleted = workTimeSnapshot.docs.length > 0 && 
          workTimeSnapshot.docs.every(doc => doc.data().status === 'review_completed');
        
        // 급여계산 완료 상태 확인
        const payrollQuery = query(
          collection(db, 'payrollRecords'),
          where('employeeId', '==', employee.id),
          where('month', '==', selectedMonth),
          where('branchId', '==', selectedBranchId)
        );
        
        const payrollSnapshot = await getDocs(payrollQuery);
        const payrollConfirmed = payrollSnapshot.docs.length > 0;
        
        let status: '미처리' | '근무시간확인완료' | '급여계산완료' | '급여확정완료';
        
        if (payrollConfirmed) {
          status = '급여확정완료';
        } else if (workTimeCompleted) {
          status = '근무시간확인완료';
        } else {
          status = '미처리';
        }
        
        statuses.push({
          employeeId: employee.id,
          month: selectedMonth,
          branchId: selectedBranchId,
          status,
          lastUpdated: new Date()
        });
      }
      
      setPayrollStatuses(statuses);
    } catch (error) {
      console.error('급여 처리 상태 로드 실패:', error);
    }
  };

  // 지점 목록 로드
  const loadBranches = useCallback(async () => {
    try {
      const branchesQuery = query(collection(db, 'branches'), orderBy('name'));
      const branchesSnapshot = await getDocs(branchesQuery);
      const branchesData = branchesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      
      setBranches(branchesData);
      
      // 매니저인 경우 자동으로 해당 지점 선택
      if (isManager && userBranch) {
        setSelectedBranchId(userBranch.id);
      }
    } catch (error) {
      console.error('지점 목록 로드 실패:', error);
    }
  }, [isManager, userBranch]);

  // 월 초기화
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  // 지점 목록 로드
  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // 직원 목록 로드
  useEffect(() => {
    if (selectedBranchId && selectedMonth) {
      loadEmployees();
    }
  }, [selectedBranchId, selectedMonth, loadEmployees]);

  // 필터링된 직원 목록
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '전체' || 
      payrollStatuses.find(status => status.employeeId === employee.id)?.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case '미처리': return 'text-red-600 bg-red-50';
      case '근무시간확인완료': return 'text-yellow-600 bg-yellow-50';
      case '급여계산완료': return 'text-blue-600 bg-blue-50';
      case '급여확정완료': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">직원별 급여처리</h1>
        <p className="text-gray-600 mt-1">직원별로 근무시간 비교 및 급여계산을 체계적으로 관리합니다</p>
      </div>

      {/* 상단 컨트롤 */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 지점 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">지점</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isManager}
            >
              <option value="">지점을 선택하세요</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>

          {/* 월 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">처리할 월</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 상태 필터 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상태 필터</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="전체">전체</option>
              <option value="미처리">미처리</option>
              <option value="근무시간확인완료">근무시간확인완료</option>
              <option value="급여계산완료">급여계산완료</option>
              <option value="급여확정완료">급여확정완료</option>
            </select>
          </div>
        </div>

        {/* 검색 */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">직원 검색</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="직원명으로 검색..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 좌측: 직원 목록 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">직원 목록</h3>
              <p className="text-sm text-gray-500 mt-1">
                총 {filteredEmployees.length}명
              </p>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">로딩 중...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-4 text-center text-gray-500">직원이 없습니다</div>
              ) : (
                filteredEmployees.map(employee => {
                  const status = payrollStatuses.find(s => s.employeeId === employee.id)?.status || '미처리';
                  const isSelected = selectedEmployeeId === employee.id;
                  
                  return (
                    <div
                      key={employee.id}
                      onClick={() => setSelectedEmployeeId(employee.id)}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{employee.name}</div>
                          <div className="text-sm text-gray-500">
                            {employee.employmentType} • {employee.salaryType}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 우측: 탭 콘텐츠 */}
        <div className="lg:col-span-3">
          {selectedEmployeeId ? (
            <div className="bg-white rounded-lg shadow">
              {/* 탭 헤더 */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('workTime')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'workTime'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    근무시간비교
                  </button>
                  <button
                    onClick={() => setActiveTab('payroll')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'payroll'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    급여계산작업
                  </button>
                </nav>
              </div>

              {/* 탭 콘텐츠 */}
              <div className="p-6">
                {activeTab === 'workTime' ? (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">근무시간비교</h3>
                    <p className="text-gray-600">근무시간비교 컴포넌트가 여기에 표시됩니다.</p>
                    {/* TODO: WorkTimeComparison 컴포넌트 임베드 */}
                  </div>
                ) : (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">급여계산작업</h3>
                    <p className="text-gray-600">급여계산 컴포넌트가 여기에 표시됩니다.</p>
                    {/* TODO: PayrollCalculation 컴포넌트 임베드 */}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-400 text-lg mb-2">👥</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">직원을 선택하세요</h3>
              <p className="text-gray-600">좌측에서 직원을 선택하면 근무시간비교 및 급여계산 작업을 진행할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeePayrollProcessing;
