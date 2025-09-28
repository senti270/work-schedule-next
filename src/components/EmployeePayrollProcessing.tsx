'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import WorkTimeComparison from './WorkTimeComparison';
import PayrollCalculation from './PayrollCalculation';

interface Employee {
  id: string;
  name: string;
  employmentType: string;
  salaryType: string;
  branches: string[];
  probationStartDate?: Date;
  probationEndDate?: Date;
  resignationDate?: Date;
}

interface Branch {
  id: string;
  name: string;
}

interface PayrollStatus {
  employeeId: string;
  month: string;
  branchId: string;
  status: '미처리' | '근무시간검토중' | '근무시간검토완료' | '급여확정완료';
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
  userBranch, 
  isManager 
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [payrollStatuses, setPayrollStatuses] = useState<PayrollStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'work-comparison' | 'payroll-calculation'>('work-comparison');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [contracts, setContracts] = useState<{
    id: string;
    employeeId: string;
    employeeName: string;
    employmentType: string;
    salaryType: string;
    hourlyWage?: number;
    monthlySalary?: number;
    probationStartDate?: Date;
    probationEndDate?: Date;
    startDate: Date;
    endDate?: Date;
    createdAt: Date;
    updatedAt: Date;
  }[]>([]);

  // 근로계약 정보 로드
  const loadContracts = useCallback(async () => {
    try {
      console.log('근로계약 정보 로드 시작');
      const contractsSnapshot = await getDocs(collection(db, 'employmentContracts'));
      const contractsData = contractsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          employmentType: data.employmentType,
          salaryType: data.salaryType,
          hourlyWage: data.hourlyWage,
          monthlySalary: data.monthlySalary,
          probationStartDate: data.probationStartDate?.toDate ? data.probationStartDate.toDate() : data.probationStartDate,
          probationEndDate: data.probationEndDate?.toDate ? data.probationEndDate.toDate() : data.probationEndDate,
          startDate: data.startDate?.toDate ? data.startDate.toDate() : data.startDate,
          endDate: data.endDate?.toDate ? data.endDate.toDate() : data.endDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
        };
      });
      console.log('근로계약 정보 로드 완료:', contractsData.length, '개');
      setContracts(contractsData);
    } catch (error) {
      console.error('근로계약 정보 로드 실패:', error);
    }
  }, []);

  // 급여 처리 상태 로드
  const loadPayrollStatuses = useCallback(async (employeesData: Employee[]) => {
    try {
      const statuses: PayrollStatus[] = [];
      
      for (const employee of employeesData) {
        // 근무시간비교 완료 상태 확인 (선택된 지점이 있으면 해당 지점만, 없으면 모든 지점)
        const workTimeQuery = selectedBranchId 
          ? query(
              collection(db, 'actualWorkRecords'),
              where('employeeId', '==', employee.id),
              where('month', '==', selectedMonth),
              where('branchId', '==', selectedBranchId)
            )
          : query(
              collection(db, 'actualWorkRecords'),
              where('employeeId', '==', employee.id),
              where('month', '==', selectedMonth)
            );
        
        const workTimeSnapshot = await getDocs(workTimeQuery);
        
        // 급여확정 상태 확인
        const payrollQuery = query(
          collection(db, 'payrollRecords'),
          where('employeeId', '==', employee.id),
          where('month', '==', selectedMonth),
          where('branchId', '==', selectedBranchId || '')
        );
        const payrollSnapshot = await getDocs(payrollQuery);
        
        let status: '미처리' | '근무시간검토중' | '근무시간검토완료' | '급여확정완료' = '미처리';
        
        if (payrollSnapshot.docs.length > 0) {
          status = '급여확정완료';
        } else if (workTimeSnapshot.docs.length > 0) {
          // 근무시간비교 데이터가 있는지 확인
          const hasWorkTimeData = workTimeSnapshot.docs.length > 0;
          status = hasWorkTimeData ? '근무시간검토완료' : '근무시간검토완료';
        } else {
          // 근무시간비교 데이터가 있는지 확인
          const hasWorkTimeData = workTimeSnapshot.docs.length > 0;
          status = hasWorkTimeData ? '근무시간검토중' : '미처리';
        }
        
        statuses.push({
          employeeId: employee.id,
          month: selectedMonth,
          branchId: selectedBranchId || '',
          status,
          lastUpdated: new Date()
        });
      }
      
      setPayrollStatuses(statuses);
    } catch (error) {
      console.error('급여 처리 상태 로드 실패:', error);
    }
  }, [selectedMonth, selectedBranchId]);

  // 직원 목록 로드 (현재 재직중인 전직원)
  const loadEmployees = useCallback(async () => {
    if (!selectedMonth) return;

    try {
      setLoading(true);
      
      // 근로계약 정보 먼저 로드
      await loadContracts();
      
      // 현재 재직중인 전직원 로드 (퇴사일이 없거나 미래인 직원)
      const now = new Date();
      const employeesQuery = query(
        collection(db, 'employees'),
        orderBy('name')
      );
      
      const employeesSnapshot = await getDocs(employeesQuery);
      
      const employeesData = employeesSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            employmentType: data.type || data.employmentType,
            salaryType: data.salaryType,
            branches: data.branches && data.branches.length > 0 ? data.branches : (data.branchId ? [data.branchId] : []),
            probationStartDate: data.probationStartDate?.toDate ? data.probationStartDate.toDate() : data.probationStartDate,
            probationEndDate: data.probationEndDate?.toDate ? data.probationEndDate.toDate() : data.probationEndDate,
            resignationDate: data.resignationDate?.toDate ? data.resignationDate.toDate() : data.resignationDate
          };
        })
        .filter(employee => {
          // 재직중인 직원만 필터링 (퇴사일이 없거나 미래인 경우)
          return !employee.resignationDate || employee.resignationDate > now;
        });

      setEmployees(employeesData);
      
      // 급여 처리 상태 로드
      await loadPayrollStatuses(employeesData);
      
    } catch (error) {
      console.error('직원 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, loadContracts, loadPayrollStatuses]);

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
      
      // 매니저인 경우 자동으로 해당 지점 선택, 관리자는 전지점 기본 선택
      if (isManager && userBranch) {
        setSelectedBranchId(userBranch.id);
      } else {
        setSelectedBranchId(''); // 전지점 기본 선택
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
    if (selectedMonth) {
      loadEmployees();
    }
  }, [selectedMonth, loadEmployees, loadContracts]);

  // 필터링된 직원 목록
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '전체' || 
      payrollStatuses.find(status => status.employeeId === employee.id)?.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // 직원 선택 핸들러
  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    setSelectedEmployeeId(employee.id);
    console.log('선택된 직원:', employee);
    console.log('선택된 직원의 지점:', employee.branches);
  };

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case '미처리': return 'text-red-600 bg-red-50';
      case '근무시간검토중': return 'text-yellow-600 bg-yellow-50';
      case '근무시간검토완료': return 'text-blue-600 bg-blue-50';
      case '급여계산완료': return 'text-purple-600 bg-purple-50';
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 지점 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">지점 선택</label>
            {isManager ? (
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700">
                {userBranch?.name || '지점 정보 없음'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedBranchId('')}
                  className={`px-3 py-2 rounded-md font-medium text-sm transition-colors ${
                    selectedBranchId === ''
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  전지점
                </button>
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => setSelectedBranchId(branch.id)}
                    className={`px-3 py-2 rounded-md font-medium text-sm transition-colors ${
                      selectedBranchId === branch.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            )}
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
            
            {/* 검색 및 필터 */}
            <div className="p-4 border-b border-gray-200 space-y-3">
              {/* 검색 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">직원 검색</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="직원명으로 검색..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              
              {/* 상태 필터 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상태 필터</label>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="전체">전체</option>
                        <option value="미처리">미처리</option>
                        <option value="근무시간검토중">근무시간검토중</option>
                        <option value="근무시간검토완료">근무시간검토완료</option>
                        <option value="급여계산완료">급여계산완료</option>
                        <option value="급여확정완료">급여확정완료</option>
                      </select>
              </div>
            </div>
            
            <div>
              {loading ? (
                <div className="p-4 text-center text-gray-500">로딩 중...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-4 text-center text-gray-500">직원이 없습니다</div>
              ) : (
                (() => {
                  console.log('직원 목록 렌더링:', filteredEmployees.length, '명');
                  return filteredEmployees.map(employee => {
                  const status = payrollStatuses.find(s => s.employeeId === employee.id)?.status || '미처리';
                  const isSelected = selectedEmployeeId === employee.id;
                  
                  return (
                    <div
                      key={employee.id}
                      onClick={() => {
                        console.log('직원 클릭됨:', employee.name);
                        handleEmployeeSelect(employee);
                      }}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 flex items-center">
                            {employee.name}
                            {(() => {
                              // 직원관리와 동일한 로직: contracts 배열에서 해당 직원의 계약서 확인
                              const hasContract = contracts.some(contract => contract.employeeId === employee.id);
                              if (employee.name === '김상미') {
                                console.log('김상미 계약서 확인:', {
                                  employeeId: employee.id,
                                  hasContract,
                                  contractsCount: contracts.length,
                                  contracts: contracts.filter(c => c.employeeId === employee.id)
                                });
                              }
                              return !hasContract && (
                                <span className="ml-2 text-red-500 text-lg" title="근로계약정보 없음">⚠️</span>
                              );
                            })()}
                          </div>
                          <div className="text-sm text-gray-500">
                            {employee.employmentType && employee.employmentType !== '정규직' && employee.employmentType !== '아르바이트' 
                              ? employee.employmentType 
                              : '근로소득'} | {employee.salaryType || '시급'}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status}
                        </div>
                      </div>
                    </div>
                  );
                });
                })()
              )}
            </div>
          </div>
        </div>

        {/* 우측: 탭 콘텐츠 */}
        <div className="lg:col-span-3">
          {selectedEmployee ? (
            <div className="bg-white rounded-lg shadow">
              {/* 탭 헤더 */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('work-comparison')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'work-comparison'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    근무시간비교
                  </button>
                  <button
                    onClick={() => setActiveTab('payroll-calculation')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'payroll-calculation'
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
                {activeTab === 'work-comparison' && (
                  <WorkTimeComparison 
                    userBranch={selectedBranchId ? branches.find(b => b.id === selectedBranchId) : undefined}
                    isManager={isManager}
                    selectedEmployeeId={selectedEmployeeId}
                    selectedMonth={selectedMonth}
                    selectedBranchId={selectedBranchId}
                    hideEmployeeSelection={true}
                    hideBranchSelection={true}
                    selectedEmployeeBranches={selectedEmployee?.branches || []}
                  />
                )}

                {activeTab === 'payroll-calculation' && (
                  <PayrollCalculation 
                    userBranch={selectedBranchId ? branches.find(b => b.id === selectedBranchId) : undefined}
                    isManager={isManager}
                  />
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
