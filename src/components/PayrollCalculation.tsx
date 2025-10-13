import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { updateEmployeeMonthlyStats } from '@/utils/monthlyStatsCache';
import { cachedQuery, getCacheKey } from '@/utils/simpleCache';

// 주휴수당 계산 타입
type WeeklyHolidayInput = {
  hourlyWage: number;
  weeklyContractHours: number;
  weeklyWorkdays: number;
  workedAllScheduledDays: boolean;
  isFirstWeek: boolean;
  carryoverHoursPrevWeek?: number;
  requirePrevWeekAttendance?: boolean;
  prevWeekWorkedAll?: boolean;
};

// 주휴수당 계산 함수
function calcWeeklyHolidayPay(i: WeeklyHolidayInput) {
  if (i.hourlyWage <= 0 || i.weeklyContractHours <= 0 || i.weeklyWorkdays <= 0) {
    return { eligible: false, hours: 0, pay: 0 };
  }

  const carry = i.isFirstWeek ? (i.carryoverHoursPrevWeek ?? 0) : 0;
  const hoursForEligibility = i.weeklyContractHours + carry;

  const attendanceOK =
    i.workedAllScheduledDays &&
    (!i.requirePrevWeekAttendance || (i.prevWeekWorkedAll ?? true));

  const eligible = hoursForEligibility >= 15 && attendanceOK;
  if (!eligible) return { eligible, hours: 0, pay: 0 };

  const weeklyHolidayHours = i.weeklyContractHours / i.weeklyWorkdays;
  const pay = Math.round(weeklyHolidayHours * i.hourlyWage);

  return { eligible, hours: weeklyHolidayHours, pay };
}

interface Employee {
  id: string;
  name: string;
  branchIds: string[];
  employmentType: string;
  salaryType?: 'hourly' | 'monthly' | '시급' | '월급';
  hourlyWage?: number;
  monthlySalary?: number;
  probationStartDate?: Date | { toDate: () => Date };
  probationEndDate?: Date | { toDate: () => Date };
  probationStart?: Date | { toDate: () => Date };
  probationEnd?: Date | { toDate: () => Date };
  includesWeeklyHolidayInWage?: boolean;
  weeklyContractHours?: number;
  weeklyWorkdays?: number;
}

interface Branch {
  id: string;
  name: string;
}

interface WeeklySchedule {
  id: string;
  employeeId: string;
  branchId: string;
  branchName: string;
  month: string;
  weekStart: Date;
  weekEnd: Date;
  schedules: Record<string, unknown>[];
  actualWorkHours: number;
  breakTime: number;
  date?: string | Date;
  startDate?: string | Date;
  createdAt?: Date | { toDate: () => Date };
  workDate?: string | Date;
  scheduleDate?: string | Date;
  weekStartDate?: string | Date;
  weeklyContractHours?: number;
  weeklyWorkdays?: number;
  workedAllScheduledDays?: boolean;
  [key: string]: unknown;
}

interface PayrollCalculation {
  employeeId: string;
  employeeName: string;
  employmentType: string;
  salaryType?: string;
  hourlyWage?: number;
  monthlySalary?: number;
  totalWorkHours: number;
  totalBreakTime: number;
  actualWorkHours: number;
  grossPay: number;
  deductions: {
    insurance: number;
    tax: number;
    total: number;
  };
  netPay: number;
  branches: {
    branchId: string;
    branchName: string;
    workHours: number;
  }[];
  probationHours?: number;
  regularHours?: number;
  probationPay?: number;
  regularPay?: number;
  weeklyHolidayPay?: number;
  weeklyHolidayHours?: number;
  includesWeeklyHolidayInWage?: boolean;
  weeklyHolidayDetails?: Array<{
    weekStart: string;
    weekEnd: string;
    hours: number;
    pay: number;
    eligible: boolean;
    reason?: string;
  }>;
  // 무급휴가 관련 (근로소득자+월급제 전용)
  unpaidLeaveDays?: number; // 무급휴가 일수
  unpaidLeaveDeduction?: number; // 무급휴가 차감액
}

interface PayrollCalculationProps {
  userBranch?: string;
  isManager: boolean;
  selectedMonth?: string;
  selectedEmployeeId?: string;
  onPayrollStatusChange?: () => void;
}

