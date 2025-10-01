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
  onMonthChange?: (month: string) => void;
  onEmployeeChange?: (employeeId: string) => void;
}

const EmployeePayrollProcessing: React.FC<EmployeePayrollProcessingProps> = ({ 
  userBranch, 
  isManager,
  onMonthChange,
  onEmployeeChange
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(25); // 좌측 패널 너비 (%)
  const [isResizing, setIsResizing] = useState(false);
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

  // 급여 처리 상태 로드 (해당월, 해당직원 기준)
  const loadPayrollStatuses = useCallback(async (employeesData: Employee[]) => {
    try {
      const statuses: PayrollStatus[] = [];
      
      for (const employee of employeesData) {
        console.log(`\n=== ${employee.name} (${employee.id}) 상태 확인 시작 ===`);
        
        // 급여확정 상태 확인 (해당월, 해당직원)
        const payrollQuery = query(
          collection(db, 'confirmedPayrolls'),
          where('employeeId', '==', employee.id),
          where('month', '==', selectedMonth)
        );
        const payrollSnapshot = await getDocs(payrollQuery);
        console.log(`${employee.name} 급여확정 상태:`, payrollSnapshot.docs.length > 0 ? '있음' : '없음');
        
        // 해당 직원의 모든 지점의 근무시간비교 검토상태 확인
        const allReviewStatusQuery = query(
          collection(db, 'employeeReviewStatus'),
          where('employeeId', '==', employee.id),
          where('month', '==', selectedMonth)
        );
        const allReviewStatusSnapshot = await getDocs(allReviewStatusQuery);
        console.log(`${employee.name} 검토상태 개수:`, allReviewStatusSnapshot.docs.length);
        
        let status: '미처리' | '근무시간검토중' | '근무시간검토완료' | '급여확정완료' = '미처리';
        
        if (payrollSnapshot.docs.length > 0) {
          // 급여확정완료
          status = '급여확정완료';
          console.log(`${employee.name} 최종 상태: 급여확정완료`);
        } else if (allReviewStatusSnapshot.docs.length > 0) {
          // 근무시간비교 검토상태 확인
          const reviewStatuses = allReviewStatusSnapshot.docs.map(doc => {
            const data = doc.data();
            console.log(`${employee.name} 지점 ${data.branchId} 상태:`, data.status);
            return data.status;
          });
          
          // 직원의 모든 지점 확인 (검토상태가 없는 지점도 고려)
          const employeeBranches = employee.branches || [];
          console.log(`${employee.name} 총 지점 수:`, employeeBranches.length);
          console.log(`${employee.name} 검토상태가 있는 지점 수:`, allReviewStatusSnapshot.docs.length);
          
          // 모든 지점이 검토완료인지 확인 (검토상태가 없는 지점은 검토전으로 간주)
          const allCompleted = employeeBranches.length > 0 && 
            employeeBranches.every(branchId => {
              const branchStatus = allReviewStatusSnapshot.docs.find(doc => doc.data().branchId === branchId);
              return branchStatus && (branchStatus.data().status === '근무시간검토완료' || branchStatus.data().status === '급여확정완료');
            });
          
          const hasInProgress = allReviewStatusSnapshot.docs.some(doc => doc.data().status === '근무시간검토중');
          const hasAnyReviewStatus = allReviewStatusSnapshot.docs.length > 0;
          
          console.log(`${employee.name} 모든 지점 검토완료:`, allCompleted);
          console.log(`${employee.name} 검토중 지점 있음:`, hasInProgress);
          console.log(`${employee.name} 검토상태 있는 지점 있음:`, hasAnyReviewStatus);
          
          if (allCompleted) {
            status = '근무시간검토완료';
          } else if (hasInProgress) {
            status = '근무시간검토중';
          } else if (hasAnyReviewStatus) {
            // 검토상태는 있지만 모두 완료되지 않은 경우
            status = '근무시간검토중';
          } else {
            status = '미처리';
          }
          console.log(`${employee.name} 최종 상태:`, status);
        } else {
          // 근무시간비교 검토상태가 없으면 미처리
          status = '미처리';
          console.log(`${employee.name} 최종 상태: 미처리 (검토상태 없음)`);
        }
        
        statuses.push({
          employeeId: employee.id,
          month: selectedMonth,
          branchId: selectedBranchId || '',
          status,
          lastUpdated: new Date()
        });
      }
      
      console.log('\n=== 최종 상태 목록 ===');
      statuses.forEach(s => {
        const employee = employeesData.find(e => e.id === s.employeeId);
        console.log(`${employee?.name}: ${s.status}`);
      });
      
      setPayrollStatuses(statuses);
    } catch (error) {
      console.error('급여 처리 상태 로드 실패:', error);
    }
  }, [selectedMonth, selectedBranchId]);

  // 🔥 최적화: selectedBranchId 자동 설정 제거
  // 사용자가 선택한 지점 필터를 유지하고, 직원 선택 시 자동으로 변경하지 않음
  // useEffect(() => {
  //   if (selectedEmployee && selectedEmployee.branches && selectedEmployee.branches.length > 0 && selectedBranchId === undefined) {
  //     setSelectedBranchId(selectedEmployee.branches[0]);
  //     console.log('EmployeePayrollProcessing - selectedBranchId 자동 설정:', selectedEmployee.branches[0]);
  //   }
  // }, [selectedEmployee, selectedBranchId]);

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
      
      // 관리자, 매니저 모두 전지점 기본 선택
      // (매니저는 필터가 보이지 않으므로 실제로는 자신의 지점만 보임)
      setSelectedBranchId(''); // 전지점 기본 선택
    } catch (error) {
      console.error('지점 목록 로드 실패:', error);
    }
  }, [isManager, userBranch]);

  // 월 초기화 (매월 5일까지는 전달 급여)
  useEffect(() => {
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
    
    const currentMonth = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  // 🔥 최적화: 지점 목록은 컴포넌트 마운트 시 한 번만
  useEffect(() => {
    loadBranches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 최적화: 직원 목록은 월이 변경될 때만 로드
  useEffect(() => {
    if (selectedMonth) {
      loadEmployees();
    }
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // 필터링된 직원 목록
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '전체' || 
      payrollStatuses.find(status => status.employeeId === employee.id)?.status === statusFilter;
    
    // 지점 필터링
    const matchesBranch = selectedBranchId === '' || 
      (employee.branches && employee.branches.includes(selectedBranchId));
    
    return matchesSearch && matchesStatus && matchesBranch;
  });

  // 직원 선택 핸들러
  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    setSelectedEmployeeId(employee.id);
    console.log('EmployeePayrollProcessing - 직원 선택됨:', employee.name, employee.id);
    onEmployeeChange?.(employee.id);
    console.log('EmployeePayrollProcessing - onEmployeeChange 호출됨:', employee.id);
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

      {/* 상단 컨트롤 - 월 선택만 */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">처리할 월</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              onMonthChange?.(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {/* 좌측: 직원 목록 */}
        <div style={{ width: `${leftPanelWidth}%` }}>
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">직원 목록</h3>
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
              
              {/* 지점 필터 */}
              {!isManager && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">지점 필터</label>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">전지점</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
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
                      className={`p-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 flex items-center text-sm">
                            {employee.name}
                            {(() => {
                              // 직원관리와 동일한 로직: contracts 배열에서 해당 직원의 계약서 확인
                              const hasContract = contracts.some(contract => contract.employeeId === employee.id);
                              // 디버깅용 로그 제거
                              // if (employee.name === '김상미') {
                              //   console.log('김상미 계약서 확인:', {
                              //     employeeId: employee.id,
                              //     hasContract,
                              //     contractsCount: contracts.length,
                              //     contracts: contracts.filter(c => c.employeeId === employee.id)
                              //   });
                              // }
                              return !hasContract && (
                                <span className="ml-2 text-red-500 text-sm" title="근로계약정보 없음">⚠️</span>
                              );
                            })()}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(() => {
                              // 근로계약정보가 있는지 확인
                              const hasContract = contracts.some(contract => contract.employeeId === employee.id);
                              if (!hasContract) {
                                return '근로계약정보 없음';
                              }
                              return employee.employmentType && employee.employmentType !== '정규직' && employee.employmentType !== '아르바이트' 
                                ? employee.employmentType 
                                : '근로소득';
                            })()} | {(() => {
                              const hasContract = contracts.some(contract => contract.employeeId === employee.id);
                              if (!hasContract) {
                                return '미설정';
                              }
                              return employee.salaryType || '시급';
                            })()}
                          </div>
                        </div>
                        <div className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
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

        {/* 리사이저 */}
        <div
          className="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            
            const handleMouseMove = (e: MouseEvent) => {
              const container = (e.target as HTMLElement)?.closest('.flex');
              if (!container) return;
              
              const containerRect = container.getBoundingClientRect();
              const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
              
              // 최소 15%, 최대 40%로 제한
              if (newWidth >= 15 && newWidth <= 40) {
                setLeftPanelWidth(newWidth);
              }
            };
            
            const handleMouseUp = () => {
              setIsResizing(false);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />

        {/* 우측: 탭 콘텐츠 */}
        <div style={{ width: `${100 - leftPanelWidth}%` }}>
          {selectedEmployee ? (
            <>
              {/* 선택된 직원 표시 - 흰색 상자 바깥 */}
              {selectedEmployeeId && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-lg shadow-sm mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="h-4 w-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          현재 선택된 직원
                        </p>
                        <p className="text-xs text-gray-600">
                          근무시간비교 및 급여계산 작업에 사용됩니다
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {selectedEmployee?.name || selectedEmployeeId}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 탭 메뉴가 있는 흰색 상자 */}
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
                    onClick={() => {
                      console.log('EmployeePayrollProcessing - 급여계산작업 탭 클릭됨');
                      console.log('EmployeePayrollProcessing - 이전 activeTab:', activeTab);
                      setActiveTab('payroll-calculation');
                      console.log('EmployeePayrollProcessing - 새로운 activeTab 설정됨: payroll-calculation');
                    }}
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
                  <>
                    {console.log('EmployeePayrollProcessing - PayrollCalculation 렌더링 조건:', { activeTab, selectedEmployeeId, selectedMonth })}
                    <PayrollCalculation
                      userBranch={selectedBranchId}
                      isManager={isManager}
                      selectedEmployeeId={selectedEmployeeId}
                      selectedMonth={selectedMonth}
                      onPayrollStatusChange={() => {
                        // 급여확정 상태 변경 시 직원 목록과 상태 다시 로드
                        loadEmployees();
                      }}
                    />
                  </>
                )}
              </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {/* 선택된 직원 표시 */}
              {selectedEmployeeId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-700">
                          <span className="font-medium">현재 선택된 직원:</span> 
                          <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                            {selectedEmployeeId}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-blue-600">
                      근무시간비교 • 급여계산작업에서 사용됩니다
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="text-gray-400 text-lg mb-2">👥</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">직원을 선택하세요</h3>
                <p className="text-gray-600">좌측에서 직원을 선택하면 근무시간비교 및 급여계산 작업을 진행할 수 있습니다.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeePayrollProcessing;
