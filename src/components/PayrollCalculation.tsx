'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Employee {
  id: string;
  name: string;
  type?: string;
  status?: string;
  branchNames?: string[];
  hasComparison?: boolean;
  comparisonData?: {
    employeeId: string;
    branchId: string;
    comparisonDate: Date;
    [key: string]: unknown;
  };
  // 근로계약 정보
  employmentType?: string;
  salaryType?: 'hourly' | 'monthly';
  weeklyWorkHours?: number;
  // 검토 상태
  reviewStatus?: '검토전' | '검토중' | '검토완료';
}

interface Branch {
  id: string;
  name: string;
}

interface PayrollCalculationProps {
  userBranch?: {
    id: string;
    name: string;
    managerId?: string;
  } | null;
  isManager: boolean;
}

const PayrollCalculation: React.FC<PayrollCalculationProps> = ({ userBranch, isManager }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [payrollData, setPayrollData] = useState<{
    totalWorkHours: number;
    hourlyWage: number;
    monthlySalary: number;
    actualPayment: number;
  } | null>(null);
  const [employeeMemos, setEmployeeMemos] = useState<{[employeeId: string]: string}>({});
  const [payrollConfirmedEmployees, setPayrollConfirmedEmployees] = useState<string[]>([]);
  const [branchWorkHours, setBranchWorkHours] = useState<{
    branchId: string;
    branchName: string;
    workHours: number;
    reviewStatus: '검토전' | '검토중' | '검토완료';
  }[]>([]);

  useEffect(() => {
    loadBranches();
    
    // 현재 월을 기본값으로 설정
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
    
    // 매니저인 경우 해당 지점을 기본 선택
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
    }
  }, [isManager, userBranch]);

  useEffect(() => {
    if (selectedBranchId && selectedMonth) {
      loadEmployees();
    }
  }, [selectedBranchId, selectedMonth]);

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      
      // 한국어 순으로 정렬
      branchesData.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 로드 중 오류:', error);
    }
  };

  const loadEmployees = async () => {
    if (!selectedBranchId || !selectedMonth) return;
    
    try {
      setLoading(true);
      
      // 선택된 월의 첫째 날과 마지막 날 계산
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      console.log('급여계산 - 조회 기간:', {
        selectedBranchId,
        selectedMonth,
        monthStart: monthStart.toDateString(),
        monthEnd: monthEnd.toDateString()
      });
      
      // 해당 월에 스케줄이 있는 직원들의 ID 찾기
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const employeeIdsWithSchedules = new Set<string>();
      
      schedulesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const scheduleDate = data.date?.toDate();
        const scheduleBranchId = data.branchId;
        
        if (scheduleDate && 
            scheduleDate >= monthStart && 
            scheduleDate <= monthEnd &&
            scheduleBranchId === selectedBranchId) {
          employeeIdsWithSchedules.add(data.employeeId);
        }
      });
      
      console.log('스케줄이 있는 직원 IDs:', Array.from(employeeIdsWithSchedules));
      
      // 직원 정보 로드
      const employeesData = [];
      for (const employeeId of employeeIdsWithSchedules) {
        const employeeDoc = await getDocs(query(collection(db, 'employees'), where('__name__', '==', employeeId)));
        if (!employeeDoc.empty) {
          const doc = employeeDoc.docs[0];
          const employeeData: Employee = {
            id: doc.id,
            name: doc.data().name || '',
            type: doc.data().type || '',
            status: doc.data().status || 'active',
            branchNames: [] // 지점명은 별도로 로드
          };
          
          // 근로계약 정보 로드 (최신 계약)
          const contractsSnapshot = await getDocs(
            query(collection(db, 'employmentContracts'), where('employeeId', '==', doc.id))
          );
          
          if (!contractsSnapshot.empty) {
            // 최신 계약서 찾기 (startDate 기준)
            const latestContract = contractsSnapshot.docs.reduce((latest, current) => {
              const latestDate = latest.data().startDate?.toDate();
              const currentDate = current.data().startDate?.toDate();
              return (!latestDate || (currentDate && currentDate > latestDate)) ? current : latest;
            });
            
            const contractData = latestContract.data();
            employeeData.employmentType = contractData.employmentType;
            employeeData.salaryType = contractData.salaryType;
            employeeData.weeklyWorkHours = contractData.weeklyWorkHours;
          }
          
          // 직원-지점 관계 로드
          const employeeBranchesSnapshot = await getDocs(
            query(collection(db, 'employeeBranches'), where('employeeId', '==', doc.id))
          );
          
          const branchNames: string[] = [];
          for (const ebDoc of employeeBranchesSnapshot.docs) {
            const branchId = ebDoc.data().branchId;
            const branch = branches.find(b => b.id === branchId);
            if (branch) {
              branchNames.push(branch.name);
            }
          }
          
          employeeData.branchNames = branchNames;
          employeesData.push(employeeData);
        }
      }
      
      // 직원별 검토 상태 확인
      const reviewStatusSnapshot = await getDocs(
        query(
          collection(db, 'employeeReviewStatus'),
          where('month', '==', selectedMonth),
          where('branchId', '==', selectedBranchId)
        )
      );
      
      const reviewStatusMap = new Map<string, string>();
      reviewStatusSnapshot.docs.forEach(doc => {
        const data = doc.data();
        reviewStatusMap.set(data.employeeId, data.status);
      });
      
      console.log('검토 상태 맵:', Object.fromEntries(reviewStatusMap));
      
      // 직원 데이터에 검토 상태 추가
      const employeesWithStatus = employeesData.map(emp => {
        const reviewStatus = reviewStatusMap.get(emp.id) || '검토전';
        const isReviewCompleted = reviewStatus === '검토완료';
        
        return {
          ...emp,
          hasComparison: isReviewCompleted,
          reviewStatus: reviewStatus as '검토전' | '검토중' | '검토완료'
        };
      });
      
      console.log('급여계산 직원 목록:', employeesWithStatus);
      setEmployees(employeesWithStatus);
      
      // 급여확정된 직원 로드
      await loadPayrollConfirmedEmployees();
      
      // 직원별 메모 로드
      await loadEmployeeMemos();
      
    } catch (error) {
      console.error('직원 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 급여 계산 함수
  const calculatePayroll = async (employeeId: string) => {
    if (!selectedMonth) return;
    
    try {
      const employee = employees.find(emp => emp.id === employeeId);
      if (!employee) return;
      
      console.log('급여 계산 시작:', employee.name, employee.employmentType, employee.salaryType);
      
      // 해당 월의 모든 지점 실제 근무 데이터 가져오기
      const actualWorkQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth)
      );
      const actualWorkSnapshot = await getDocs(actualWorkQuery);
      
      // 지점별 근무시간 계산
      const branchWorkHoursMap = new Map<string, number>();
      actualWorkSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const branchId = data.branchId;
        const workHours = data.actualHours || 0;
        
        if (branchWorkHoursMap.has(branchId)) {
          branchWorkHoursMap.set(branchId, branchWorkHoursMap.get(branchId)! + workHours);
        } else {
          branchWorkHoursMap.set(branchId, workHours);
        }
      });
      
      // 지점별 검토 상태 확인
      const branchWorkHoursList = [];
      for (const [branchId, workHours] of branchWorkHoursMap) {
        const branch = branches.find(b => b.id === branchId);
        const branchName = branch ? branch.name : '알 수 없는 지점';
        
        // 해당 지점의 검토 상태 확인
        const reviewStatusQuery = query(
          collection(db, 'employeeReviewStatus'),
          where('employeeId', '==', employeeId),
          where('month', '==', selectedMonth),
          where('branchId', '==', branchId)
        );
        const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
        
        let reviewStatus: '검토전' | '검토중' | '검토완료' = '검토전';
        if (!reviewStatusSnapshot.empty) {
          reviewStatus = reviewStatusSnapshot.docs[0].data().status;
        }
        
        branchWorkHoursList.push({
          branchId,
          branchName,
          workHours,
          reviewStatus
        });
      }
      
      setBranchWorkHours(branchWorkHoursList);
      
      // 전체 근무시간 합산
      let totalWorkHours = 0;
      branchWorkHoursList.forEach(branch => {
        totalWorkHours += branch.workHours;
      });
      
      // 해당 월에 유효했던 근로계약 정보에서 시급 가져오기
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      
      const contractQuery = query(
        collection(db, 'employmentContracts'),
        where('employeeId', '==', employeeId)
      );
      const contractSnapshot = await getDocs(contractQuery);
      
      let hourlyWage = 0;
      if (!contractSnapshot.empty) {
        // 해당 월에 유효했던 계약서 찾기
        const validContracts = contractSnapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              startDate: data.startDate?.toDate() || new Date(),
              endDate: data.endDate?.toDate() || null,
              salaryAmount: data.salaryAmount || 0,
              employmentType: data.employmentType || ''
            };
          })
          .filter(contract => {
            // 해당 월에 유효했던 계약서인지 확인
            const contractStart = contract.startDate;
            const contractEnd = contract.endDate || new Date(2099, 11, 31); // 종료일이 없으면 미래로 설정
            
            return contractStart <= monthEnd && contractEnd >= monthStart;
          });
        
        if (validContracts.length > 0) {
          // 해당 월에 유효한 계약서 중 가장 최신 것 사용
          validContracts.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
          hourlyWage = validContracts[0].salaryAmount || 0;
          console.log(`해당 월(${selectedMonth})에 유효한 시급: ${hourlyWage}원`);
        } else {
          // 해당 월에 유효한 계약서가 없으면 최신 계약서 사용 (fallback)
          const allContracts = contractSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              startDate: data.startDate?.toDate() || new Date(),
              salaryAmount: data.salaryAmount || 0,
              employmentType: data.employmentType || ''
            };
          });
          allContracts.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
          hourlyWage = allContracts[0].salaryAmount || 0;
          console.log(`해당 월에 유효한 계약서 없음, 최신 시급 사용: ${hourlyWage}원`);
        }
      }
      
      // 급여 계산
      let monthlySalary = 0;
      let actualPayment = 0;
      
      if (employee.employmentType === '외국인' && employee.salaryType === 'hourly') {
        // 외국인 시급: 월급여 = 총 근무시간 * 시급, 실지급금액 = 월급여 * 0.967
        monthlySalary = totalWorkHours * hourlyWage;
        actualPayment = monthlySalary * 0.967;
      }
      
      setPayrollData({
        totalWorkHours,
        hourlyWage,
        monthlySalary,
        actualPayment
      });
      
      console.log('급여 계산 완료:', {
        totalWorkHours,
        hourlyWage,
        monthlySalary,
        actualPayment
      });
      
    } catch (error) {
      console.error('급여 계산 중 오류:', error);
    }
  };

  // 급여확정 함수
  const cancelPayroll = async () => {
    if (!selectedEmployeeId || !selectedMonth || !selectedBranchId) return;
    
    try {
      // 급여확정 기록 삭제
      const payrollQuery = query(
        collection(db, 'payrollRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      
      const payrollSnapshot = await getDocs(payrollQuery);
      
      if (!payrollSnapshot.empty) {
        for (const doc of payrollSnapshot.docs) {
          await deleteDoc(doc.ref);
        }
        console.log('급여확정 기록 삭제됨');
      }
      
      // 급여확정된 직원 목록에서 제거
      setPayrollConfirmedEmployees(prev => 
        prev.filter(id => id !== selectedEmployeeId)
      );
      
      // 상태 초기화
      setSelectedEmployeeId('');
      setPayrollData(null);
      setBranchWorkHours([]);
      
      alert('급여확정이 취소되었습니다.');
      
      // 직원 목록 다시 로드
      await loadEmployees();
      
    } catch (error) {
      console.error('급여확정 취소 실패:', error);
      alert('급여확정 취소에 실패했습니다.');
    }
  };

  const confirmPayroll = async () => {
    if (!selectedEmployeeId || !payrollData) return;
    
    try {
      const employee = employees.find(emp => emp.id === selectedEmployeeId);
      if (!employee) return;
      
      // 급여확정 데이터를 DB에 저장 (모든 금액값과 계산 근거 포함)
      const payrollRecord = {
        // 기본 정보
        employeeId: selectedEmployeeId,
        employeeName: employee.name,
        month: selectedMonth,
        branchId: selectedBranchId,
        
        // 계산된 금액값 (변경 불가)
        totalWorkHours: payrollData.totalWorkHours,
        hourlyWage: payrollData.hourlyWage,
        monthlySalary: payrollData.monthlySalary,
        actualPayment: payrollData.actualPayment,
        
        // 지점별 근무시간 상세 (보고서용)
        branchWorkHours: branchWorkHours,
        
        // 급여 계산 근거 (감사용)
        calculationBasis: {
          employmentType: employee.employmentType || '',
          salaryType: employee.salaryType || '',
          weeklyWorkHours: employee.weeklyWorkHours || 40, // 기본값 40시간
          taxRate: employee.employmentType === '외국인' ? 0.033 : 0, // 3.3% 세금
          calculationDate: new Date()
        },
        
        // 상태
        status: 'confirmed',
        confirmedAt: new Date(),
        
        // 보고서용 추가 정보
        confirmedBy: 'system', // 나중에 사용자 정보로 확장 가능
        version: '1.0' // 급여계산 로직 버전
      };
      
      // 기존 급여확정 데이터가 있는지 확인 (지점별로)
      const existingQuery = query(
        collection(db, 'payrollRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'payrollRecords'), payrollRecord);
        console.log('급여확정 데이터 저장됨:', payrollRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'payrollRecords', docId), payrollRecord);
        console.log('급여확정 데이터 업데이트됨:', payrollRecord);
      }
      
      alert('급여가 확정되었습니다.');
      
      // 급여확정된 직원 목록 다시 로드
      await loadPayrollConfirmedEmployees();
      
      // 상태 초기화
      setSelectedEmployeeId('');
      setPayrollData(null);
      setBranchWorkHours([]);
      
    } catch (error) {
      console.error('급여확정 중 오류:', error);
      alert('급여확정에 실패했습니다.');
    }
  };

  // 직원별 메모 로드
  const loadPayrollConfirmedEmployees = async () => {
    try {
      if (!selectedMonth || !selectedBranchId) return;
      
      const payrollQuery = query(
        collection(db, 'payrollRecords'),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      const confirmedEmployeeIds = payrollSnapshot.docs.map(doc => doc.data().employeeId);
      setPayrollConfirmedEmployees(confirmedEmployeeIds);
      
      console.log('급여확정된 직원들:', confirmedEmployeeIds);
    } catch (error) {
      console.error('급여확정 직원 로드 실패:', error);
    }
  };

  const loadEmployeeMemos = async () => {
    try {
      if (!selectedMonth) return;
      
      const memosQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth)
      );
      const memosSnapshot = await getDocs(memosQuery);
      
      const memosMap: {[employeeId: string]: string} = {};
      memosSnapshot.docs.forEach(doc => {
        const data = doc.data();
        memosMap[data.employeeId] = data.memo || '';
      });
      
      setEmployeeMemos(memosMap);
      console.log('직원별 메모 로드됨:', memosMap);
      
    } catch (error) {
      console.error('직원별 메모 로드 실패:', error);
    }
  };

  // 직원별 메모 저장
  const saveEmployeeMemo = async (employeeId: string, memo: string) => {
    try {
      const memoRecord = {
        employeeId,
        memo,
        month: selectedMonth,
        updatedAt: new Date()
      };

      // 기존 메모가 있는지 확인 (지점별 필터링 제거)
      const existingQuery = query(
        collection(db, 'employeeMemos'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'employeeMemos'), memoRecord);
        console.log('새로운 직원 메모 저장됨:', memoRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeMemos', docId), memoRecord);
        console.log('기존 직원 메모 업데이트됨:', memoRecord);
      }
      
      // 로컬 상태 업데이트
      setEmployeeMemos(prev => ({
        ...prev,
        [employeeId]: memo
      }));
      
    } catch (error) {
      console.error('직원 메모 저장 실패:', error);
    }
  };


  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">급여계산작업</h3>
        <p className="text-sm text-gray-600 mt-1">급여 계산을 위한 직원 현황을 확인합니다</p>
      </div>
      
      <div className="p-6">
        {/* 조회 조건 */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 지점 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              지점 선택
            </label>
            {isManager ? (
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700">
                {userBranch?.name || '지점 정보 없음'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => setSelectedBranchId(branch.id)}
                    className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                      selectedBranchId === branch.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              월 선택
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        {/* 직원 목록 */}
        {selectedBranchId && selectedMonth && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-900">
                {selectedBranch?.name} - {selectedMonth} 직원 현황
              </h4>
              <div className="text-sm text-gray-600">
                총 {employees.length}명
              </div>
            </div>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="text-gray-500">직원 정보를 불러오는 중...</div>
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">해당 조건에 맞는 직원이 없습니다.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        선택
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        직원명
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        고용형태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        시급/월급
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        주간근무시간
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <input
                            type="radio"
                            name="employee"
                            value={employee.id}
                            checked={selectedEmployeeId === employee.id}
                            onChange={() => {
                              setSelectedEmployeeId(employee.id);
                              calculatePayroll(employee.id);
                            }}
                            disabled={!employee.hasComparison}
                            className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 ${
                              !employee.hasComparison ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {employee.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {employee.employmentType || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {employee.salaryType === 'hourly' ? '시급' : employee.salaryType === 'monthly' ? '월급' : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {employee.weeklyWorkHours ? `${employee.weeklyWorkHours}시간` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {!employee.employmentType ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              ⚠️ 비교작업필요
                            </span>
                          ) : payrollConfirmedEmployees.includes(employee.id) ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✅ 급여확정
                            </span>
                          ) : employee.reviewStatus === '검토완료' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              💰 급여계산작업중
                            </span>
                          ) : employee.reviewStatus === '검토중' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              🔄 근무시간 작업중
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              ⏳ 비교작업필요
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 급여 계산 결과 */}
        {selectedEmployeeId && payrollData && (
          <div className="mt-6 bg-blue-50 p-6 rounded-lg">
            <h4 className="text-lg font-medium text-gray-900 mb-4">급여 계산 결과</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-md">
                <div className="text-sm font-medium text-gray-500">총 근무시간</div>
                <div className="text-2xl font-bold text-gray-900">
                  {payrollData.totalWorkHours.toFixed(1)}시간
                </div>
              </div>
              <div className="bg-white p-4 rounded-md">
                <div className="text-sm font-medium text-gray-500">시급</div>
                <div className="text-2xl font-bold text-gray-900">
                  {payrollData.hourlyWage.toLocaleString()}원
                </div>
              </div>
              <div className="bg-white p-4 rounded-md">
                <div className="text-sm font-medium text-gray-500">월급여</div>
                <div className="text-2xl font-bold text-gray-900">
                  {payrollData.monthlySalary.toLocaleString()}원
                </div>
              </div>
              <div className="bg-white p-4 rounded-md">
                <div className="text-sm font-medium text-gray-500">실지급금액</div>
                <div className="text-2xl font-bold text-blue-600">
                  {payrollData.actualPayment.toLocaleString()}원
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>※ 외국인 시급: 월급여 = 총 근무시간 × 시급, 실지급금액 = 월급여 × 0.967 (3.3% 세금 차감)</p>
            </div>
            
            {/* 지점별 근무시간 표시 */}
            {branchWorkHours.length > 0 && (
              <div className="mt-6">
                <h5 className="text-md font-medium text-gray-900 mb-3">지점별 근무시간</h5>
                <div className="space-y-2">
                  {branchWorkHours.map((branch, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-3 rounded-md border">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-900">{branch.branchName}</span>
                        <span className="text-sm text-gray-600">{branch.workHours.toFixed(1)}시간</span>
                      </div>
                      <div className="flex items-center">
                        {branch.reviewStatus === '검토완료' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ 완료
                          </span>
                        ) : branch.reviewStatus === '검토중' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            🔄 작업중
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ⏳ 미집계
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 급여확정/취소 버튼 */}
            <div className="mt-6 flex justify-end">
              {(() => {
                const hasIncompleteBranches = branchWorkHours.some(branch => branch.reviewStatus !== '검토완료');
                const isPayrollConfirmed = payrollConfirmedEmployees.includes(selectedEmployeeId);
                
                if (hasIncompleteBranches) {
                  return (
                    <div className="text-right">
                      <button
                        disabled
                        className="bg-gray-400 text-white px-6 py-2 rounded-md cursor-not-allowed font-medium"
                      >
                        급여확정 (미집계 지점 있음)
                      </button>
                      <p className="text-sm text-red-600 mt-2">
                        모든 지점의 근무시간 비교가 완료되어야 급여확정이 가능합니다.
                      </p>
                    </div>
                  );
                }
                
                if (isPayrollConfirmed) {
                  return (
                    <button
                      onClick={cancelPayroll}
                      className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-medium"
                    >
                      급여확정취소
                    </button>
                  );
                }
                
                return (
                  <button
                    onClick={confirmPayroll}
                    className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
                  >
                    급여확정
                  </button>
                );
              })()}
            </div>
            
            {/* 급여 메모 입력 */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                급여 메모 (자동저장)
              </label>
              <textarea
                value={employeeMemos[selectedEmployeeId] || ''}
                onChange={(e) => {
                  const memo = e.target.value;
                  setEmployeeMemos(prev => ({
                    ...prev,
                    [selectedEmployeeId]: memo
                  }));
                }}
                onBlur={(e) => {
                  // 포커스를 잃을 때 저장 (한글 입력 완료 후)
                  const memo = e.target.value;
                  saveEmployeeMemo(selectedEmployeeId, memo);
                }}
                placeholder="이번 달 급여에 대한 특이사항이나 메모를 입력하세요..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
          </div>
        )}
        
        {!selectedBranchId && (
          <div className="text-center py-8">
            <div className="text-gray-500">지점을 선택해주세요.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollCalculation;