const PayrollCalculation: React.FC<PayrollCalculationProps> = ({ userBranch, isManager, selectedMonth: propSelectedMonth, selectedEmployeeId: propSelectedEmployeeId, onPayrollStatusChange }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(propSelectedMonth || '');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(propSelectedEmployeeId || '');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [payrollCalculations, setPayrollCalculations] = useState<PayrollCalculation[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [memo, setMemo] = useState<string>('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [noScheduleData, setNoScheduleData] = useState(false);
  const [employeeMemos, setEmployeeMemos] = useState<{[employeeId: string]: string}>({});
  const [isPayrollConfirmed, setIsPayrollConfirmed] = useState(false);

  // 🔥 최적화: 지점 로드 (캐싱 적용)
  const loadBranches = useCallback(async () => {
    try {
      console.log('🔥 PayrollCalculation - loadBranches 시작');
      const branchesData = await cachedQuery(
        getCacheKey.branches(),
        async () => {
          const branchesSnapshot = await getDocs(collection(db, 'branches'));
          return branchesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Branch[];
        },
        15 * 60 * 1000 // 15분 캐시 (지점은 자주 변경되지 않음)
      );
      
      console.log('🔥 PayrollCalculation - 지점 데이터 로드됨:', branchesData.length, '개');
      
      if (isManager) {
        setBranches(branchesData);
        console.log('🔥 PayrollCalculation - 매니저: 모든 지점 설정됨');
      } else if (userBranch) {
        const userBranchData = branchesData.filter(branch => branch.id === userBranch);
        setBranches(userBranchData);
        console.log('🔥 PayrollCalculation - 일반사용자: 사용자 지점만 설정됨', userBranchData.length, '개');
      }
    } catch (error) {
      console.error('지점 로드 실패:', error);
    }
  }, [isManager, userBranch]);

  // 🔥 최적화: 직원 로드 (캐싱 적용)
  const loadEmployees = useCallback(async () => {
    try {
      console.log('PayrollCalculation - employees 컬렉션 조회 시작');
      
      const employeesData = await cachedQuery(
        getCacheKey.employees(),
        async () => {
          const employeesSnapshot = await getDocs(collection(db, 'employees'));
          console.log('PayrollCalculation - employees 컬렉션 조회 완료:', employeesSnapshot.docs.length, '건');
          return employeesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              // Timestamp를 Date로 변환
              probationStartDate: data.probationStartDate?.toDate ? data.probationStartDate.toDate() : data.probationStartDate,
              probationEndDate: data.probationEndDate?.toDate ? data.probationEndDate.toDate() : data.probationEndDate
            };
          }) as Employee[];
        },
        10 * 60 * 1000 // 10분 캐시
      );
      
      const 유은서테스트직원 = employeesData.find(emp => emp.name === '유은서테스트');
      console.log('PayrollCalculation - 직원 원본 데이터 확인:', 유은서테스트직원);
      console.log('PayrollCalculation - 유은서테스트 수습기간 정보:', {
        probationStartDate: 유은서테스트직원?.probationStartDate,
        probationEndDate: 유은서테스트직원?.probationEndDate,
        probationStart: 유은서테스트직원?.probationStart,
        probationEnd: 유은서테스트직원?.probationEnd
      });
      
      // 🔥 끄엉 직원 수습기간 정보 확인
      const 끄엉직원 = employeesData.find(emp => emp.name === '끄엉');
      console.log('🔥🔥🔥 끄엉 직원 데이터 확인:', 끄엉직원);
      console.log('🔥🔥🔥 끄엉 수습기간 정보:', {
        probationStartDate: 끄엉직원?.probationStartDate,
        probationEndDate: 끄엉직원?.probationEndDate,
        probationStartDateType: typeof 끄엉직원?.probationStartDate,
        probationEndDateType: typeof 끄엉직원?.probationEndDate
      });

      // 각 직원의 최신 계약서 정보 가져오기
      const employeesWithContracts = await Promise.all(
        employeesData.map(async (employee) => {
          try {
            const contractsQuery = query(
              collection(db, 'employmentContracts'),
              where('employeeId', '==', employee.id)
            );
            const contractsSnapshot = await getDocs(contractsQuery);
            
            if (!contractsSnapshot.empty) {
              // 🔥 백승우 계약서 개수 확인
              if (employee.name === '백승우') {
                console.log('🔥🔥🔥 백승우 계약서 개수:', contractsSnapshot.docs.length);
                contractsSnapshot.docs.forEach((doc, idx) => {
                  console.log(`🔥 백승우 계약서 ${idx + 1}:`, doc.data());
                });
              }
              
              // 최신 계약서 찾기 (createdAt 기준으로 정렬)
              const contracts = contractsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; createdAt?: Date | { toDate: () => Date } | string; [key: string]: unknown })
                .sort((a, b) => {
                  const dateA = a.createdAt ? new Date(a.createdAt.toString()).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt.toString()).getTime() : 0;
                  return dateB - dateA;
                });
              const contract = contracts[0] as { [key: string]: unknown; employmentType?: string; salaryType?: string; hourlyWage?: number; monthlySalary?: number; salaryAmount?: number; probationStartDate?: Date | { toDate: () => Date }; probationEndDate?: Date | { toDate: () => Date } };
              
            console.log(`직원 ${employee.name} 계약서 정보:`, {
              employeeId: employee.id,
              contractEmploymentType: contract.employmentType,
              contractSalaryType: contract.salaryType,
              contractSalaryAmount: contract.salaryAmount,
              contractHourlyWage: contract.hourlyWage,
              contractMonthlySalary: contract.monthlySalary,
              probationStartDate: contract.probationStartDate,
              probationEndDate: contract.probationEndDate,
              probationStartType: typeof contract.probationStartDate,
              probationEndType: typeof contract.probationEndDate
            });
            
            console.log(`직원 ${employee.name} 계약서 원본 데이터:`, contract);
            
            // 🔥 백승우 계약서 상세 디버깅
            if (employee.name === '백승우') {
              console.log('🔥🔥🔥 백승우 계약서 상세:', {
                salaryType: contract.salaryType,
                salaryAmount: contract.salaryAmount,
                hourlyWage: contract.hourlyWage,
                monthlySalary: contract.monthlySalary,
                allContractKeys: Object.keys(contract),
                contract: contract
              });
            }
              
              return {
                ...employee,
                employmentType: (contract.employmentType as string) || '로드실패',
                salaryType: (contract.salaryType === 'hourly' ? '시급' : 
                           contract.salaryType === 'monthly' ? '월급' : 
                           contract.salaryType as string || '로드실패') as '시급' | '월급' | 'hourly' | 'monthly',
                hourlyWage: contract.salaryType === 'hourly' ? (contract.salaryAmount as number) : (contract.salaryType === 'monthly' ? 0 : employee.hourlyWage),
                monthlySalary: contract.salaryType === 'monthly' ? (contract.salaryAmount as number) : (contract.salaryType === 'hourly' ? 0 : employee.monthlySalary),
                // 수습기간 정보는 employees 컬렉션에서 직접 가져오기
                probationStartDate: employee.probationStartDate || contract.probationStartDate,
                probationEndDate: employee.probationEndDate || contract.probationEndDate,
                // 주휴수당 포함 여부 (계약서에서 가져오기)
                includesWeeklyHolidayInWage: contract.includeHolidayAllowance as boolean || false
              };
            }
            
            console.log(`직원 ${employee.name} 계약서 없음 - 기존 정보 사용:`, {
              employeeId: employee.id,
              originalEmploymentType: employee.employmentType,
              originalSalaryType: employee.salaryType,
              originalHourlyWage: employee.hourlyWage,
              originalMonthlySalary: employee.monthlySalary,
              originalProbationStartDate: employee.probationStartDate,
              originalProbationEndDate: employee.probationEndDate
            });
            
            return {
              ...employee,
              // 계약서가 없으면 기존 employee 정보 그대로 사용 (기본값 설정하지 않음)
              employmentType: employee.employmentType || '정보없음',
              salaryType: employee.salaryType,
              hourlyWage: employee.hourlyWage,
              monthlySalary: employee.monthlySalary
            };
          } catch (error) {
            console.error(`직원 ${employee.name} 계약서 로드 실패:`, error);
            return {
              ...employee,
              // 에러 발생 시에도 기본값 설정하지 않음
              employmentType: employee.employmentType || '정보없음',
              salaryType: employee.salaryType,
              hourlyWage: employee.hourlyWage,
              monthlySalary: employee.monthlySalary
            };
          }
        })
      );

      setEmployees(employeesWithContracts);
    } catch (error) {
      console.error('직원 로드 실패:', error);
    }
  }, []);

  // 🔥 최적화: 직원 로드는 컴포넌트 마운트 시 한 번만

  // 주간 스케줄 로드
  const loadWeeklySchedules = useCallback(async () => {
    if (!selectedMonth || !selectedBranchId || !selectedEmployeeId) {
      return;
    }

    try {
      setLoading(true);
      console.log('PayrollCalculation - 주간 스케줄 로드 시작...');
      
      // 🔥 workTimeComparisonResults에서 데이터 조회
      const schedulesQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const schedulesSnapshot = await getDocs(schedulesQuery);
      console.log('PayrollCalculation - 근무시간비교 결과 쿼리 (모든 지점):', schedulesSnapshot.docs.length, '건');
      
      // 쿼리 조건 확인
      console.log('PayrollCalculation - 쿼리 조건:', {
        month: selectedMonth,
        employeeId: selectedEmployeeId,
        note: '지점 필터 제거 - 모든 지점 데이터 조회'
      });
      
      // 모든 주간 스케줄 데이터 확인
      const allSchedulesQuery = query(
        collection(db, 'weeklySchedules'),
        where('employeeId', '==', selectedEmployeeId)
      );
      const allSchedulesSnapshot = await getDocs(allSchedulesQuery);
      console.log('PayrollCalculation - 해당 직원의 모든 주간 스케줄:', allSchedulesSnapshot.docs.length, '건');
      
      if (allSchedulesSnapshot.docs.length > 0) {
        console.log('PayrollCalculation - 모든 주간 스케줄 데이터:', allSchedulesSnapshot.docs.map(doc => ({
          id: doc.id,
          branchId: doc.data().branchId,
          month: doc.data().month,
          employeeId: doc.data().employeeId
        })));
      }
      
      // 전체 주간 스케줄 데이터 확인 (해당 월)
      const monthSchedulesQuery = query(
        collection(db, 'weeklySchedules'),
        where('month', '==', selectedMonth)
      );
      const monthSchedulesSnapshot = await getDocs(monthSchedulesQuery);
      console.log('PayrollCalculation - 해당 월의 모든 주간 스케줄:', monthSchedulesSnapshot.docs.length, '건');
      
      if (monthSchedulesSnapshot.docs.length > 0) {
        console.log('PayrollCalculation - 해당 월의 주간 스케줄 데이터:', monthSchedulesSnapshot.docs.map(doc => ({
          id: doc.id,
          branchId: doc.data().branchId,
          month: doc.data().month,
          employeeId: doc.data().employeeId
        })));
      }
      
      // 전체 주간 스케줄 데이터 확인 (모든 데이터)
      const allSchedulesQuery2 = query(collection(db, 'weeklySchedules'));
      const allSchedulesSnapshot2 = await getDocs(allSchedulesQuery2);
      console.log('PayrollCalculation - 전체 주간 스케줄 데이터:', allSchedulesSnapshot2.docs.length, '건');
      
      if (allSchedulesSnapshot2.docs.length > 0) {
        console.log('PayrollCalculation - 전체 주간 스케줄 데이터 (처음 5개):', allSchedulesSnapshot2.docs.slice(0, 5).map(doc => ({
          id: doc.id,
          branchId: doc.data().branchId,
          month: doc.data().month,
          employeeId: doc.data().employeeId
        })));
      }
      
      const schedulesData = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          branchId: data.branchId,
          branchName: data.branchName,
          month: data.month,
          date: data.date,
          actualWorkHours: data.actualWorkHours || 0,
          breakTime: data.breakTime || 0,
          weekStart: data.weekStart ? data.weekStart.toDate() : new Date(),
          weekEnd: data.weekEnd ? data.weekEnd.toDate() : new Date(),
          schedules: []
        };
      }) as WeeklySchedule[];
      
      console.log('PayrollCalculation - 주간 스케줄 데이터:', schedulesData);
      setWeeklySchedules(schedulesData);
    } catch (error) {
      console.error('주간 스케줄 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedBranchId, selectedEmployeeId]);

  // 급여 계산
  const calculatePayroll = useCallback(async () => {
    
    if (!employees.length || !selectedEmployeeId) {
      return;
    }
    
    // 🔥 지점 데이터가 없으면 직접 로드
    let branchesData = branches;
    if (branchesData.length === 0) {
      console.log('🔥 PayrollCalculation - 지점 데이터 없음, 직접 로드 시작');
      try {
        const branchesSnapshot = await getDocs(collection(db, 'branches'));
        branchesData = branchesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Branch[];
        console.log('🔥 PayrollCalculation - 직접 로드된 지점 데이터:', branchesData.length, '개');
      } catch (error) {
        console.error('지점 데이터 직접 로드 실패:', error);
      }
    }
    
    if (!weeklySchedules.length) {
      setNoScheduleData(true);
      setPayrollCalculations([]);
      return;
    }
    
    setNoScheduleData(false);

    const calculations: PayrollCalculation[] = [];

    // 선택된 직원만 계산
    const employee = employees.find(emp => emp.id === selectedEmployeeId);
    if (!employee) {
      return;
    }
    
    
    console.log('PayrollCalculation - 선택된 직원 정보:', {
      id: employee.id,
      name: employee.name,
      salaryType: employee.salaryType,
      hourlyWage: employee.hourlyWage,
      monthlySalary: employee.monthlySalary,
      employmentType: employee.employmentType
    });
    
    // 근로계약서에서 급여 정보 가져오기
    // 이미 loadEmployees에서 계약서 정보를 가져왔으므로 추가 로드 불필요
    console.log('PayrollCalculation - 직원 정보 (계약서 정보 포함):', {
      name: employee.name,
      employmentType: employee.employmentType,
      salaryType: employee.salaryType,
      hourlyWage: employee.hourlyWage,
      monthlySalary: employee.monthlySalary
    });

    // 해당 직원의 주간 스케줄 필터링
    const employeeSchedules = weeklySchedules.filter(schedule => 
      schedule.employeeId === employee.id
    );

    if (employeeSchedules.length === 0) return;

    // 지점별 근무시간 계산
    const branchWorkHours = employeeSchedules.reduce((acc, schedule) => {
      const branchId = schedule.branchId;
      if (!acc[branchId]) {
        // 지점 이름을 branchesData 배열에서 찾아서 설정
        const branch = branchesData.find(b => b.id === branchId);
        
        // 🔥 디버깅: 지점명 찾기 로그
        console.log(`🔥 PayrollCalculation - 지점명 찾기:`, {
          branchId: branchId,
          branchesLength: branchesData.length,
          branchesIds: branchesData.map(b => b.id),
          foundBranch: branch,
          scheduleBranchName: schedule.branchName,
          finalBranchName: branch?.name || schedule.branchName || '지점명 없음'
        });
        
        acc[branchId] = {
          branchId,
          branchName: branch?.name || schedule.branchName || '지점명 없음',
          workHours: 0
        };
      }
      acc[branchId].workHours += schedule.actualWorkHours;
      return acc;
    }, {} as Record<string, { branchId: string; branchName: string; workHours: number }>);

    // 총 근무시간 계산 (이미 비교결과에서 실근무시간이 계산됨)
    const totalWorkHours = employeeSchedules.reduce((sum, schedule) => 
      sum + schedule.actualWorkHours, 0
    );
    
    const totalBreakTime = employeeSchedules.reduce((sum, schedule) => 
      sum + schedule.breakTime, 0
    );

    // actualWorkHours는 이미 비교결과에서 계산된 실근무시간이므로 휴게시간을 빼지 않음
    const actualWorkHours = totalWorkHours;
    
    // 수습기간 관련 변수 초기화
    let probationHours = 0;
    let regularHours = 0;
    
    console.log('PayrollCalculation - 근무시간 계산:', {
      totalWorkHours: totalWorkHours,
      totalBreakTime: totalBreakTime,
      actualWorkHours: actualWorkHours
    });
    
    console.log('🔥 급여 계산 조건 확인:', {
      employeeName: employee.name,
      salaryType: employee.salaryType,
      hourlyWage: employee.hourlyWage,
      monthlySalary: employee.monthlySalary,
      employmentType: employee.employmentType,
      actualWorkHours: actualWorkHours,
      condition: (employee.salaryType === '시급' || employee.salaryType === 'hourly') && employee.hourlyWage
    });
    
    // 🔥 백승우 디버깅
    if (employee.name === '백승우') {
      console.log('🔥🔥🔥 백승우 상세 정보:', {
        name: employee.name,
        employmentType: employee.employmentType,
        salaryType: employee.salaryType,
        hourlyWage: employee.hourlyWage,
        monthlySalary: employee.monthlySalary,
        actualWorkHours: actualWorkHours,
        totalWorkHours: totalWorkHours,
        probationHours: probationHours,
        regularHours: regularHours
      });
    }
    

    // 급여 계산 (수습기간별로 나누어서 계산)
    let grossPay = 0;
    let weeklyHolidayPay = 0;
    let weeklyHolidayHours = 0;
    const weeklyHolidayDetails: Array<{
      weekStart: string;
      weekEnd: string;
      hours: number;
      pay: number;
      eligible: boolean;
      reason?: string;
    }> = [];
    // 무급휴가 관련 변수 (전체 스코프에서 사용)
    let unpaidLeaveDays = 0;
    let unpaidLeaveDeduction = 0;
    
    // 수습기간 확인 (계약서에서 가져오기)
    let probationStartDate = employee.probationStartDate;
    let probationEndDate = employee.probationEndDate;
    
    // 계약서에서 수습기간 정보 가져오기 (이미 employee 객체에 포함됨)
    if (employee.probationStartDate && employee.probationEndDate) {
      probationStartDate = employee.probationStartDate;
      probationEndDate = employee.probationEndDate;
    } else {
      // 수습기간 정보가 없는 경우
      console.log('PayrollCalculation - 수습기간 정보 없음:', {
        employeeName: employee.name,
        probationStartDate: employee.probationStartDate,
        probationEndDate: employee.probationEndDate
      });
    }
    
    // 수습기간 여부는 실제 근무한 날짜를 기준으로 판단
    const isInProbation = probationStartDate && probationEndDate;
    const currentDate = new Date();
    
    console.log('PayrollCalculation - 수습기간 확인:', {
      employeeName: employee.name,
      probationStartDate: probationStartDate,
      probationEndDate: probationEndDate,
      currentDate: currentDate,
      isInProbation: isInProbation,
      employeeProbationStart: employee.probationStartDate,
      employeeProbationEnd: employee.probationEndDate,
      probationStartType: typeof employee.probationStartDate,
      probationEndType: typeof employee.probationEndDate
    });
    
    if ((employee.salaryType === '시급' || employee.salaryType === 'hourly') && employee.hourlyWage) {
      // 수습기간 중 실근무시간 (a)과 수습기간 아닐 때 실근무시간 (b) 계산
      // probationHours와 regularHours는 이미 위에서 초기화됨
      
      // Timestamp 객체를 Date 객체로 변환
      const probationStart = probationStartDate && typeof probationStartDate === 'object' && 'toDate' in probationStartDate 
        ? probationStartDate.toDate() 
        : probationStartDate as Date | undefined;
      const probationEnd = probationEndDate && typeof probationEndDate === 'object' && 'toDate' in probationEndDate 
        ? probationEndDate.toDate() 
        : probationEndDate as Date | undefined;
      
      console.log('🔥 수습기간 원본 데이터 확인:', {
        probationStartDate: probationStartDate,
        probationEndDate: probationEndDate,
        probationStart: probationStart,
        probationEnd: probationEnd,
        probationStartType: typeof probationStart,
        probationEndType: typeof probationEnd
      });
      
      // 수습기간 날짜 범위 확인
      if (probationStart && probationEnd) {
        console.log('🔥 수습기간 날짜 범위:', {
          start: probationStart.toISOString().split('T')[0],
          end: probationEnd.toISOString().split('T')[0],
          startTime: probationStart.getTime(),
          endTime: probationEnd.getTime()
        });
      } else {
        console.log('🔥 수습기간 날짜가 없습니다!');
      }
      
      console.log('PayrollCalculation - 수습기간 날짜:', {
        probationStart: probationStart,
        probationEnd: probationEnd,
        probationStartType: typeof probationStart,
        probationEndType: typeof probationEnd
      });
      
      console.log('PayrollCalculation - employeeSchedules 확인:', {
        employeeSchedules: employeeSchedules,
        employeeSchedulesLength: employeeSchedules?.length,
        employeeSchedulesType: typeof employeeSchedules
      });
      
      // 수습기간별 근무시간 계산 (주간 스케줄 기준)
      // 기존 변수 재사용
      
      console.log('PayrollCalculation - 수습기간별 계산 시작:', {
        probationStart: probationStart,
        probationEnd: probationEnd,
        employeeSchedulesLength: employeeSchedules?.length
      });
      
      if (employeeSchedules && Array.isArray(employeeSchedules)) {
        console.log(`🔥🔥🔥 ${employee.name} 수습기간 계산 시작:`, {
          probationStart: probationStart?.toISOString().split('T')[0],
          probationEnd: probationEnd?.toISOString().split('T')[0],
          schedulesCount: employeeSchedules.length
        });
        
        employeeSchedules.forEach((schedule, index) => {
          // schedule.date를 Date 객체로 변환 (문자열이면 변환, Date 객체면 그대로)
          let scheduleDate: Date | null = null;
          
          if (schedule.date) {
            if (typeof schedule.date === 'string') {
              scheduleDate = new Date(schedule.date);
            } else if (schedule.date instanceof Date) {
              scheduleDate = schedule.date;
            }
          }
          
          // date 필드가 없으면 weekStart 사용 (폴백)
          if (!scheduleDate && schedule.weekStart) {
            scheduleDate = schedule.weekStart;
            console.warn(`⚠️ 스케줄 [${index}]에 date 필드가 없어서 weekStart를 사용합니다.`);
          }
          
          const actualWorkHours = schedule.actualWorkHours || 0;
          
          // 수습기간 여부 판단
          let isInProbation = false;
          if (probationStart && probationEnd && scheduleDate) {
            // 날짜만 비교 (시간 제거)
            const scheduleDateOnly = new Date(scheduleDate.toISOString().split('T')[0]);
            const probationStartOnly = new Date(probationStart.toISOString().split('T')[0]);
            const probationEndOnly = new Date(probationEnd.toISOString().split('T')[0]);
            
            isInProbation = scheduleDateOnly >= probationStartOnly && scheduleDateOnly <= probationEndOnly;
            
            console.log(`🔥 스케줄 [${index}] 수습기간 판단:`, {
              date: schedule.date,
              scheduleDateOnly: scheduleDateOnly.toISOString().split('T')[0],
              probationStartOnly: probationStartOnly.toISOString().split('T')[0],
              probationEndOnly: probationEndOnly.toISOString().split('T')[0],
              isInProbation: isInProbation,
              actualWorkHours: actualWorkHours
            });
          }
          
          if (isInProbation) {
            probationHours += actualWorkHours;
            console.log(`  ✅ 수습기간 시간 추가: +${actualWorkHours}시간 (누적: ${probationHours}시간)`);
          } else {
            regularHours += actualWorkHours;
            console.log(`  ✅ 정규 시간 추가: +${actualWorkHours}시간 (누적: ${regularHours}시간)`);
          }
        });
        
        console.log(`🔥🔥🔥 ${employee.name} 수습기간 계산 완료:`, {
          probationHours: probationHours,
          regularHours: regularHours,
          totalHours: probationHours + regularHours
        });
      }
      
      console.log('PayrollCalculation - 수습기간별 근무시간 계산:', {
        probationStart: probationStart,
        probationEnd: probationEnd,
        probationHours: probationHours,
        regularHours: regularHours,
        totalHours: probationHours + regularHours
      });
      
      console.log('PayrollCalculation - 수습기간별 근무시간 계산:', {
        probationStart: probationStart,
        probationEnd: probationEnd,
        probationHours: probationHours,
        regularHours: regularHours,
        totalHours: probationHours + regularHours
      });
      
      console.log('PayrollCalculation - 수습기간별 근무시간:', {
        employeeName: employee.name,
        probationHours: probationHours,
        regularHours: regularHours,
        totalHours: probationHours + regularHours,
        probationStartDate: probationStartDate,
        probationEndDate: probationEndDate,
        schedulesCount: employeeSchedules.length,
        scheduleDates: employeeSchedules.map(s => s.weekStart)
      });
      
      // 급여 = a × 시급 × 0.9 + b × 시급
      const probationPay = Math.round(probationHours * employee.hourlyWage * 0.9);
      const regularPay = Math.round(regularHours * employee.hourlyWage);
      const basePay = probationPay + regularPay;
      
      // 주휴수당 계산 (근로소득, 사업소득, 외국인 & 시급 & 주휴수당 미포함)
      
      const shouldCalculateWeeklyHoliday = 
        (employee.employmentType === '근로소득' || employee.employmentType === '사업소득' || employee.employmentType === '외국인') &&
        !employee.includesWeeklyHolidayInWage;
      
      console.log('🔥 주휴수당 계산 조건:', {
        employeeName: employee.name,
        employmentType: employee.employmentType,
        includesWeeklyHolidayInWage: employee.includesWeeklyHolidayInWage,
        shouldCalculateWeeklyHoliday: shouldCalculateWeeklyHoliday,
        employeeSchedulesLength: employeeSchedules.length
      });
      
      if (shouldCalculateWeeklyHoliday) {
        // 주별로 주휴수당 계산 (employeeSchedules를 주별로 그룹핑)
        // 🔥 schedule.date를 기준으로 해당 주의 월요일을 계산
        const weeklyScheduleGroups = employeeSchedules.reduce((groups, schedule) => {
          // schedule.date를 기준으로 주 시작일(월요일) 계산
          const scheduleDate = schedule.date ? new Date(schedule.date) : schedule.weekStart;
          const dayOfWeek = scheduleDate.getDay(); // 0=일, 1=월, ..., 6=토
          const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 월요일 기준으로 계산
          
          const monday = new Date(scheduleDate);
          monday.setDate(monday.getDate() - daysFromMonday);
          const weekKey = monday.toISOString().split('T')[0]; // 주 시작일(월요일)을 키로 사용
          
          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(schedule);
          return groups;
        }, {} as Record<string, typeof employeeSchedules>);
        
        // 각 주별로 주휴수당 계산
        console.log('🔥 주휴수당 계산 시작 - 주별 그룹:', Object.keys(weeklyScheduleGroups));
        
        Object.entries(weeklyScheduleGroups).forEach(([weekKey, weekSchedules]) => {
          const weekStartDate = new Date(weekKey);
          const weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekEndDate.getDate() + 6); // 주 시작일 + 6일 = 일요일
          
          // 🔥 완전한 주인지 확인 (일요일로 끝나는지)
          const isCompleteWeek = weekEndDate.getDay() === 0; // 0 = 일요일
          
          // 🔥 해당 월 내에 속하는지 확인
          const monthDate = typeof selectedMonth === 'string' ? new Date(selectedMonth) : selectedMonth;
          const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
          
          // 🔥 주 끝(일요일)이 이번 달에 속하지 않으면 다음 달에 지급
          const weekEndsInCurrentMonth = weekEndDate <= monthEnd;
          
          console.log(`🔥 주차 ${weekKey} 체크:`, {
            weekStartDate: weekStartDate.toLocaleDateString(),
            weekEndDate: weekEndDate.toLocaleDateString(),
            weekEndDay: weekEndDate.getDay(),
            isCompleteWeek: isCompleteWeek,
            weekEndsInCurrentMonth: weekEndsInCurrentMonth,
            monthEnd: monthEnd.toLocaleDateString()
          });
          
          // 🔥 완전한 주이고, 일요일이 이번 달에 속할 때만 주휴수당 지급
          if (!isCompleteWeek || !weekEndsInCurrentMonth) {
            console.log(`🔥 주차 ${weekKey} 주휴수당 제외 (불완전한 주 또는 다음 달)`);
            weeklyHolidayDetails.push({
              weekStart: weekStartDate.toLocaleDateString('ko-KR'),
              weekEnd: weekEndDate.toLocaleDateString('ko-KR'),
              hours: 0,
              pay: 0,
              eligible: false,
              reason: !isCompleteWeek ? '불완전한 주 (일요일로 끝나지 않음)' : '다음 달로 이월'
            });
            return; // 이 주는 주휴수당 계산하지 않음
          }
          
          console.log(`🔥 주차 ${weekKey} 주휴수당 계산 진행`);
          
          const weeklyWorkdays = employee.weeklyWorkdays || 5; // 기본 주 5일
          const weeklyActualHours = weekSchedules.reduce((sum, s) => sum + s.actualWorkHours, 0);
          
          // 🔥 소정근로일 모두 이행 여부 확인 - 실제 스케줄이 있는 날짜 기준으로 판단
          // weekSchedules에 스케줄이 있다는 것은 그 날 근무했다는 의미
          const actualWorkdays = weekSchedules.length;
          const workedAllScheduledDays = actualWorkdays > 0; // 스케줄이 하나라도 있으면 출근으로 인정
          
          // 첫 주 판단 (해당 월의 첫 주인지)
          const isFirstWeek = weekStartDate.getDate() <= 7;
          
          console.log(`🔥 주차 ${weekKey} 주휴수당 계산 입력:`, {
            hourlyWage: employee.hourlyWage,
            weeklyContractHours: weeklyActualHours,
            weeklyWorkdays: weeklyWorkdays,
            workedAllScheduledDays: workedAllScheduledDays,
            schedulesCount: weekSchedules.length,
            isFirstWeek: isFirstWeek
          });
          
          const weeklyHolidayResult = calcWeeklyHolidayPay({
            hourlyWage: employee.hourlyWage || 0,
            weeklyContractHours: weeklyActualHours, // 실제 근무시간 기준
            weeklyWorkdays: weeklyWorkdays,
            workedAllScheduledDays: workedAllScheduledDays,
            isFirstWeek: isFirstWeek,
            carryoverHoursPrevWeek: 0, // 전달 주 합산은 추후 구현
            requirePrevWeekAttendance: false
          });
          
          console.log(`🔥 주차 ${weekKey} 주휴수당 계산 결과:`, weeklyHolidayResult);
          
          if (weeklyHolidayResult.eligible) {
            // 🔥 수습기간 중인 주인지 확인
            const probationStart = probationStartDate && typeof probationStartDate === 'object' && 'toDate' in probationStartDate 
              ? probationStartDate.toDate() 
              : probationStartDate as Date | undefined;
            const probationEnd = probationEndDate && typeof probationEndDate === 'object' && 'toDate' in probationEndDate 
              ? probationEndDate.toDate() 
              : probationEndDate as Date | undefined;
            
            // 주의 일요일이 수습기간에 속하는지 확인
            const isWeekInProbation = probationStart && probationEnd && 
              weekEndDate >= probationStart && weekEndDate <= probationEnd;
            
            // 🔥 수습기간이면 주휴수당도 90% 지급
            const adjustedPay = isWeekInProbation 
              ? Math.round(weeklyHolidayResult.pay * 0.9)
              : weeklyHolidayResult.pay;
            
            weeklyHolidayDetails.push({
              weekStart: weekStartDate.toLocaleDateString('ko-KR'),
              weekEnd: weekEndDate.toLocaleDateString('ko-KR'),
              hours: weeklyHolidayResult.hours,
              pay: adjustedPay,
              eligible: true,
              reason: isWeekInProbation ? '지급 (수습기간 90%)' : '지급'
            });
            
            weeklyHolidayPay += adjustedPay;
            weeklyHolidayHours += weeklyHolidayResult.hours;
          } else {
            weeklyHolidayDetails.push({
              weekStart: weekStartDate.toLocaleDateString('ko-KR'),
              weekEnd: weekEndDate.toLocaleDateString('ko-KR'),
              hours: 0,
              pay: 0,
              eligible: false,
              reason: '주 15시간 미만 또는 출근 미충족'
            });
          }
        });
      }
      
      grossPay = basePay + weeklyHolidayPay;
      
      console.log('PayrollCalculation - 수습기간별 급여 계산:', {
        probationPay: probationPay,
        regularPay: regularPay,
        basePay: basePay,
        weeklyHolidayPay: weeklyHolidayPay,
        weeklyHolidayHours: weeklyHolidayHours,
        totalPay: grossPay
      });
      
    } else if ((employee.salaryType === '월급' || employee.salaryType === 'monthly') && employee.monthlySalary) {
      // 월급인 경우 계산
      console.log('PayrollCalculation - 월급 계산 시작:', {
        employeeName: employee.name,
        monthlySalary: employee.monthlySalary,
        probationStartDate: probationStartDate,
        probationEndDate: probationEndDate
      });
      
      // Timestamp 객체를 Date 객체로 변환
      const probationStart = probationStartDate && typeof probationStartDate === 'object' && 'toDate' in probationStartDate 
        ? probationStartDate.toDate() 
        : probationStartDate as Date | undefined;
      const probationEnd = probationEndDate && typeof probationEndDate === 'object' && 'toDate' in probationEndDate 
        ? probationEndDate.toDate() 
        : probationEndDate as Date | undefined;
      
      // 현재 월이 수습기간에 해당하는지 확인
      let isMonthInProbation = false;
      if (probationStart && probationEnd && selectedMonth) {
        const monthDate = new Date(selectedMonth);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        
        // 월의 시작일 또는 종료일이 수습기간에 포함되면 수습기간으로 판단
        isMonthInProbation = (monthStart >= probationStart && monthStart <= probationEnd) ||
                             (monthEnd >= probationStart && monthEnd <= probationEnd) ||
                             (monthStart <= probationStart && monthEnd >= probationEnd);
        
        console.log('PayrollCalculation - 월급 수습기간 판단:', {
          selectedMonth: selectedMonth,
          monthStart: monthStart.toISOString().split('T')[0],
          monthEnd: monthEnd.toISOString().split('T')[0],
          probationStart: probationStart.toISOString().split('T')[0],
          probationEnd: probationEnd.toISOString().split('T')[0],
          isMonthInProbation: isMonthInProbation
        });
        
      }
      
      // 기본 월급 계산
      let baseSalary = employee.monthlySalary;
      
      if (isMonthInProbation) {
        // 수습기간 중에는 월급의 90% 적용
        baseSalary = Math.round(employee.monthlySalary * 0.9);
        console.log('PayrollCalculation - 수습기간 월급 적용:', employee.monthlySalary, '원 × 0.9 =', baseSalary, '원');
      } else {
        console.log('PayrollCalculation - 정규 월급 적용:', employee.monthlySalary, '원');
      }
      
      // 무급휴가 차감 (근로소득자+월급제만)
      
      if (employee.employmentType === '근로소득') {
        // 무급휴가 일수는 급여메모나 별도 입력에서 가져올 수 있음 (현재는 0으로 초기화)
        // TODO: 실제 무급휴가 일수 입력 UI 추가 필요
        unpaidLeaveDays = 0; // 임시로 0으로 설정
        
        if (unpaidLeaveDays > 0) {
          // 일할 계산 (월 기준일수를 30일로 가정)
          const dailyRate = baseSalary / 30;
          unpaidLeaveDeduction = Math.round(dailyRate * unpaidLeaveDays);
          grossPay = baseSalary - unpaidLeaveDeduction;
          
          console.log('PayrollCalculation - 무급휴가 차감:', {
            baseSalary: baseSalary,
            unpaidLeaveDays: unpaidLeaveDays,
            dailyRate: dailyRate,
            unpaidLeaveDeduction: unpaidLeaveDeduction,
            finalGrossPay: grossPay
          });
        } else {
          grossPay = baseSalary;
        }
      } else {
        grossPay = baseSalary;
      }
    }

    // 공제 계산
    let insurance = 0;
    let tax = 0;
    let netPay = 0;

    if (employee.employmentType === '근로소득') {
      // 4대보험 계산 (2025년 기준)
      const nationalPension = Math.round(grossPay * 0.045);      // 국민연금 4.5%
      const healthInsurance = Math.round(grossPay * 0.03545);    // 건강보험 3.545%
      const longTermCare = Math.round(healthInsurance * 0.1295); // 장기요양보험 (건강보험의 12.95%)
      const employmentInsurance = Math.round(grossPay * 0.009);  // 고용보험 0.9%
      
      insurance = nationalPension + healthInsurance + longTermCare + employmentInsurance;
      
      // 소득세 간이세액표 적용 (부양가족 1명 기준, 간단한 구간별 계산)
      let incomeTax = 0;
      if (grossPay <= 1060000) {
        incomeTax = 0;
      } else if (grossPay <= 2100000) {
        incomeTax = Math.round((grossPay - 1060000) * 0.02);
      } else if (grossPay <= 3160000) {
        incomeTax = Math.round(20800 + (grossPay - 2100000) * 0.04);
      } else if (grossPay <= 5000000) {
        incomeTax = Math.round(63200 + (grossPay - 3160000) * 0.06);
      } else {
        incomeTax = Math.round(173600 + (grossPay - 5000000) * 0.08);
      }
      
      const localIncomeTax = Math.round(incomeTax * 0.1); // 지방소득세 (소득세의 10%)
      tax = incomeTax + localIncomeTax;
      
      netPay = grossPay - (insurance + tax);
      
      console.log('PayrollCalculation - 근로소득 공제 상세:', {
        grossPay: grossPay,
        nationalPension: nationalPension,
        healthInsurance: healthInsurance,
        longTermCare: longTermCare,
        employmentInsurance: employmentInsurance,
        totalInsurance: insurance,
        incomeTax: incomeTax,
        localIncomeTax: localIncomeTax,
        totalTax: tax,
        netPay: netPay
      });
    } else if (employee.employmentType === '사업소득') {
      tax = Math.round(grossPay * 0.033); // 3.3% (소득세만)
      netPay = grossPay - tax; // 세금 차감
      console.log('PayrollCalculation - 사업소득 공제:', {
        grossPay: grossPay,
        tax: tax,
        netPay: netPay,
        rate: '96.7%'
      });
    } else if (employee.employmentType === '일용직') {
      // 일용직은 공제 없음
      netPay = grossPay;
      console.log('PayrollCalculation - 일용직 (공제없음):', {
        grossPay: grossPay,
        netPay: netPay
      });
    } else if (employee.employmentType === '외국인') {
      tax = Math.round(grossPay * 0.033); // 3.3% (소득세만)
      netPay = grossPay - tax; // 세금 차감
      console.log('PayrollCalculation - 외국인 공제:', {
        grossPay: grossPay,
        tax: tax,
        netPay: netPay,
        rate: '96.7%'
      });
    }

    const totalDeductions = insurance + tax;

    calculations.push({
      employeeId: employee.id,
      employeeName: employee.name,
      employmentType: employee.employmentType,
      salaryType: employee.salaryType,
      hourlyWage: employee.hourlyWage,
      monthlySalary: employee.monthlySalary,
      totalWorkHours,
      totalBreakTime,
      actualWorkHours,
      grossPay,
      deductions: {
        insurance,
        tax,
        total: totalDeductions
      },
      netPay,
      branches: Object.values(branchWorkHours),
      // 수습기간 관련 값들 추가
      probationHours: probationHours || 0,
      regularHours: regularHours || 0,
      probationPay: probationHours ? probationHours * (employee.hourlyWage || 0) * 0.9 : 0,
      regularPay: regularHours ? regularHours * (employee.hourlyWage || 0) : 0,
      // 주휴수당 추가
      weeklyHolidayPay: weeklyHolidayPay || 0,
      weeklyHolidayHours: weeklyHolidayHours || 0,
      includesWeeklyHolidayInWage: employee.includesWeeklyHolidayInWage || false,
      weeklyHolidayDetails: weeklyHolidayDetails,
      // 무급휴가 관련 (근로소득자+월급제 전용)
      unpaidLeaveDays: unpaidLeaveDays || 0,
      unpaidLeaveDeduction: unpaidLeaveDeduction || 0
    });

    setPayrollCalculations(calculations);
  }, [selectedEmployeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 메모 로드 (WorkTimeComparison과 동일한 방식)
  const loadMemo = useCallback(async () => {
    if (!selectedMonth) return;
    
    try {
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
      
    } catch (error) {
      console.error('메모 로드 실패:', error);
    }
  }, [selectedMonth]);

  // 메모 저장 (WorkTimeComparison과 동일한 방식)
  const saveMemo = async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    setSavingMemo(true);
    
    try {
      const memoRecord = {
        employeeId: selectedEmployeeId,
        month: selectedMonth,
        memo: memo
      };
      
      // 기존 메모가 있는지 확인
      const existingQuery = query(
        collection(db, 'employeeMemos'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'employeeMemos'), memoRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeMemos', docId), memoRecord);
      }
      
      // 로컬 상태도 업데이트
      setEmployeeMemos(prev => ({
        ...prev,
        [selectedEmployeeId]: memo
      }));
      
    } catch (error) {
      console.error('메모 저장 실패:', error);
      alert('메모 저장에 실패했습니다.');
    } finally {
      setSavingMemo(false);
    }
  };

  // 급여확정 함수
  const confirmPayroll = async (calculation: PayrollCalculation) => {
    if (!selectedMonth || !selectedBranchId || !selectedEmployeeId) {
      alert('월, 지점, 직원을 모두 선택해주세요.');
      return;
    }

    setConfirming(true);
    try {
      // 급여확정 데이터 구조
      const confirmedPayrollData = {
        // 기본 정보
        employeeId: calculation.employeeId,
        employeeName: calculation.employeeName,
        branchId: selectedBranchId,
        branchName: branches.find(b => b.id === selectedBranchId)?.name || '',
        month: selectedMonth,
        confirmedAt: new Date(),
        
        // 급여 정보 (확정 시점의 데이터 보존)
        employmentType: calculation.employmentType,
        salaryType: calculation.salaryType,
        hourlyWage: calculation.hourlyWage,
        monthlySalary: calculation.monthlySalary,
        
        // 근무시간 정보
        totalWorkHours: calculation.totalWorkHours,
        totalBreakTime: calculation.totalBreakTime,
        actualWorkHours: calculation.actualWorkHours,
        
        // 수습기간 정보
        probationHours: calculation.probationHours || 0,
        regularHours: calculation.regularHours || 0,
        probationPay: calculation.probationPay || 0,
        regularPay: calculation.regularPay || 0,
        
        // 급여 계산
        grossPay: calculation.grossPay,
        deductions: calculation.deductions,
        netPay: calculation.netPay,
        
        // 지점별 정보
        branches: calculation.branches,
        
        // 상태
        status: 'confirmed'
      };

      // Firestore에 저장
      await addDoc(collection(db, 'confirmedPayrolls'), confirmedPayrollData);
      
      // 급여처리상태를 "급여확정완료"로 업데이트
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', selectedEmployeeId),
        where('branchId', '==', selectedBranchId),
        where('month', '==', selectedMonth)
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      if (!reviewStatusSnapshot.empty) {
        const docId = reviewStatusSnapshot.docs[0].id;
        await updateDoc(doc(db, 'employeeReviewStatus', docId), {
          status: '급여확정완료',
          updatedAt: new Date()
        });
      } else {
        // 상태가 없으면 새로 생성
        // 🔥 최적화: 자주 조회하는 데이터를 역정규화하여 포함
        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
        const selectedBranch = branches.find(br => br.id === selectedBranchId);
        
        await addDoc(collection(db, 'employeeReviewStatus'), {
          employeeId: selectedEmployeeId,
          employeeName: selectedEmployee?.name || '알 수 없음', // 🔥 역정규화
          branchId: selectedBranchId,
          branchName: selectedBranch?.name || '알 수 없음', // 🔥 역정규화
          month: selectedMonth,
          status: '급여확정완료',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // 🔥 최적화: 급여확정 시 집계 데이터 캐싱
      if (payrollCalculations.length > 0) {
        const calc = payrollCalculations[0]; // 현재 선택된 직원의 계산 결과
        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
        const selectedBranch = branches.find(br => br.id === selectedBranchId);
        
        if (selectedEmployee && selectedBranch) {
          await updateEmployeeMonthlyStats(
            selectedEmployeeId,
            selectedEmployee.name,
            selectedBranchId,
            selectedBranch.name,
            selectedMonth,
            {
              totalWorkHours: calc.totalWorkHours,
              totalBreakTime: calc.totalBreakTime,
              actualWorkHours: calc.actualWorkHours,
              overtimeHours: 0, // TODO: 계산 로직 추가
              weeklyHolidayHours: calc.weeklyHolidayHours || 0,
              weeklyHolidayPay: calc.weeklyHolidayPay || 0,
              grossPay: calc.grossPay,
              netPay: calc.netPay,
              isConfirmed: true
            }
          );
        }
      }
      
      alert('급여가 확정되었습니다.');
      
      // 상태 업데이트
      setIsPayrollConfirmed(true);
      
      // 부모 컴포넌트에 상태 변경 알림
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
      }
      
    } catch (error) {
      console.error('급여확정 실패:', error);
      alert('급여확정에 실패했습니다.');
    } finally {
      setConfirming(false);
    }
  };

  // 급여확정 상태 확인
  const checkPayrollConfirmed = useCallback(async () => {
    if (!selectedMonth || !selectedBranchId || !selectedEmployeeId) {
      setIsPayrollConfirmed(false);
      return;
    }

    try {
      const confirmedPayrollsQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('branchId', '==', selectedBranchId),
        where('month', '==', selectedMonth)
      );
      const confirmedPayrollsSnapshot = await getDocs(confirmedPayrollsQuery);
      
      setIsPayrollConfirmed(!confirmedPayrollsSnapshot.empty);
    } catch (error) {
      console.error('급여확정 상태 확인 실패:', error);
      setIsPayrollConfirmed(false);
    }
  }, [selectedMonth, selectedBranchId, selectedEmployeeId]);

  // 급여확정 취소 함수
  const cancelConfirmPayroll = async () => {
    if (!selectedMonth || !selectedBranchId || !selectedEmployeeId) {
      alert('월, 지점, 직원을 모두 선택해주세요.');
      return;
    }

    if (!confirm('급여확정을 취소하시겠습니까?')) {
      return;
    }

    setConfirming(true);
    
    try {
      // confirmedPayrolls에서 삭제
      const confirmedPayrollsQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('branchId', '==', selectedBranchId),
        where('month', '==', selectedMonth)
      );
      const confirmedPayrollsSnapshot = await getDocs(confirmedPayrollsQuery);
      
      for (const docSnapshot of confirmedPayrollsSnapshot.docs) {
        await deleteDoc(doc(db, 'confirmedPayrolls', docSnapshot.id));
      }
      
      // 급여처리상태를 "근무시간검토완료"로 되돌림
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', selectedEmployeeId),
        where('branchId', '==', selectedBranchId),
        where('month', '==', selectedMonth)
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      if (!reviewStatusSnapshot.empty) {
        const docId = reviewStatusSnapshot.docs[0].id;
        await updateDoc(doc(db, 'employeeReviewStatus', docId), {
          status: '근무시간검토완료',
          updatedAt: new Date()
        });
      }
      
      alert('급여확정이 취소되었습니다.');
      
      // 상태 업데이트
      setIsPayrollConfirmed(false);
      
      // 부모 컴포넌트에 상태 변경 알림
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
      }
      
    } catch (error) {
      console.error('급여확정 취소 실패:', error);
      alert('급여확정 취소에 실패했습니다.');
    } finally {
      setConfirming(false);
    }
  };

  // 🔥 최적화: 초기 로드 (한 번만 실행)
  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 메모 로드
  useEffect(() => {
    loadMemo();
  }, [selectedMonth]); // loadMemo 대신 selectedMonth 사용
  
  // selectedEmployeeId가 변경될 때 메모 업데이트
  useEffect(() => {
    if (selectedEmployeeId && employeeMemos[selectedEmployeeId] !== undefined) {
      setMemo(employeeMemos[selectedEmployeeId]);
    } else {
      setMemo('');
    }
  }, [selectedEmployeeId, employeeMemos]);

  // 🔥 최적화: selectedEmployeeId 변경 시만 급여계산
  useEffect(() => {
    if (selectedEmployeeId && employees.length > 0 && weeklySchedules.length > 0) {
      calculatePayroll();
    }
  }, [selectedEmployeeId, employees, weeklySchedules, calculatePayroll]);

  // 🔥 최적화: 급여확정 상태는 필요한 값이 변경될 때만 확인
  useEffect(() => {
    if (selectedEmployeeId && selectedMonth) {
      checkPayrollConfirmed();
    }
  }, [selectedEmployeeId, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // prop으로 받은 월이 변경될 때 로컬 상태 업데이트
  useEffect(() => {
    if (propSelectedMonth) {
      setSelectedMonth(propSelectedMonth);
    }
  }, [propSelectedMonth]);

  // prop으로 받은 직원 ID가 변경될 때 로컬 상태 업데이트
  useEffect(() => {
    if (propSelectedEmployeeId) {
      setSelectedEmployeeId(propSelectedEmployeeId);
      
      // 🔥 직원 선택 시 해당 직원의 첫 번째 지점 자동 선택
      const selectedEmployee = employees.find(emp => emp.id === propSelectedEmployeeId);
      if (selectedEmployee) {
        const employeeData = selectedEmployee as Employee & { branches?: string[]; branchIds?: string[] };
        const employeeBranches = employeeData.branches || employeeData.branchIds || [];
        if (employeeBranches.length > 0) {
          setSelectedBranchId(employeeBranches[0]);
        }
      }
    }
  }, [propSelectedEmployeeId, employees]);

  // 일반 사용자의 경우 자동으로 지점 선택
  useEffect(() => {
    if (!isManager && userBranch && branches.length > 0) {
      setSelectedBranchId(userBranch);
    }
  }, [isManager, userBranch, branches]);

  // 🔥 최적화: 필요한 값이 변경될 때만 스케줄 로드
  useEffect(() => {
    if (selectedMonth && selectedBranchId && selectedEmployeeId) {
      loadWeeklySchedules();
    }
  }, [selectedMonth, selectedBranchId, selectedEmployeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔥 최적화: 위의 useEffect와 중복 제거됨


  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">급여계산</h1>
        <p className="text-gray-600">직원별 급여를 계산하고 관리합니다.</p>
      </div>

      {/* 선택된 월 표시 */}
      {selectedMonth && (
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="text-blue-600 font-medium">
                📅 선택된 월: {selectedMonth}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* 급여계산 결과 */}
      {selectedMonth && selectedBranchId && selectedEmployeeId && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              급여계산 결과 ({selectedMonth})
            </h3>
            <p className="text-sm text-gray-600">
              {branches.find(b => b.id === selectedBranchId)?.name} 지점 - {employees.find(e => e.id === selectedEmployeeId)?.name} 직원
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-500">로딩 중...</div>
            </div>
          ) : noScheduleData ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <div className="text-yellow-800 text-lg font-semibold mb-2">
                📋 미처리 상태
              </div>
              <div className="text-yellow-700">
                선택된 직원의 근무시간 비교 데이터가 없습니다.<br/>
                급여계산을 위해서는 먼저 근무시간을 입력해주세요.
              </div>
            </div>
          ) : payrollCalculations.length > 0 ? (
            <div className="p-6">
              {/* 직원 정보 (표 바깥) */}
              {payrollCalculations.filter(calc => calc.employeeId === selectedEmployeeId).map((calc) => (
                <div key={calc.employeeId} className="mb-8">
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">직원명</label>
                        <p className="text-lg font-semibold text-gray-900">{calc.employeeName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">고용형태</label>
                        <p className="text-lg font-semibold text-gray-900">{calc.employmentType}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">급여형태</label>
                        <p className="text-lg font-semibold text-gray-900">{calc.salaryType}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">시급/월급</label>
                        <p className="text-lg font-semibold text-gray-900">
                          {(calc.salaryType === '시급' || calc.salaryType === 'hourly')
                            ? `${calc.hourlyWage?.toLocaleString()}원/시간`
                            : (calc.salaryType === '월급' || calc.salaryType === 'monthly')
                            ? `${calc.monthlySalary?.toLocaleString()}원/월`
                            : calc.salaryType}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 지점별 근무시간 테이블 */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            지점
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            근무시간
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            초과근무시간
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {calc.branches.map((branch, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {branch.branchName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                              {branch.workHours.toFixed(1)}시간
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                              {/* 초과근무시간 계산 */}
                              {(() => {
                                // 주간근무시간 (기본값 40시간, 실제로는 직원 정보에서 가져와야 함)
                                const weeklyWorkHours = 40;
                                // 하루근무시간 = 주간근무시간 / 8
                                const dailyWorkHours = weeklyWorkHours / 8;
                                // 해당월의 일수
                                const monthDate = typeof selectedMonth === 'string' ? new Date(selectedMonth) : selectedMonth;
                                const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
                                // 한달근무시간 = 하루근무시간 × 해당월의 일수
                                const monthlyWorkHours = dailyWorkHours * daysInMonth;
                                // 초과근무시간 = 해당월 총 근무시간 - 한달근무시간
                                const overtimeHours = Math.max(0, branch.workHours - monthlyWorkHours);
                                return overtimeHours.toFixed(1) + '시간';
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-500 text-lg mb-2">📊</div>
              <div className="text-gray-500 text-lg mb-2">급여계산 데이터 없음</div>
              <div className="text-gray-400 text-sm">
                월과 지점을 선택하고 주간 스케줄 데이터가 있는지 확인해주세요.
              </div>
            </div>
          )}
        </div>
      )}

      {/* 하단 계산내역 */}
      {payrollCalculations.length > 0 && (
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">상세 계산 내역</h3>
          {payrollCalculations.filter(calc => calc.employeeId === selectedEmployeeId).map((calc) => (
            <div key={calc.employeeId} className="mb-6 pb-6 border-b border-gray-200 last:border-b-0 last:mb-0 last:pb-0">
              {/* 기본 정보 테이블 */}
              <div className="overflow-x-auto mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">직원명</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">고용형태</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">급여형태</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시급/월급</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{calc.employeeName}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{calc.employmentType}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{calc.salaryType}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {(calc.salaryType === '시급' || calc.salaryType === 'hourly')
                          ? `${calc.hourlyWage?.toLocaleString()}원/시간`
                          : (calc.salaryType === '월급' || calc.salaryType === 'monthly')
                          ? `${calc.monthlySalary?.toLocaleString()}원/월`
                          : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 근무시간 테이블 */}
              <div className="overflow-x-auto mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">실 근무시간</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-900">{calc.actualWorkHours.toFixed(1)}시간</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* 주휴수당 상세 */}
              {calc.weeklyHolidayDetails && calc.weeklyHolidayDetails.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-blue-800 font-semibold mb-2">📅 주차별 주휴수당 계산 내역:</p>
                  <div className="space-y-1 text-xs">
                    {/* 🔥 날짜순으로 정렬 */}
                    {[...calc.weeklyHolidayDetails].sort((a, b) => {
                      const dateA = new Date(a.weekStart);
                      const dateB = new Date(b.weekStart);
                      return dateA.getTime() - dateB.getTime();
                    }).map((detail, idx) => (
                      <div key={idx} className={`flex justify-between ${detail.eligible ? 'text-blue-700' : 'text-gray-500'}`}>
                        <span>{detail.weekStart} ~ {detail.weekEnd}:</span>
                        <span>
                          {detail.eligible ? (
                            <>{detail.hours.toFixed(1)}시간 × {calc.hourlyWage?.toLocaleString()}원 = {detail.pay.toLocaleString()}원</>
                          ) : (
                            <span className="text-red-600">{detail.reason}</span>
                          )}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-blue-300 flex justify-between font-semibold text-blue-800">
                      <span>주휴수당 합계:</span>
                      <span>{calc.weeklyHolidayPay?.toLocaleString()}원 ({calc.weeklyHolidayHours?.toFixed(1)}시간)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 무급휴가 입력 (근로소득자+월급제만) */}
              {calc.employmentType === '근로소득' && calc.salaryType === '월급' && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">무급휴가 관리</h4>
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-xs text-yellow-700 mb-1">무급휴가 일수</label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={calc.unpaidLeaveDays || 0}
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 0;
                          // TODO: 무급휴가 일수 변경 시 재계산 로직 추가
                          console.log('무급휴가 일수 변경:', days);
                        }}
                        className="w-20 px-2 py-1 border border-yellow-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-yellow-700 mb-1">차감액</label>
                      <span className="text-sm font-medium text-yellow-800">
                        {calc.unpaidLeaveDeduction ? calc.unpaidLeaveDeduction.toLocaleString() + '원' : '0원'}
                      </span>
                    </div>
                    <div className="text-xs text-yellow-600">
                      * 월급 기준으로 일할 계산됩니다 (월급 ÷ 30일)
                    </div>
                  </div>
                </div>
              )}

              {/* 급여 및 공제 테이블 */}
              <div className="overflow-x-auto mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">기본급</th>
                      {/* 시급일 때만 주휴수당 컬럼 표시 */}
                      {calc.salaryType === '시급' && (
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주휴수당</th>
                      )}
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {calc.employmentType === '근로소득' ? '4대보험' : '사업소득공제'}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">총 공제액</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase bg-blue-50">실수령액</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {calc.salaryType === '시급' 
                          ? (calc.grossPay - (calc.weeklyHolidayPay || 0)).toLocaleString() + '원'
                          : calc.grossPay.toLocaleString() + '원'
                        }
                      </td>
                      {/* 시급일 때만 주휴수당 셀 표시 */}
                      {calc.salaryType === '시급' && (
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {calc.weeklyHolidayPay ? calc.weeklyHolidayPay.toLocaleString() + '원' : '-'}
                        </td>
                      )}
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {calc.employmentType === '근로소득' 
                          ? (calc.deductions.insurance > 0 ? calc.deductions.insurance.toLocaleString() + '원' : '-')
                          : (calc.deductions.tax > 0 ? calc.deductions.tax.toLocaleString() + '원' : '-')
                        }
                      </td>
                      <td className="px-4 py-2 text-sm text-red-600">{calc.deductions.total.toLocaleString()}원</td>
                      <td className="px-4 py-2 text-sm font-bold text-blue-700 bg-blue-50">{calc.netPay.toLocaleString()}원</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* 급여확정/취소 버튼 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {isPayrollConfirmed ? (
                  <button
                    onClick={cancelConfirmPayroll}
                    disabled={confirming}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                  >
                    {confirming ? '처리 중...' : '급여확정 취소'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => confirmPayroll(calc)}
                      disabled={confirming}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                    >
                      {confirming ? '확정 중...' : '급여확정'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      ⚠️ 급여확정 후에는 데이터가 변경되지 않습니다
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
          
          {/* 수습기간별 상세 계산 내역 */}
          {payrollCalculations.filter(calc => calc.employeeId === selectedEmployeeId).map((calc) => (
            <div key={`probation-${calc.employeeId}`}>
              {(calc.probationHours || 0) > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <h4 className="text-md font-semibold text-red-800 mb-3">▲ 수습기간 실제 근무시간 계산 (시급):</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-red-700">수습기간 근무시간:</span>
                      <span className="font-semibold text-red-800">{calc.probationHours}시간 (90% 지급)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">정규기간 근무시간:</span>
                      <span className="font-semibold text-red-800">{calc.regularHours}시간 (100% 지급)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">수습기간 급여:</span>
                      <span className="font-semibold text-red-800">{calc.probationPay?.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">정규기간 급여:</span>
                      <span className="font-semibold text-red-800">{calc.regularPay?.toLocaleString()}원</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-red-300">
                      <div className="text-xs text-red-600">
                        계산식: ({calc.probationHours} × {calc.hourlyWage?.toLocaleString()} × 0.9) + ({calc.regularHours} × {calc.hourlyWage?.toLocaleString()}) = {((calc.probationPay || 0) + (calc.regularPay || 0)).toLocaleString()}원
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 급여메모 편집 */}
      {selectedMonth && selectedEmployeeId && (
        <div className="mt-6 bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm">📝</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900 mb-2">급여메모 (자동저장)</h4>
                <textarea
                  value={employeeMemos[selectedEmployeeId] || ''}
                  onChange={(e) => {
                    const memo = e.target.value;
                    setMemo(memo);
                    setEmployeeMemos(prev => ({
                      ...prev,
                      [selectedEmployeeId]: memo
                    }));
                  }}
                  onBlur={(e) => {
                    // 포커스를 잃을 때 저장 (한글 입력 완료 후)
                    const memo = e.target.value;
                    setMemo(memo);
                    saveMemo();
                  }}
                  placeholder="이번 달 급여에 대한 특이사항이나 메모를 입력하세요..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 요약 통계 */}
      {payrollCalculations.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {payrollCalculations.reduce((sum, calc) => sum + calc.actualWorkHours, 0).toFixed(1)}시간
            </div>
            <div className="text-sm text-green-600">총 실제근무시간</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {payrollCalculations.reduce((sum, calc) => sum + calc.grossPay, 0).toLocaleString()}원
            </div>
            <div className="text-sm text-yellow-600">총 기본급</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {payrollCalculations.reduce((sum, calc) => sum + calc.netPay, 0).toLocaleString()}원
            </div>
            <div className="text-sm text-purple-600">총 실수령액</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollCalculation;