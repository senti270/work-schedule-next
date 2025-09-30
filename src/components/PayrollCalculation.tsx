import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';

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
  const pay = weeklyHolidayHours * i.hourlyWage;

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

  // 지점 로드
  const loadBranches = useCallback(async () => {
    try {
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = branchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Branch[];
      
      if (isManager) {
        setBranches(branchesData);
      } else if (userBranch) {
        const userBranchData = branchesData.filter(branch => branch.id === userBranch);
        setBranches(userBranchData);
      }
    } catch (error) {
      console.error('지점 로드 실패:', error);
    }
  }, [isManager, userBranch]);

  // 직원 로드
  const loadEmployees = useCallback(async () => {
    try {
      console.log('PayrollCalculation - employees 컬렉션 조회 시작');
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      console.log('PayrollCalculation - employees 컬렉션 조회 완료:', employeesSnapshot.docs.length, '건');
      
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      
      const 유은서테스트직원 = employeesData.find(emp => emp.name === '유은서테스트');
      console.log('PayrollCalculation - 직원 원본 데이터 확인:', 유은서테스트직원);
      console.log('PayrollCalculation - 유은서테스트 수습기간 정보:', {
        probationStartDate: 유은서테스트직원?.probationStartDate,
        probationEndDate: 유은서테스트직원?.probationEndDate,
        probationStart: 유은서테스트직원?.probationStart,
        probationEnd: 유은서테스트직원?.probationEnd
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
              // 최신 계약서 찾기 (createdAt 기준으로 정렬)
              const contracts = contractsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; createdAt?: Date | { toDate: () => Date } | string; [key: string]: unknown })
                .sort((a, b) => {
                  const dateA = a.createdAt ? new Date(a.createdAt.toString()).getTime() : 0;
                  const dateB = b.createdAt ? new Date(b.createdAt.toString()).getTime() : 0;
                  return dateB - dateA;
                });
              const contract = contracts[0] as { [key: string]: unknown; employmentType?: string; salaryType?: string; hourlyWage?: number; monthlySalary?: number; probationStartDate?: Date | { toDate: () => Date }; probationEndDate?: Date | { toDate: () => Date } };
              
            console.log(`직원 ${employee.name} 계약서 정보:`, {
              employeeId: employee.id,
              contractEmploymentType: contract.employmentType,
              contractSalaryType: contract.salaryType,
              contractSalaryAmount: contract.salaryAmount,
              probationStartDate: contract.probationStartDate,
              probationEndDate: contract.probationEndDate,
              probationStartType: typeof contract.probationStartDate,
              probationEndType: typeof contract.probationEndDate
            });
            
            console.log(`직원 ${employee.name} 계약서 원본 데이터:`, contract);
              
              return {
                ...employee,
                employmentType: (contract.employmentType as string) || '로드실패',
                salaryType: (contract.salaryType === 'hourly' ? '시급' : 
                           contract.salaryType === 'monthly' ? '월급' : 
                           contract.salaryType as string || '로드실패') as '시급' | '월급' | 'hourly' | 'monthly',
                hourlyWage: contract.salaryType === 'hourly' ? (contract.hourlyWage as number) : (contract.salaryType === 'monthly' ? 0 : employee.hourlyWage),
                monthlySalary: contract.salaryType === 'monthly' ? (contract.monthlySalary as number) : (contract.salaryType === 'hourly' ? 0 : employee.monthlySalary),
                // 수습기간 정보는 employees 컬렉션에서 직접 가져오기
                probationStartDate: employee.probationStartDate || contract.probationStartDate,
                probationEndDate: employee.probationEndDate || contract.probationEndDate
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

  // 직원 로드 useEffect (한 번만 실행)
  useEffect(() => {
    console.log('PayrollCalculation - useEffect 호출됨, loadEmployees 실행');
    loadEmployees();
  }, []); // 의존성 배열을 빈 배열로 변경
  
  // loadEmployees 함수가 변경될 때마다 호출되는지 확인
  useEffect(() => {
    console.log('PayrollCalculation - loadEmployees 함수 변경됨');
  }, [loadEmployees]);

  // 주간 스케줄 로드
  const loadWeeklySchedules = useCallback(async () => {
    console.log('PayrollCalculation - loadWeeklySchedules 호출됨:', { selectedMonth, selectedBranchId, selectedEmployeeId });
    if (!selectedMonth || !selectedBranchId || !selectedEmployeeId) {
      console.log('PayrollCalculation - loadWeeklySchedules 조건 불만족:', { selectedMonth, selectedBranchId, selectedEmployeeId });
      return;
    }

    try {
      setLoading(true);
      console.log('PayrollCalculation - 주간 스케줄 로드 시작...');
      
      // 해당 월의 선택된 직원의 실제 근무 기록 조회
      const schedulesQuery = query(
        collection(db, 'actualWorkRecords'),
        where('branchId', '==', selectedBranchId),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const schedulesSnapshot = await getDocs(schedulesQuery);
      console.log('PayrollCalculation - 주간 스케줄 쿼리 결과:', schedulesSnapshot.docs.length, '건');
      
      // 쿼리 조건 확인
      console.log('PayrollCalculation - 쿼리 조건:', {
        branchId: selectedBranchId,
        month: selectedMonth,
        employeeId: selectedEmployeeId
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
        // 지점 이름을 branches 배열에서 찾아서 설정
        const branch = branches.find(b => b.id === branchId);
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
      salaryType: employee.salaryType,
      hourlyWage: employee.hourlyWage,
      condition: (employee.salaryType === '시급' || employee.salaryType === 'hourly') && employee.hourlyWage
    });

    // 급여 계산 (수습기간별로 나누어서 계산)
    let grossPay = 0;
    
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
        employeeSchedules.forEach((schedule, index) => {
          // 다른 날짜 필드들 확인
          const scheduleDate = schedule.date ? new Date(schedule.date) : schedule.weekStart;
          const startDate = schedule.startDate;
          const createdAt = schedule.createdAt;
          const actualWorkHours = schedule.actualWorkHours || 0;
          
          // 사용 가능한 날짜 필드 확인
          console.log(`🔥 PayrollCalculation - 스케줄 [${index}] 날짜 필드들:`, {
            weekStart: scheduleDate,
            startDate: startDate,
            createdAt: createdAt,
            scheduleKeys: Object.keys(schedule)
          });
          
          // fullSchedule 객체의 모든 필드 상세 확인
          console.log(`🔥 PayrollCalculation - 스케줄 [${index}] 전체 객체:`, schedule);
          
          // 스케줄 객체의 모든 날짜 관련 필드 확인
          console.log(`🔥 PayrollCalculation - 스케줄 [${index}] 날짜 필드들 상세:`, {
            weekStart: schedule.weekStart,
            startDate: schedule.startDate,
            createdAt: schedule.createdAt,
            date: schedule.date,
            workDate: schedule.workDate,
            scheduleDate: schedule.scheduleDate,
            weekStartDate: schedule.weekStartDate,
            allKeys: Object.keys(schedule)
          });
          
          // 수습기간 여부 판단 (여러 날짜 필드 시도)
          let isInProbation = false;
          if (probationStart && probationEnd) {
            if (scheduleDate && scheduleDate instanceof Date) {
              isInProbation = scheduleDate >= probationStart && scheduleDate <= probationEnd;
            } else if (startDate && startDate instanceof Date) {
              isInProbation = startDate >= probationStart && startDate <= probationEnd;
            }
          }
          
          console.log(`PayrollCalculation - 스케줄 [${index}] 수습기간 판단:`, {
            scheduleDate: scheduleDate,
            scheduleDateString: scheduleDate?.toISOString?.()?.split('T')[0],
            actualWorkHours: actualWorkHours,
            isInProbation: isInProbation,
            probationStart: probationStart,
            probationEnd: probationEnd,
            probationStartString: probationStart?.toISOString().split('T')[0],
            probationEndString: probationEnd?.toISOString().split('T')[0]
          });
          
          if (isInProbation) {
            probationHours += actualWorkHours;
          } else {
            regularHours += actualWorkHours;
          }
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
      const probationPay = probationHours * employee.hourlyWage * 0.9;
      const regularPay = regularHours * employee.hourlyWage;
      let basePay = probationPay + regularPay;
      
      // 주휴수당 계산 (근로소득 또는 사업소득 & 시급 & 주휴수당 미포함)
      let weeklyHolidayPay = 0;
      let weeklyHolidayHours = 0;
      
      const shouldCalculateWeeklyHoliday = 
        (employee.employmentType === '근로소득' || employee.employmentType === '사업소득') &&
        !employee.includesWeeklyHolidayInWage;
      
      if (shouldCalculateWeeklyHoliday) {
        // 주별로 주휴수당 계산 (employeeSchedules를 주별로 그룹핑)
        const weeklyScheduleGroups = employeeSchedules.reduce((groups, schedule) => {
          const weekKey = schedule.weekStart.toISOString().split('T')[0];
          if (!groups[weekKey]) {
            groups[weekKey] = [];
          }
          groups[weekKey].push(schedule);
          return groups;
        }, {} as Record<string, typeof employeeSchedules>);
        
        // 각 주별로 주휴수당 계산
        Object.entries(weeklyScheduleGroups).forEach(([weekKey, weekSchedules]) => {
          const weeklyContractHours = employee.weeklyContractHours || 40; // 기본 주 40시간
          const weeklyWorkdays = employee.weeklyWorkdays || 5; // 기본 주 5일
          const weeklyActualHours = weekSchedules.reduce((sum, s) => sum + s.actualWorkHours, 0);
          
          // 소정근로일 모두 이행 여부 확인 (실제로는 더 복잡한 로직 필요)
          const workedAllScheduledDays = weekSchedules.length >= weeklyWorkdays;
          
          // 첫 주 판단 (해당 월의 첫 주인지)
          const monthStart = new Date(selectedMonth);
          const weekStartDate = new Date(weekKey);
          const isFirstWeek = weekStartDate.getDate() <= 7;
          
          const weeklyHolidayResult = calcWeeklyHolidayPay({
            hourlyWage: employee.hourlyWage,
            weeklyContractHours: weeklyActualHours, // 실제 근무시간 기준
            weeklyWorkdays: weeklyWorkdays,
            workedAllScheduledDays: workedAllScheduledDays,
            isFirstWeek: isFirstWeek,
            carryoverHoursPrevWeek: 0, // 전달 주 합산은 추후 구현
            requirePrevWeekAttendance: false
          });
          
          if (weeklyHolidayResult.eligible) {
            weeklyHolidayPay += weeklyHolidayResult.pay;
            weeklyHolidayHours += weeklyHolidayResult.hours;
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
      if (isInProbation) {
        // 수습기간 중에는 월급의 90% 적용
        grossPay = employee.monthlySalary * 0.9;
        console.log('PayrollCalculation - 수습기간 월급 적용:', employee.monthlySalary, '원 × 0.9 =', grossPay, '원');
      } else {
        grossPay = employee.monthlySalary;
        console.log('PayrollCalculation - 정규 월급 적용:', employee.monthlySalary, '원');
      }
    }

    // 공제 계산
    let insurance = 0;
    let tax = 0;
    let netPay = 0;

    if (employee.employmentType === '근로소득') {
      // 4대보험 계산 (간단한 예시)
      const baseAmount = Math.min(grossPay, 5000000); // 최대 500만원
      insurance = baseAmount * 0.0765; // 7.65% (4대보험)
      tax = baseAmount * 0.033; // 3.3% (소득세)
      netPay = grossPay - (insurance + tax);
      console.log('PayrollCalculation - 근로소득 공제:', {
        grossPay: grossPay,
        insurance: insurance,
        tax: tax,
        netPay: netPay
      });
    } else if (employee.employmentType === '사업소득') {
      tax = grossPay * 0.033; // 3.3% (소득세만)
      netPay = grossPay * 0.967; // 96.7% (3.3% 공제)
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
      tax = grossPay * 0.033; // 3.3% (소득세만)
      netPay = grossPay * 0.967; // 96.7% (3.3% 공제)
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
      includesWeeklyHolidayInWage: employee.includesWeeklyHolidayInWage || false
    });

    setPayrollCalculations(calculations);
  }, [employees, weeklySchedules, selectedEmployeeId]);

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
        await addDoc(collection(db, 'employeeReviewStatus'), {
          employeeId: selectedEmployeeId,
          branchId: selectedBranchId,
          month: selectedMonth,
          status: '급여확정완료',
          createdAt: new Date(),
          updatedAt: new Date()
        });
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

  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, [loadBranches, loadEmployees]);

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

  // selectedEmployeeId가 변경될 때 급여계산 다시 실행
  useEffect(() => {
    if (selectedEmployeeId && employees.length > 0 && weeklySchedules.length > 0) {
      calculatePayroll();
    }
  }, [selectedEmployeeId, calculatePayroll]);

  // 급여확정 상태 확인
  useEffect(() => {
    checkPayrollConfirmed();
  }, [checkPayrollConfirmed]);

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
    }
  }, [propSelectedEmployeeId]);

  // 일반 사용자의 경우 자동으로 지점 선택
  useEffect(() => {
    if (!isManager && userBranch && branches.length > 0) {
      setSelectedBranchId(userBranch);
    }
  }, [isManager, userBranch, branches]);

  useEffect(() => {
    loadWeeklySchedules();
  }, [loadWeeklySchedules]);

  useEffect(() => {
    if (selectedEmployeeId) {
      const runCalculatePayroll = async () => {
        await calculatePayroll();
      };
      runCalculatePayroll();
    }
  }, [calculatePayroll, selectedEmployeeId]);


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
              {payrollCalculations.map((calc) => (
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

                  {/* 지점별 급여 테이블 */}
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
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            해당지점급여
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
                              {/* 해당 지점 급여 계산 */}
                              {(() => {
                                if (calc.salaryType === '시급' || calc.salaryType === 'hourly') {
                                  // 주간근무시간 (기본값 40시간)
                                  const weeklyWorkHours = 40;
                                  // 하루근무시간 = 주간근무시간 / 8
                                  const dailyWorkHours = weeklyWorkHours / 8;
                                  // 해당월의 일수
                                  const monthDate = typeof selectedMonth === 'string' ? new Date(selectedMonth) : selectedMonth;
                                  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
                                  // 한달근무시간 = 하루근무시간 × 해당월의 일수
                                  const monthlyWorkHours = dailyWorkHours * daysInMonth;
                                  
                                  const regularHours = Math.min(branch.workHours, monthlyWorkHours);
                                  const overtimeHours = Math.max(0, branch.workHours - monthlyWorkHours);
                                  const regularPay = regularHours * (calc.hourlyWage || 0);
                                  const overtimePay = overtimeHours * (calc.hourlyWage || 0) * 1.5; // 1.5배
                                  return (regularPay + overtimePay).toLocaleString() + '원';
                                } else {
                                  // 월급인 경우 지점별로 나누어 계산
                                  const totalHours = calc.branches.reduce((sum, b) => sum + b.workHours, 0);
                                  const branchRatio = totalHours > 0 ? branch.workHours / totalHours : 0;
                                  return (calc.grossPay * branchRatio).toLocaleString() + '원';
                                }
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
          {payrollCalculations.map((calc) => (
            <div key={calc.employeeId} className="space-y-2 text-sm text-gray-700 mb-4 pb-4 border-b border-gray-100 last:border-b-0 last:mb-0 last:pb-0">
              <p><strong>직원명:</strong> {calc.employeeName}</p>
              <p><strong>고용형태:</strong> {calc.employmentType}</p>
              <p><strong>급여형태:</strong> {calc.salaryType}</p>
              {(calc.salaryType === '시급' || calc.salaryType === 'hourly') && <p><strong>시급:</strong> {calc.hourlyWage?.toLocaleString()}원/시간</p>}
              {(calc.salaryType === '월급' || calc.salaryType === 'monthly') && <p><strong>월급:</strong> {calc.monthlySalary?.toLocaleString()}원/월</p>}
              <p><strong>총 근무시간:</strong> {calc.totalWorkHours.toFixed(1)}시간</p>
              <p><strong>총 휴게시간:</strong> {calc.totalBreakTime.toFixed(1)}시간</p>
              <p><strong>실 근무시간:</strong> {calc.actualWorkHours.toFixed(1)}시간</p>
              {calc.weeklyHolidayPay && calc.weeklyHolidayPay > 0 && (
                <>
                  <p className="text-blue-600"><strong>주휴수당:</strong> {calc.weeklyHolidayPay.toLocaleString()}원 ({calc.weeklyHolidayHours?.toFixed(1)}시간)</p>
                </>
              )}
              <p><strong>기본급:</strong> {calc.grossPay.toLocaleString()}원</p>
              <p><strong>공제:</strong></p>
              <ul className="list-disc list-inside ml-4">
                {calc.deductions.insurance > 0 && <li>4대보험: {calc.deductions.insurance.toLocaleString()}원</li>}
                {calc.deductions.tax > 0 && <li>사업소득공제: {calc.deductions.tax.toLocaleString()}원</li>}
                <li>총 공제액: {calc.deductions.total.toLocaleString()}원</li>
              </ul>
              <p className="text-lg font-bold text-blue-700">실수령액: {calc.netPay.toLocaleString()}원</p>
              
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
          {payrollCalculations.map((calc) => (
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