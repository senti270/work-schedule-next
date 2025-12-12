// 급여 계산 컴포넌트 - PayrollCalculator 클래스 사용
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { PayrollCalculator, PayrollResult } from '@/utils/PayrollCalculator';

interface Employee {
  id: string;
  name: string;
  employmentType: string;
  salaryType?: string;
  salaryAmount?: number;
  probationStartDate?: Date;
  probationEndDate?: Date;
  includesWeeklyHolidayInWage?: boolean;
  weeklyWorkHours?: number;
  branches: string[];
}

interface Schedule {
  employeeId: string;
  date: Date;
  actualWorkHours: number;
  branchId: string;
  branchName: string;
  breakTime: number;
}

type PayrollLineItemType = 'earning' | 'deduction';

type PayrollLineItemFieldKey =
  | 'basePay'
  | 'weeklyHolidayPay'
  | 'nationalPension'
  | 'healthInsurance'
  | 'longTermCare'
  | 'employmentInsurance'
  | 'incomeTax'
  | 'localIncomeTax'
  | 'withholdingTax';

interface PayrollLineItem {
  id: string;
  type: PayrollLineItemType;
  label: string;
  amount: number;
  note: string;
  fieldKey?: PayrollLineItemFieldKey;
}

type PayrollResultWithItems = PayrollResult & { lineItems?: PayrollLineItem[] };

const generateLineItemId = () => `pli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const formatCurrency = (value: number) => `${(value || 0).toLocaleString()}원`;

const sanitizeLineItem = (item: PayrollLineItem): PayrollLineItem => {
  const safeAmount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : 0;
  return {
    id: item.id || generateLineItemId(),
    type: item.type === 'deduction' ? 'deduction' : 'earning',
    label: item.label ?? '',
    amount: safeAmount,
    note: item.note ?? '',
    fieldKey: item.fieldKey,
  };
};

const createLineItem = (overrides: Partial<PayrollLineItem>): PayrollLineItem =>
  sanitizeLineItem({
    id: generateLineItemId(),
    type: 'earning',
    label: '',
    amount: 0,
    note: '',
    ...overrides,
  });

const generateDefaultLineItems = (calc: PayrollResult): PayrollLineItem[] => {
  const items: PayrollLineItem[] = [];

  const totalBasePay = Math.round((calc.grossPay || 0) - (calc.weeklyHolidayPay || 0));
  const noteParts: string[] = [];
  if ((calc.probationPay || 0) > 0) {
    noteParts.push(
      `수습급여: ${(calc.probationPay || 0).toLocaleString()}원 (${(calc.probationHours || 0).toFixed(1)}시간, 90%)`
    );
  }
  if ((calc.regularPay || 0) > 0) {
    noteParts.push(
      `정규급여: ${(calc.regularPay || 0).toLocaleString()}원 (${(calc.regularHours || 0).toFixed(1)}시간, 100%)`
    );
  }
  if (totalBasePay > 0) {
    items.push(
      createLineItem({
        type: 'earning',
        label: '기본급',
        amount: totalBasePay,
        note: noteParts.join('\n'),
        fieldKey: 'basePay',
      })
    );
  }

  if ((calc.weeklyHolidayPay || 0) > 0) {
    items.push(
      createLineItem({
        type: 'earning',
        label: '주휴수당',
        amount: calc.weeklyHolidayPay || 0,
        note: '',
        fieldKey: 'weeklyHolidayPay',
      })
    );
  }

  const insuranceDetails = {
    nationalPension: calc.deductions?.insuranceDetails?.nationalPension || 0,
    healthInsurance: calc.deductions?.insuranceDetails?.healthInsurance || 0,
    longTermCare: calc.deductions?.insuranceDetails?.longTermCare || 0,
    employmentInsurance: calc.deductions?.insuranceDetails?.employmentInsurance || 0,
  };
  if (insuranceDetails.nationalPension > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '국민연금',
        amount: insuranceDetails.nationalPension,
        fieldKey: 'nationalPension',
      })
    );
  }
  if (insuranceDetails.healthInsurance > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '건강보험',
        amount: insuranceDetails.healthInsurance,
        fieldKey: 'healthInsurance',
      })
    );
  }
  if (insuranceDetails.longTermCare > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '장기요양보험',
        amount: insuranceDetails.longTermCare,
        fieldKey: 'longTermCare',
      })
    );
  }
  if (insuranceDetails.employmentInsurance > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '고용보험',
        amount: insuranceDetails.employmentInsurance,
        fieldKey: 'employmentInsurance',
      })
    );
  }

  const taxDetails = {
    incomeTax: calc.deductions?.taxDetails?.incomeTax || 0,
    localIncomeTax: calc.deductions?.taxDetails?.localIncomeTax || 0,
  };
  if (taxDetails.incomeTax > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '소득세',
        amount: taxDetails.incomeTax,
        fieldKey: 'incomeTax',
      })
    );
  }
  if (taxDetails.localIncomeTax > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '지방소득세',
        amount: taxDetails.localIncomeTax,
        fieldKey: 'localIncomeTax',
      })
    );
  }

  const knownTax = taxDetails.incomeTax + taxDetails.localIncomeTax;
  const remainingTax = (calc.deductions?.tax || 0) - knownTax;
  if (remainingTax > 0) {
    items.push(
      createLineItem({
        type: 'deduction',
        label: '기타 공제',
        amount: remainingTax,
        fieldKey: 'withholdingTax',
      })
    );
  }

  return items;
};

interface PayrollCalculationProps {
  selectedMonth: string;
  selectedEmployeeId: string;
  employees: Employee[];
  onPayrollStatusChange?: () => void;
}

const PayrollCalculation: React.FC<PayrollCalculationProps> = ({
  selectedMonth,
  selectedEmployeeId,
  employees,
  onPayrollStatusChange
}) => {
  const [loading, setLoading] = useState(false);
  const [noScheduleData, setNoScheduleData] = useState(false);
  const [payrollResults, setPayrollResults] = useState<PayrollResultWithItems[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<Schedule[]>([]);
  const [adminMemo, setAdminMemo] = useState(''); // 관리자용 메모
  const [employeeMemo, setEmployeeMemo] = useState(''); // 해당직원조회용 메모
  const [isPayrollConfirmed, setIsPayrollConfirmed] = useState(false);

  const applyLineItemTotals = useCallback((calc: PayrollResultWithItems): PayrollResultWithItems => {
    const sanitizedItems = (calc.lineItems || []).map(sanitizeLineItem);

    let totalEarnings = 0;
    let totalDeductions = 0;
    let weeklyHolidayAmount = calc.weeklyHolidayPay || 0;

    const insuranceDetails: {
      nationalPension: number;
      healthInsurance: number;
      longTermCare: number;
      employmentInsurance: number;
    } = {
      nationalPension: 0,
      healthInsurance: 0,
      longTermCare: 0,
      employmentInsurance: 0,
    };

    const taxDetails: {
      incomeTax: number;
      localIncomeTax: number;
    } = {
      incomeTax: 0,
      localIncomeTax: 0,
    };

    let otherTax = 0;

    sanitizedItems.forEach((item) => {
      if (item.type === 'earning') {
        totalEarnings += item.amount;
        if (item.fieldKey === 'weeklyHolidayPay') {
          weeklyHolidayAmount = item.amount;
        }
      } else {
        totalDeductions += item.amount;
        switch (item.fieldKey) {
          case 'nationalPension':
            insuranceDetails.nationalPension = item.amount;
            break;
          case 'healthInsurance':
            insuranceDetails.healthInsurance = item.amount;
            break;
          case 'longTermCare':
            insuranceDetails.longTermCare = item.amount;
            break;
          case 'employmentInsurance':
            insuranceDetails.employmentInsurance = item.amount;
            break;
          case 'incomeTax':
            taxDetails.incomeTax = item.amount;
            break;
          case 'localIncomeTax':
            taxDetails.localIncomeTax = item.amount;
            break;
          case 'withholdingTax':
            otherTax += item.amount;
            break;
          default:
            otherTax += item.amount;
            break;
        }
      }
    });

    const insuranceTotal = Object.values(insuranceDetails).reduce((sum, value) => sum + (value || 0), 0);
    const taxTotalFromDetails = Object.values(taxDetails).reduce((sum, value) => sum + (value || 0), 0);
    const taxTotal = taxTotalFromDetails + otherTax;

    const baseDeductions = calc.deductions || { insurance: 0, tax: 0, total: 0 };

    const updatedCalc: PayrollResultWithItems = {
      ...calc,
      lineItems: sanitizedItems,
      grossPay: totalEarnings,
      netPay: totalEarnings - totalDeductions,
      weeklyHolidayPay: weeklyHolidayAmount,
      deductions: {
        ...baseDeductions,
        insurance: insuranceTotal,
        tax: taxTotal,
        total: totalDeductions,
        insuranceDetails,
        taxDetails,
        editableDeductions: {
          nationalPension: insuranceDetails.nationalPension,
          healthInsurance: insuranceDetails.healthInsurance,
          longTermCare: insuranceDetails.longTermCare,
          employmentInsurance: insuranceDetails.employmentInsurance,
          incomeTax: taxDetails.incomeTax,
          localIncomeTax: taxDetails.localIncomeTax,
        },
      },
    };

    return updatedCalc;
  }, []);

  const preparePayrollResults = useCallback(
    (results: PayrollResult[]): PayrollResultWithItems[] =>
      results.map((result) => {
        const existingItems = (result as PayrollResultWithItems).lineItems;
        const lineItems = existingItems && existingItems.length > 0
          ? existingItems.map(sanitizeLineItem)
          : generateDefaultLineItems(result);
        return applyLineItemTotals({ ...result, lineItems });
      }),
    [applyLineItemTotals]
  );

  const updateLineItems = useCallback(
    (calcIndex: number, updater: (items: PayrollLineItem[]) => PayrollLineItem[]) => {
      setPayrollResults((prev) =>
        prev.map((calc, idx) => {
          if (idx !== calcIndex) return calc;
          const currentItems = calc.lineItems || [];
          const updatedItems = updater(currentItems).map(sanitizeLineItem);
          return applyLineItemTotals({ ...calc, lineItems: updatedItems });
        })
      );
    },
    [applyLineItemTotals]
  );

  const handleLineItemTypeChange = useCallback(
    (calcIndex: number, itemId: string, type: PayrollLineItemType) => {
      updateLineItems(calcIndex, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, type } : item))
      );
    },
    [updateLineItems]
  );

  const handleLineItemLabelChange = useCallback(
    (calcIndex: number, itemId: string, label: string) => {
      updateLineItems(calcIndex, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, label } : item))
      );
    },
    [updateLineItems]
  );

  const handleLineItemAmountChange = useCallback(
    (calcIndex: number, itemId: string, value: string) => {
      const parsed = Number(value);
      const amount = Number.isFinite(parsed) ? parsed : 0;
      updateLineItems(calcIndex, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, amount } : item))
      );
    },
    [updateLineItems]
  );

  const handleLineItemNoteChange = useCallback(
    (calcIndex: number, itemId: string, note: string) => {
      updateLineItems(calcIndex, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, note } : item))
      );
    },
    [updateLineItems]
  );

  const handleAddLineItem = useCallback(
    (calcIndex: number, type: PayrollLineItemType = 'earning') => {
      updateLineItems(calcIndex, (items) => [...items, createLineItem({ type })]);
    },
    [updateLineItems]
  );

  const handleDeleteLineItem = useCallback(
    (calcIndex: number, itemId: string) => {
      updateLineItems(calcIndex, (items) => items.filter((item) => item.id !== itemId));
    },
    [updateLineItems]
  );

  // 스케줄 데이터 로드
  const loadSchedules = useCallback(async (retryCount = 0) => {
    if (!selectedMonth || !selectedEmployeeId) {
      console.log('🔥 loadSchedules 조건 불충족:', { selectedMonth, selectedEmployeeId });
      return;
    }

    console.log('🔥 loadSchedules 시작:', { selectedMonth, selectedEmployeeId, retryCount });
    setLoading(true);
    try {
      const schedulesQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const schedulesSnapshot = await getDocs(schedulesQuery);
      console.log('🔥 workTimeComparisonResults 조회 결과:', schedulesSnapshot.docs.length, '건');
      console.log('🔥 조회 조건:', { month: selectedMonth, employeeId: selectedEmployeeId });
      
      // 각 문서의 month 필드와 date 필드 확인
      schedulesSnapshot.docs.forEach((doc, idx) => {
        const data = doc.data();
        const docDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);
        const docMonth = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`;
        console.log(`🔥 문서 ${idx + 1}:`, {
          저장된month: data.month,
          실제날짜month: docMonth,
          date: docDate.toISOString().split('T')[0],
          actualWorkHours: data.actualWorkHours,
          month일치: data.month === selectedMonth,
          날짜일치: docMonth === selectedMonth
        });
      });
      
      if (schedulesSnapshot.empty && retryCount < 2) {
        console.log('🔥 데이터 없음 - 1초 후 재시도:', retryCount + 1);
        setTimeout(() => {
          loadSchedules(retryCount + 1);
        }, 1000);
        return;
      }
      
      // 해당 월의 시작일과 종료일 계산 (month 필드가 잘못 저장된 경우 대비)
      const [year, monthNum] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
      
      // employeeId와 month로 필터링 후, 실제 날짜로도 필터링 (month 필드 오류 대비)
      const allSchedules = schedulesSnapshot.docs
        .map(doc => {
          const data = doc.data();
          const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
          return {
            employeeId: data.employeeId,
            date: date,
            actualWorkHours: data.actualWorkHours || 0,
            branchId: data.branchId,
            branchName: data.branchName,
            breakTime: data.breakTime || 0,
            posTimeRange: data.posTimeRange || '',
            isManual: data.isManual || false,
            docId: doc.id
          };
        })
        .filter(schedule => {
          // 실제 날짜가 해당 월에 속하는지 확인
          const scheduleDate = new Date(schedule.date);
          const isInMonth = scheduleDate >= monthStart && scheduleDate <= monthEnd;
          if (!isInMonth) {
            console.log('🔥 loadSchedules: 전월/다음월 데이터 제외:', {
              date: schedule.date.toISOString().split('T')[0],
              actualWorkHours: schedule.actualWorkHours,
              저장된month: schedulesSnapshot.docs.find(d => {
                const dData = d.data();
                const dDate = dData.date?.toDate ? dData.date.toDate() : new Date(dData.date);
                return dDate.getTime() === schedule.date.getTime();
              })?.data()?.month
            });
          }
          return isInMonth;
        });
      
      // 🔧 같은 날짜/지점/POS 시각 기준 중복 제거 (지점별로 분리하여 처리)
      const dedupMap = new Map<string, typeof allSchedules[number]>();
      for (const row of allSchedules) {
        const dateStr = row.date.toISOString().split('T')[0];
        // 🔥 branchId를 키에 포함하여 같은 날짜에 다른 지점에서 일한 경우도 모두 포함
        const key = `${dateStr}|${row.branchId || ''}|${row.posTimeRange || ''}`;
        const prev = dedupMap.get(key);
        if (!prev) {
          dedupMap.set(key, row);
        } else {
          // 1순위: 수동 입력(isManual) 우선
          if (row.isManual && !prev.isManual) {
            dedupMap.set(key, row);
            continue;
          }
          if (!row.isManual && prev.isManual) {
            continue;
          }
          // 2순위: actualWorkHours가 더 큰 쪽 우선
          if (row.actualWorkHours > prev.actualWorkHours) {
            dedupMap.set(key, row);
          }
        }
      }
      
      const schedulesData = Array.from(dedupMap.values()).map(({ docId, posTimeRange, isManual, ...rest }) => rest) as Schedule[];
      
      if (allSchedules.length !== schedulesData.length) {
        console.log(`🔥 중복 데이터 제거: ${allSchedules.length}건 → ${schedulesData.length}건`);
      }

      // 전월 보정 제거: 해당 월의 데이터만 사용 (주휴수당 계산은 별도 처리)
      console.log('🔥 변환된 스케줄 데이터 (해당 월만):', schedulesData.length, '건');
      console.log('🔥 각 레코드 상세:', schedulesData.map(s => ({
        date: s.date.toISOString().split('T')[0],
        actualWorkHours: s.actualWorkHours,
        branchName: s.branchName,
        month: s.date.getMonth() + 1
      })));
      const totalHours = schedulesData.reduce((sum, s) => sum + (s.actualWorkHours || 0), 0);
      console.log('🔥 loadSchedules 총 근무시간:', totalHours, '시간');
      setWeeklySchedules(schedulesData);
    } catch (error) {
      console.error('스케줄 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedEmployeeId]);

  // 기존 급여 데이터 로드
  const loadExistingPayroll = useCallback(async (): Promise<PayrollResultWithItems[] | null> => {
    if (!selectedMonth || !selectedEmployeeId) {
      return null;
    }

    try {
      const payrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      if (!payrollSnapshot.empty) {
        const payrollData = payrollSnapshot.docs[0].data();
        console.log('🔥 기존 급여 데이터 로드됨:', payrollData);

        const calculations = payrollData.calculations || [];
        console.log('🔥 calculations 배열:', calculations);
        console.log('🔥 calculations 길이:', calculations.length);
        
        // 🔥 lineItems 확인
        if (calculations.length > 0) {
          console.log('🔥 첫 번째 calculation의 lineItems:', (calculations[0] as any).lineItems);
          console.log('🔥 첫 번째 calculation의 lineItems 길이:', (calculations[0] as any).lineItems?.length || 0);
        }
        
        const results = preparePayrollResults(calculations as PayrollResult[]);
        console.log('🔥 preparePayrollResults 결과:', results);
        if (results.length > 0) {
          console.log('🔥 첫 번째 result의 lineItems:', results[0].lineItems);
          console.log('🔥 첫 번째 result의 lineItems 길이:', results[0].lineItems?.length || 0);
        }
        return results;
      }

      return null;
    } catch (error) {
      console.error('기존 급여 데이터 로드 실패:', error);
      return null;
    }
  }, [selectedMonth, selectedEmployeeId, preparePayrollResults]);

  // 급여 계산
  const calculatePayroll = useCallback(async () => {
    console.log('🔥 calculatePayroll 시작:', { 
      employeesLength: employees.length, 
      selectedEmployeeId, 
      weeklySchedulesLength: weeklySchedules.length 
    });
    
    if (!employees.length || !selectedEmployeeId) {
      console.log('🔥 calculatePayroll 조건 불충족');
      setPayrollResults([]);
      return;
    }
    
    // 🔥 급여 확정 여부를 먼저 확인 (상태에 의존하지 않고 직접 확인)
    try {
      const payrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      const hasConfirmedData = payrollSnapshot.docs.length > 0;
      
      if (hasConfirmedData) {
        console.log('🔥 급여 확정됨 - 재계산 방지, 기존 데이터 사용');
        const existingPayroll = await loadExistingPayroll();
        console.log('🔥 기존 급여 데이터:', existingPayroll);
        if (existingPayroll && existingPayroll.length > 0) {
          setPayrollResults(existingPayroll);
          console.log('🔥 기존 급여 데이터 설정 완료:', existingPayroll.length, '건');
          // 상태도 업데이트
          setIsPayrollConfirmed(true);
          return;
        } else {
          console.log('🔥 기존 급여 데이터가 없거나 비어있음, 새로 계산 진행');
        }
      } else {
        // 급여 확정 데이터가 없으면 상태도 false로 설정
        setIsPayrollConfirmed(false);
      }
    } catch (error) {
      console.error('급여 확정 상태 확인 실패:', error);
      // 에러 발생 시에도 기존 로직대로 진행
    }
    
    // 🔥 급여가 확정된 경우 재계산하지 않고 기존 데이터 사용 (상태 기반 체크 - 백업)
    if (isPayrollConfirmed) {
      console.log('🔥 급여 확정됨 (상태 기반) - 재계산 방지, 기존 데이터 사용');
      const existingPayroll = await loadExistingPayroll();
      console.log('🔥 기존 급여 데이터:', existingPayroll);
      if (existingPayroll && existingPayroll.length > 0) {
        setPayrollResults(existingPayroll);
        console.log('🔥 기존 급여 데이터 설정 완료:', existingPayroll.length, '건');
        return;
      } else {
        console.log('🔥 기존 급여 데이터가 없거나 비어있음, 새로 계산 진행');
      }
    }
    
    // 🔥 클릭 시마다 모든 데이터를 새로 계산
    
    // 선택된 직원 찾기
    const employee = employees.find(emp => emp.id === selectedEmployeeId);
    if (!employee) return;
    
    // 기존 데이터가 없으면 새로 계산
    // 월급직의 경우 스케줄 데이터가 없어도 계산 가능
    const isMonthlySalary = employee.salaryType === 'monthly';
    
    // 스케줄 데이터 로드 (상태에 의존하지 않고 직접 로드)
    let schedulesToUse = weeklySchedules;
    
    if (!schedulesToUse.length && !isMonthlySalary) {
      console.log('🔥 weeklySchedules가 비어있음 - workTimeComparisonResults에서 직접 로드');
      
      try {
        // employeeId와 month로 필터링하여 actualWorkHours 합산
        const comparisonQuery = query(
          collection(db, 'workTimeComparisonResults'),
          where('month', '==', selectedMonth),
          where('employeeId', '==', selectedEmployeeId)
        );
        const comparisonSnapshot = await getDocs(comparisonQuery);
        console.log('🔥 calculatePayroll - workTimeComparisonResults 조회 결과:', comparisonSnapshot.docs.length, '건');
        console.log('🔥 calculatePayroll - 조회 조건:', { month: selectedMonth, employeeId: selectedEmployeeId });
        
        // 각 문서의 month 필드와 date 필드 확인
        comparisonSnapshot.docs.forEach((doc, idx) => {
          const data = doc.data();
          const docDate = data.date?.toDate ? data.date.toDate() : new Date(data.date);
          const docMonth = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`;
          console.log(`🔥 calculatePayroll - 문서 ${idx + 1}:`, {
            저장된month: data.month,
            실제날짜month: docMonth,
            date: docDate.toISOString().split('T')[0],
            actualWorkHours: data.actualWorkHours,
            month일치: data.month === selectedMonth,
            날짜일치: docMonth === selectedMonth
          });
        });
        
        if (comparisonSnapshot.empty) {
          console.log('🔥 근무시간비교 데이터가 없음 - 근무시간비교를 먼저 완료해주세요');
          alert('근무시간비교를 먼저 완료해주세요.');
          setNoScheduleData(true);
          setPayrollResults([]);
          return;
        } else {
          console.log('🔥 workTimeComparisonResults에서 직접 로드:', comparisonSnapshot.docs.length, '건');
          
          // 해당 월의 시작일과 종료일 계산 (month 필드가 잘못 저장된 경우 대비)
          const [year, monthNum] = selectedMonth.split('-').map(Number);
          const monthStart = new Date(year, monthNum - 1, 1);
          const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);
          
          // employeeId와 month로 필터링 후, 실제 날짜로도 필터링 (month 필드 오류 대비)
          const allSchedules = comparisonSnapshot.docs
            .map(doc => {
              const data = doc.data();
              const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
              return {
                employeeId: data.employeeId,
                date: date,
                actualWorkHours: data.actualWorkHours || 0,
                branchId: data.branchId,
                branchName: data.branchName,
                breakTime: data.breakTime || 0,
                posTimeRange: data.posTimeRange || '',
                isManual: data.isManual || false,
                docId: doc.id
              };
            })
            .filter(schedule => {
              // 실제 날짜가 해당 월에 속하는지 확인
              const scheduleDate = new Date(schedule.date);
              const isInMonth = scheduleDate >= monthStart && scheduleDate <= monthEnd;
              if (!isInMonth) {
                console.log('🔥 calculatePayroll: 전월/다음월 데이터 제외:', {
                  date: schedule.date.toISOString().split('T')[0],
                  actualWorkHours: schedule.actualWorkHours
                });
              }
              return isInMonth;
            });
          
          // 🔧 같은 날짜/지점/POS 시각 기준 중복 제거 (지점별로 분리하여 처리)
          const dedupMap = new Map<string, typeof allSchedules[number]>();
          for (const row of allSchedules) {
            const dateStr = row.date.toISOString().split('T')[0];
            // 🔥 branchId를 키에 포함하여 같은 날짜에 다른 지점에서 일한 경우도 모두 포함
            const key = `${dateStr}|${row.branchId || ''}|${row.posTimeRange || ''}`;
            const prev = dedupMap.get(key);
            if (!prev) {
              dedupMap.set(key, row);
            } else {
              // 1순위: 수동 입력(isManual) 우선
              if (row.isManual && !prev.isManual) {
                dedupMap.set(key, row);
                continue;
              }
              if (!row.isManual && prev.isManual) {
                continue;
              }
              // 2순위: actualWorkHours가 더 큰 쪽 우선
              if (row.actualWorkHours > prev.actualWorkHours) {
                dedupMap.set(key, row);
              }
            }
          }
          
          schedulesToUse = Array.from(dedupMap.values()).map(({ docId, posTimeRange, isManual, ...rest }) => rest) as Schedule[];
          
          if (allSchedules.length !== schedulesToUse.length) {
            console.log(`🔥 calculatePayroll - 중복 데이터 제거: ${allSchedules.length}건 → ${schedulesToUse.length}건`);
          }
          
          console.log('🔥 직접 로드된 스케줄 데이터:', schedulesToUse.length, '건');
          console.log('🔥 각 레코드 상세:', schedulesToUse.map(s => ({
            date: s.date.toISOString().split('T')[0],
            actualWorkHours: s.actualWorkHours,
            branchName: s.branchName,
            month: s.date.getMonth() + 1,
            year: s.date.getFullYear()
          })));
          const totalHours = schedulesToUse.reduce((sum, s) => sum + (s.actualWorkHours || 0), 0);
          console.log('🔥 총 근무시간:', totalHours, '시간');
          console.log('🔥 선택된 월:', selectedMonth);
        }
      } catch (error) {
        console.error('근무시간비교 데이터 확인 실패:', error);
        alert('데이터 로딩에 문제가 있습니다. 페이지를 새로고침하거나 다른 직원을 선택 후 다시 시도해주세요.');
        setNoScheduleData(true);
        setPayrollResults([]);
        return;
      }
    }
    
    if (!schedulesToUse.length && !isMonthlySalary) {
      console.log('🔥 최종적으로 스케줄 데이터 없음');
      setNoScheduleData(true);
      setPayrollResults([]);
      return;
    }
    
    setNoScheduleData(false);

    try {
      // 🔥 중도 계약 변경 처리: employmentContracts 로드
      const contractsSnapshot = await getDocs(
        query(collection(db, 'employmentContracts'), where('employeeId', '==', selectedEmployeeId))
      );
      
      // 선택된 월의 시작일과 끝일 계산
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      
      // 먼저 모든 계약을 로드하고 정렬
      const allContracts = contractsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((c: any) => c.startDate) // startDate 필수
        .map((c: any) => {
          // 🔥 startDate는 날짜만 사용 (시간 제거)
          let startDate: Date;
          if (c.startDate?.toDate) {
            const date = c.startDate.toDate();
            startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
          } else if (c.startDate instanceof Date) {
            startDate = new Date(c.startDate.getFullYear(), c.startDate.getMonth(), c.startDate.getDate(), 0, 0, 0, 0);
          } else {
            const date = new Date(c.startDate);
            startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
          }
          return {
            ...c,
            startDate
          };
        })
        .sort((a: any, b: any) => a.startDate.getTime() - b.startDate.getTime()); // startDate 기준 정렬
      
      // 🔥 선택된 월에 유효한 계약만 필터링
      // 계약이 선택된 월과 겹치는지 확인: 계약 시작일이 선택된 월의 끝일 이전이고, 계약 종료일(다음 계약 시작일 - 1일)이 선택된 월의 시작일 이후
      const contracts = allContracts.filter((c: any, index: number) => {
        const contractStart = c.startDate;
        // 다음 계약이 있으면 그 시작일 - 1일이 종료일, 없으면 무한대(월의 끝일까지)
        const contractEnd = index < allContracts.length - 1 
          ? new Date(allContracts[index + 1].startDate.getTime() - 1)
          : monthEnd;
        
        // 계약이 선택된 월과 겹치는지 확인
        // 계약 시작일이 선택된 월의 끝일 이전이고, 계약 종료일이 선택된 월의 시작일 이후여야 함
        const overlaps = contractStart <= monthEnd && contractEnd >= monthStart;
        
        if (!overlaps) {
          console.log(`🔥 계약 제외: ${c.startDate.toISOString().split('T')[0]} ~ ${contractEnd.toISOString().split('T')[0]} (선택된 월: ${selectedMonth}), 급여타입: ${c.salaryType}, 급여액: ${c.salaryAmount}`);
        } else {
          console.log(`✅ 계약 포함: ${c.startDate.toISOString().split('T')[0]} ~ ${contractEnd.toISOString().split('T')[0]} (선택된 월: ${selectedMonth}), 급여타입: ${c.salaryType}, 급여액: ${c.salaryAmount}`);
        }
        
        return overlaps;
      });

      console.log('🔥 employmentContracts 로드:', contracts.length, '건 (선택된 월:', selectedMonth, ')');
      if (contracts.length > 0) {
        console.log('🔥 포함된 계약 목록:', contracts.map((c: any) => ({
          startDate: c.startDate.toISOString().split('T')[0],
          salaryType: c.salaryType,
          salaryAmount: c.salaryAmount,
          employmentType: c.employmentType
        })));
      }

      // 스케줄 데이터 처리 (월급직의 경우 빈 배열)
      const scheduleData = schedulesToUse.length > 0 ? 
        await Promise.all(schedulesToUse.map(async (schedule) => {
          let branchName = schedule.branchName;
          
          // branchName이 없으면 branchId로 조회
          if (!branchName && schedule.branchId) {
            try {
              const branchQuery = query(
                collection(db, 'branches'),
                where('__name__', '==', schedule.branchId)
              );
              const branchSnapshot = await getDocs(branchQuery);
              if (!branchSnapshot.empty) {
                branchName = branchSnapshot.docs[0].data().name;
              }
            } catch (error) {
              console.error('지점명 조회 실패:', error);
            }
          }
          
          return {
            date: schedule.date,
            actualWorkHours: schedule.actualWorkHours,
            branchId: schedule.branchId,
            branchName: branchName || '지점명 없음'
          };
        })) : [];

      // 🔥 중도 계약 변경이 있는 경우: 날짜별로 분할 계산
      if (contracts.length > 1 || (contracts.length === 1 && contracts[0].startDate)) {
        const [year, month] = selectedMonth.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);
        
        const contractPeriods: Array<{contract: any; start: Date; end: Date; schedules: typeof scheduleData}> = [];
        
        for (let i = 0; i < contracts.length; i++) {
          const contract = contracts[i];
          const contractStart = contract.startDate;
          const contractEnd = i < contracts.length - 1 ? new Date(contracts[i + 1].startDate.getTime() - 1) : monthEnd;
          
          const periodStart = contractStart > monthStart ? contractStart : monthStart;
          const periodEnd = contractEnd < monthEnd ? contractEnd : monthEnd;
          
          if (periodStart <= periodEnd) {
            const periodSchedules = scheduleData.filter(s => {
              const sDate = new Date(s.date);
              return sDate >= periodStart && sDate <= periodEnd;
            });
            
            contractPeriods.push({
              contract,
              start: periodStart,
              end: periodEnd,
              schedules: periodSchedules
            });
          }
        }

        console.log('🔥 계약 구간별 분할:', contractPeriods.length, '개 구간');

        // 각 구간별로 계산 후 합산
        const results: PayrollResult[] = [];
        for (const period of contractPeriods) {
          const employeeData = {
            id: employee.id,
            name: employee.name,
            employmentType: period.contract.employmentType || employee.employmentType,
            salaryType: period.contract.salaryType || employee.salaryType,
            salaryAmount: period.contract.salaryAmount || employee.salaryAmount,
            probationStartDate: employee.probationStartDate,
            probationEndDate: employee.probationEndDate,
            includesWeeklyHolidayInWage: period.contract.includeHolidayAllowance ?? employee.includesWeeklyHolidayInWage,
            weeklyWorkHours: period.contract.weeklyWorkHours || employee.weeklyWorkHours || 40
          };

          const contractData = {
            employmentType: period.contract.employmentType || employee.employmentType,
            salaryType: period.contract.salaryType || employee.salaryType || 'hourly',
            salaryAmount: period.contract.salaryAmount || employee.salaryAmount || 0,
            weeklyWorkHours: period.contract.weeklyWorkHours || employee.weeklyWorkHours || 40,
            includeHolidayAllowance: period.contract.includeHolidayAllowance ?? employee.includesWeeklyHolidayInWage
          };

          const calculator = new PayrollCalculator(employeeData, contractData, period.schedules);
          const periodResult = calculator.calculate();
          results.push(periodResult);
        }

        // 구간별 결과 합산
        const combinedResult = results.reduce((acc, r, idx) => {
          if (idx === 0) {
            // 첫 번째 결과를 기본값으로 사용
            return { ...r };
          }
          acc.totalWorkHours += r.totalWorkHours;
          acc.actualWorkHours += r.actualWorkHours;
          acc.grossPay += r.grossPay;
          acc.deductions.total += r.deductions.total;
          acc.deductions.insurance += r.deductions.insurance;
          acc.deductions.tax += r.deductions.tax;
          acc.netPay += r.netPay;
          acc.weeklyHolidayPay = (acc.weeklyHolidayPay || 0) + (r.weeklyHolidayPay || 0);
          acc.weeklyHolidayHours = (acc.weeklyHolidayHours || 0) + (r.weeklyHolidayHours || 0);
          if (r.weeklyHolidayDetails) {
            acc.weeklyHolidayDetails = [...(acc.weeklyHolidayDetails || []), ...r.weeklyHolidayDetails];
          }
          // branches 합산 (지점별로 시간 합산)
          const branchMap = new Map(acc.branches.map((b: any) => [b.branchId, b]));
          r.branches.forEach((b: any) => {
            const existing = branchMap.get(b.branchId);
            if (existing) {
              existing.workHours += b.workHours;
            } else {
              branchMap.set(b.branchId, { ...b });
            }
          });
          acc.branches = Array.from(branchMap.values());
          return acc;
        }, results[0]);

        setPayrollResults(preparePayrollResults([combinedResult]));
        return;
      }

      // 단일 계약 또는 계약이 없는 경우: 기존 로직
      // 🔥 최신 계약 선택: contracts는 startDate 기준 오름차순 정렬되어 있으므로 마지막 요소가 최신 계약
      const contract = contracts.length > 0 ? contracts[contracts.length - 1] : null;
      
      if (contract) {
        console.log(`🔥 최신 계약 선택 (단일/계약 없음 케이스): ${contract.startDate.toISOString().split('T')[0]}, 급여타입: ${contract.salaryType}, 급여액: ${contract.salaryAmount}`);
      }
      const employeeData = {
        id: employee.id,
        name: employee.name,
        employmentType: contract?.employmentType || employee.employmentType,
        salaryType: contract?.salaryType || employee.salaryType,
        salaryAmount: contract?.salaryAmount || employee.salaryAmount,
        probationStartDate: employee.probationStartDate,
        probationEndDate: employee.probationEndDate,
        includesWeeklyHolidayInWage: contract?.includeHolidayAllowance ?? employee.includesWeeklyHolidayInWage,
        weeklyWorkHours: contract?.weeklyWorkHours || employee.weeklyWorkHours || 40
      };

      const contractData = {
        employmentType: contract?.employmentType || employee.employmentType,
        salaryType: contract?.salaryType || employee.salaryType || 'hourly',
        salaryAmount: contract?.salaryAmount || employee.salaryAmount || 0,
        weeklyWorkHours: contract?.weeklyWorkHours || employee.weeklyWorkHours || 40,
        includeHolidayAllowance: contract?.includeHolidayAllowance ?? employee.includesWeeklyHolidayInWage
      };

      console.log('🔥 PayrollCalculator 입력 데이터:', { 
        employeeData,
        contractData,
        scheduleData: scheduleData.length
      });

      // PayrollCalculator로 계산
      const calculator = new PayrollCalculator(employeeData, contractData, scheduleData);
      const result = calculator.calculate();
      console.log('🔥 PayrollCalculator 계산 결과:', result);
      console.log('🔥 branches 정보:', result.branches);

      setPayrollResults(preparePayrollResults([result]));
      console.log('🔥 setPayrollResults 호출됨, 결과 개수:', [result].length);
    } catch (error) {
      console.error('급여 계산 실패:', error);
      alert('급여 계산 중 오류가 발생했습니다.');
      setPayrollResults([]);
    }
  }, [employees, selectedEmployeeId, weeklySchedules, loadExistingPayroll, isPayrollConfirmed, selectedMonth, preparePayrollResults]);

  // 메모 로드
  const loadMemos = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    try {
      // 관리자용 메모 로드
      const adminMemosQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId),
        where('type', '==', 'admin')
      );
      
      const adminMemosSnapshot = await getDocs(adminMemosQuery);
      if (!adminMemosSnapshot.empty) {
        const adminMemoData = adminMemosSnapshot.docs[0].data();
        setAdminMemo(adminMemoData.memo || '');
      } else {
        setAdminMemo('');
      }

      // 해당직원조회용 메모 로드
      const employeeMemosQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId),
        where('type', '==', 'employee')
      );
      
      const employeeMemosSnapshot = await getDocs(employeeMemosQuery);
      if (!employeeMemosSnapshot.empty) {
        const employeeMemoData = employeeMemosSnapshot.docs[0].data();
        setEmployeeMemo(employeeMemoData.memo || '');
      } else {
        setEmployeeMemo('');
      }
    } catch (error) {
      console.error('메모 로드 실패:', error);
      setAdminMemo('');
      setEmployeeMemo('');
    }
  }, [selectedMonth, selectedEmployeeId]);

  // 관리자용 메모 저장
  const saveAdminMemo = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    try {
      const existingMemoQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId),
        where('type', '==', 'admin')
      );
      
      const existingMemoSnapshot = await getDocs(existingMemoQuery);
      
      if (!existingMemoSnapshot.empty) {
        const memoDoc = existingMemoSnapshot.docs[0];
        await updateDoc(doc(db, 'employeeMemos', memoDoc.id), {
          memo: adminMemo,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'employeeMemos'), {
          month: selectedMonth,
          employeeId: selectedEmployeeId,
          type: 'admin',
          memo: adminMemo,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      alert('관리자용 메모가 저장되었습니다.');
    } catch (error) {
      console.error('관리자용 메모 저장 실패:', error);
      alert('관리자용 메모 저장에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, adminMemo]);

  // 해당직원조회용 메모 저장
  const saveEmployeeMemo = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    try {
      const existingMemoQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId),
        where('type', '==', 'employee')
      );
      
      const existingMemoSnapshot = await getDocs(existingMemoQuery);
      
      if (!existingMemoSnapshot.empty) {
        const memoDoc = existingMemoSnapshot.docs[0];
        await updateDoc(doc(db, 'employeeMemos', memoDoc.id), {
          memo: employeeMemo,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'employeeMemos'), {
          month: selectedMonth,
          employeeId: selectedEmployeeId,
          type: 'employee',
          memo: employeeMemo,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      alert('해당직원조회용 메모가 저장되었습니다.');
    } catch (error) {
      console.error('해당직원조회용 메모 저장 실패:', error);
      alert('해당직원조회용 메모 저장에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, employeeMemo]);

  // 급여확정 상태 확인
  const checkPayrollConfirmed = useCallback(async () => {
    if (!selectedEmployeeId || !selectedMonth) {
      setIsPayrollConfirmed(false);
      return;
    }

    try {
      const payrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      // 🔥 데이터가 있으면 확정, 없으면 확정전 (confirmedAt 상관없이)
      const hasData = payrollSnapshot.docs.length > 0;
      
      setIsPayrollConfirmed(hasData);
    } catch (error) {
      console.error('급여확정 상태 확인 실패:', error);
      setIsPayrollConfirmed(false);
    }
  }, [selectedEmployeeId, selectedMonth]);

  // 급여 확정
  const handleConfirmPayroll = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId || payrollResults.length === 0) return;
    
    try {
      // 🔥 사용자가 수정한 내용을 그대로 저장하기 위해 applyLineItemTotals를 호출하지 않음
      // 이미 updateLineItems에서 applyLineItemTotals가 호출되어 최신 상태로 유지됨
      const normalizedResults = payrollResults;
      // 1. confirmedPayrolls에 급여 확정 데이터 추가
      // 총액 계산 (세무사 전송파일/이체파일에서 사용)
      const totalGrossPay = normalizedResults.reduce((sum, r) => sum + (r.grossPay || 0), 0);
      const totalNetPay = normalizedResults.reduce((sum, r) => sum + (r.netPay || 0), 0);
      // 대표지점(Primary) 기준 branch 정보 결정
      const empDoc = employees.find(emp => emp.id === selectedEmployeeId) as any;
      const primaryBranchId: string | undefined = empDoc?.primaryBranchId || (empDoc?.branches && empDoc.branches[0]);
      const primaryBranchName: string | undefined = empDoc?.primaryBranchName || '';

      // calculations 배열에서 undefined 값 제거 및 정리
      // 🔥 화면에 보이는 payrollResults를 그대로 저장 (lineItems 포함)
      console.log('🔥 급여 확정 - 저장할 데이터:', normalizedResults);
      console.log('🔥 lineItems 확인:', normalizedResults.map((r: any) => ({
        employeeName: r.employeeName,
        lineItemsCount: r.lineItems?.length || 0,
        lineItems: r.lineItems
      })));
      
      const cleanedCalculations = normalizedResults.map((result: any) => {
        const cleaned: any = {};
        Object.keys(result).forEach(key => {
          const value = result[key];
          if (value !== undefined && value !== null) {
            // 객체인 경우 재귀적으로 정리
            if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
              const cleanedObj: any = {};
              Object.keys(value).forEach(objKey => {
                if (value[objKey] !== undefined && value[objKey] !== null) {
                  cleanedObj[objKey] = value[objKey];
                }
              });
              cleaned[key] = cleanedObj;
            } else {
              // 배열(lineItems 포함)이나 Date는 그대로 복사
              cleaned[key] = value;
            }
          }
        });
        return cleaned;
      });
      
      console.log('🔥 정리된 calculations:', cleanedCalculations.map((c: any) => ({
        employeeName: c.employeeName,
        lineItemsCount: c.lineItems?.length || 0
      })));

      // undefined 값 제거를 위한 필터링
      const confirmedPayrollData: any = {
        month: selectedMonth,
        employeeId: selectedEmployeeId,
        employeeName: normalizedResults[0]?.employeeName || '',
        calculations: cleanedCalculations,
        grossPay: totalGrossPay || 0,
        netPay: totalNetPay || 0,
        // 대표지점 기준 저장 (지점별 집계/필터에서 사용)
        branchId: primaryBranchId || '',
        branchName: primaryBranchName || '',
        confirmedAt: new Date(),
        confirmedBy: 'admin'
      };

      // undefined 값 제거 (재귀적으로)
      const removeUndefined = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(item => removeUndefined(item));
        } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
          const cleaned: any = {};
          Object.keys(obj).forEach(key => {
            if (obj[key] !== undefined) {
              cleaned[key] = removeUndefined(obj[key]);
            }
          });
          return cleaned;
        }
        return obj;
      };

      const finalData = removeUndefined(confirmedPayrollData);
      
      // 기존 급여 확정 데이터가 있는지 확인하고 업데이트 또는 추가
      const existingPayrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const existingPayrollSnapshot = await getDocs(existingPayrollQuery);
      
      if (!existingPayrollSnapshot.empty) {
        // 기존 데이터가 있으면 업데이트
        const existingDocId = existingPayrollSnapshot.docs[0].id;
        await updateDoc(doc(db, 'confirmedPayrolls', existingDocId), finalData);
        console.log('🔥 기존 급여 확정 데이터 업데이트됨:', existingDocId);
      } else {
        // 기존 데이터가 없으면 새로 추가
        await addDoc(collection(db, 'confirmedPayrolls'), finalData);
        console.log('🔥 새로운 급여 확정 데이터 추가됨');
      }
      
      // 2. 급여확정 상태 업데이트
      setIsPayrollConfirmed(true);
      
      // 3. 해당 직원의 모든 지점 상태를 "급여확정완료"로 업데이트
      const employee = employees.find(emp => emp.id === selectedEmployeeId);
      if (!employee) {
        throw new Error(`직원을 찾을 수 없습니다: ${selectedEmployeeId}`);
      }
      
      // employeeBranches 컬렉션에서 해당 직원의 모든 지점 가져오기
      const employeeBranchesQuery = query(
        collection(db, 'employeeBranches'),
        where('employeeId', '==', selectedEmployeeId)
      );
      const employeeBranchesSnapshot = await getDocs(employeeBranchesQuery);
      const employeeBranchIds = employeeBranchesSnapshot.docs.map(doc => doc.data().branchId).filter(Boolean);
      
      console.log('✅ 직원 지점 목록:', employeeBranchIds);
      
      // 지점 정보가 없으면 대표지점만 사용
      if (employeeBranchIds.length === 0) {
        console.warn('⚠️ 직원의 지점 정보가 없습니다. 대표지점만 사용합니다.');
        if (primaryBranchId) {
          employeeBranchIds.push(primaryBranchId);
        }
      }
      
      if (employeeBranchIds.length > 0) {
        // 지점 정보 가져오기
        const branchesSnapshot = await getDocs(collection(db, 'branches'));
        const branchesMap = new Map(branchesSnapshot.docs.map(d => [d.id, d.data().name || '']));
        
        for (const branchId of employeeBranchIds) {
          // 결정적 문서 ID 사용 (WorkTimeComparison과 동일한 방식)
          const fixedId = `${selectedEmployeeId}_${branchId}_${selectedMonth}`;
          const branchName = branchesMap.get(branchId) || '';
          
          console.log(`✅ 급여확정완료 상태 업데이트 시작: ${fixedId}, 지점명: ${branchName}`);
          
          // 🔥 merge: false로 설정하여 기존 상태를 완전히 덮어쓰기
          await setDoc(doc(db, 'employeeReviewStatus', fixedId), {
            employeeId: selectedEmployeeId,
            employeeName: employee.name,
            month: selectedMonth,
            branchId: branchId,
            branchName: branchName,
            status: '급여확정완료',
            updatedAt: new Date(),
            createdAt: new Date()
          });
          
          console.log('✅ 급여확정완료 상태 업데이트 완료:', fixedId);
        }
      } else {
        console.warn('⚠️ 업데이트할 지점이 없습니다.');
      }
      
      // 3. workTimeComparisonResults의 status를 "review_completed"로 업데이트
      const comparisonQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const comparisonSnapshot = await getDocs(comparisonQuery);
      
      for (const docSnapshot of comparisonSnapshot.docs) {
        await updateDoc(doc(db, 'workTimeComparisonResults', docSnapshot.id), {
          status: 'review_completed',
          updatedAt: new Date()
        });
      }
      
      alert('급여가 확정되었습니다.');
      
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
      }
      
      // 해당 직원만 상태 새로고침
      if ((window as unknown as { refreshEmployeeStatus?: (id: string) => void }).refreshEmployeeStatus && selectedEmployeeId) {
        (window as unknown as { refreshEmployeeStatus: (id: string) => void }).refreshEmployeeStatus(selectedEmployeeId);
      }
    } catch (error) {
      console.error('급여 확정 실패:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('에러 상세:', errorMessage);
      alert(`급여 확정에 실패했습니다.\n에러: ${errorMessage}`);
    }
  }, [selectedMonth, selectedEmployeeId, payrollResults, employees, onPayrollStatusChange, applyLineItemTotals]);


  // 급여 확정 취소
  const handleCancelPayroll = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    if (!confirm('급여 확정을 취소하시겠습니까?')) {
      return;
    }
    
    try {
      // 1. confirmedPayrolls에서 데이터 삭제
      const payrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      for (const docSnapshot of payrollSnapshot.docs) {
        await deleteDoc(doc(db, 'confirmedPayrolls', docSnapshot.id));
      }
      
      // 2. 급여확정 상태 업데이트
      setIsPayrollConfirmed(false);
      
      // 3. 해당 직원의 모든 지점 상태를 "근무시간검토완료"로 되돌리기
      const employee = employees.find(emp => emp.id === selectedEmployeeId);
      if (employee) {
        // employeeBranches 컬렉션에서 해당 직원의 모든 지점 가져오기
        const employeeBranchesQuery = query(
          collection(db, 'employeeBranches'),
          where('employeeId', '==', selectedEmployeeId)
        );
        const employeeBranchesSnapshot = await getDocs(employeeBranchesQuery);
        const employeeBranchIds = employeeBranchesSnapshot.docs.map(doc => doc.data().branchId).filter(Boolean);
        
        if (employeeBranchIds.length > 0) {
          // 지점 정보 가져오기
          const branchesSnapshot = await getDocs(collection(db, 'branches'));
          const branchesMap = new Map(branchesSnapshot.docs.map(d => [d.id, d.data().name || '']));
          
          for (const branchId of employeeBranchIds) {
            // 결정적 문서 ID 사용 (WorkTimeComparison과 동일한 방식)
            const fixedId = `${selectedEmployeeId}_${branchId}_${selectedMonth}`;
            const branchName = branchesMap.get(branchId) || '';
            
            // 🔥 merge: false로 설정하여 기존 상태를 완전히 덮어쓰기
            await setDoc(doc(db, 'employeeReviewStatus', fixedId), {
              employeeId: selectedEmployeeId,
              employeeName: employee.name,
              month: selectedMonth,
              branchId: branchId,
              branchName: branchName,
              status: '근무시간검토완료',
              updatedAt: new Date(),
              createdAt: new Date()
            });
            
            console.log('✅ 급여확정취소 - 상태 되돌리기:', fixedId);
          }
        }
      }
      
      // 3. workTimeComparisonResults의 status를 원래대로 되돌리기
      const comparisonQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const comparisonSnapshot = await getDocs(comparisonQuery);
      
      for (const docSnapshot of comparisonSnapshot.docs) {
        const data = docSnapshot.data();
        // 원래 상태로 되돌리기 (time_match 또는 review_required)
        const originalStatus = data.difference && Math.abs(data.difference) >= 0.17 ? 'review_required' : 'time_match';
        await updateDoc(doc(db, 'workTimeComparisonResults', docSnapshot.id), {
          status: originalStatus,
          updatedAt: new Date()
        });
      }
      
      // 4. 급여확정 상태 업데이트
      setIsPayrollConfirmed(false);
      
      alert('급여 확정이 취소되었습니다.');
      
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
      }
      
      // 해당 직원만 상태 새로고침
      if ((window as unknown as { refreshEmployeeStatus?: (id: string) => void }).refreshEmployeeStatus && selectedEmployeeId) {
        (window as unknown as { refreshEmployeeStatus: (id: string) => void }).refreshEmployeeStatus(selectedEmployeeId);
      }
    } catch (error) {
      console.error('급여 확정 취소 실패:', error);
      alert('급여 확정 취소에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, employees, onPayrollStatusChange]);

  // useEffect hooks
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    calculatePayroll();
  }, [calculatePayroll]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  useEffect(() => {
    checkPayrollConfirmed();
  }, [checkPayrollConfirmed]);

  // 렌더링
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  if (!selectedEmployeeId) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">직원을 선택해주세요.</p>
      </div>
    );
  }

  if (noScheduleData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">해당 월의 스케줄 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {payrollResults.map((calc, index) => {
        const lineItems = calc.lineItems || [];
        const totalEarnings = lineItems
          .filter((item) => item.type === 'earning')
          .reduce((sum, item) => sum + (item.amount || 0), 0);
        const totalDeductions = lineItems
          .filter((item) => item.type === 'deduction')
          .reduce((sum, item) => sum + (item.amount || 0), 0);
        const netAmount = totalEarnings - totalDeductions;
        const isReadOnly = isPayrollConfirmed;

        return (
        <div key={calc.employeeId ?? index} className="bg-white rounded-lg shadow p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">{calc.employeeName} 급여 계산</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-yellow-600 text-sm">⚠️</span>
                </div>
                <div className="ml-2">
                  <p className="text-sm text-yellow-800">
                    <strong>공제금액은 클릭시점으로 새로 계산됩니다.</strong><br/>
                    급여확정완료 직전에 수정해주세요!
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* 근로계약정보 */}
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm font-medium text-gray-800 mb-2">근로계약정보</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">고용형태:</span>
                <span className="ml-2 font-medium text-gray-900">{calc.employmentType}</span>
              </div>
              <div>
                <span className="text-gray-600">급여타입:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {calc.salaryType === 'hourly' ? '시급' : calc.salaryType === 'monthly' ? '월급' : calc.salaryType}
                </span>
              </div>
              <div>
                <span className="text-gray-600">급여액:</span>
                <span className="ml-2 font-medium text-gray-900">{calc.salaryAmount?.toLocaleString()}원</span>
              </div>
              <div>
                <span className="text-gray-600">주간근무시간:</span>
                <span className="ml-2 font-medium text-gray-900">{calc.weeklyWorkHours || 40}시간</span>
              </div>
            </div>
          </div>
          
          {/* 수습기간 정보 */}
          {(calc.probationHours || 0) > 0 && (() => {
            const employee = employees.find(emp => emp.id === selectedEmployeeId);
            const probationStartDate = employee?.probationStartDate;
            const probationEndDate = employee?.probationEndDate;
            const formatDate = (date: Date | undefined) => {
              if (!date) return '-';
              const d = date instanceof Date ? date : new Date(date);
              return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
            };
            return (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-800 mb-2">수습기간 적용</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-yellow-700">수습기간:</span>
                    <span className="ml-2 font-medium text-yellow-900">
                      {formatDate(probationStartDate)} ~ {formatDate(probationEndDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-yellow-700">수습시간:</span>
                    <span className="ml-2 font-medium text-yellow-900">{(calc.probationHours || 0).toFixed(1)}시간</span>
                  </div>
                  <div>
                    <span className="text-yellow-700">수습급여:</span>
                    <span className="ml-2 font-medium text-yellow-900">{(calc.probationPay || 0).toLocaleString()}원 (90%)</span>
                  </div>
                  <div>
                    <span className="text-yellow-700">정규시간:</span>
                    <span className="ml-2 font-medium text-yellow-900">{(calc.regularHours || 0).toFixed(1)}시간</span>
                  </div>
                  <div>
                    <span className="text-yellow-700">정규급여:</span>
                    <span className="ml-2 font-medium text-yellow-900">{(calc.regularPay || 0).toLocaleString()}원 (100%)</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 근무시간 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 text-sm">실 근무시간</h4>
              <p className="text-2xl font-bold text-blue-900">{calc.actualWorkHours.toFixed(1)}h</p>
              {/* 지점별 근무시간 상세 */}
              {calc.branches && calc.branches.length > 0 && (
                <div className="mt-2 text-xs text-blue-700">
                  {calc.branches.map((branch, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{branch.branchName}:</span>
                      <span className="font-medium">{branch.workHours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-medium text-green-800 text-sm">총 지급액</h4>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(totalEarnings)}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-medium text-purple-800 text-sm">실수령액</h4>
              <p className="text-2xl font-bold text-purple-900">{formatCurrency(netAmount)}</p>
            </div>
          </div>
          
          {/* 급여 상세 표 */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium text-gray-800">지급/공제 내역</h4>
              {!isReadOnly && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleAddLineItem(index, 'earning')}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    + 지급 행 추가
                  </button>
                  <button
                    onClick={() => handleAddLineItem(index, 'deduction')}
                    className="px-3 py-1 text-xs font-medium bg-rose-500 text-white rounded hover:bg-rose-600"
                  >
                    + 공제 행 추가
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left w-2/5">항목</th>
                    <th className="px-4 py-2 text-right w-1/5">지급</th>
                    <th className="px-4 py-2 text-right w-1/5">공제</th>
                    <th className="px-4 py-2 text-left w-2/5">산식 · 수정근거 · 참고사항</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                        행이 없습니다. 행 추가 버튼을 눌러 입력을 시작하세요.
                      </td>
                    </tr>
                  )}
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-2 align-top">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-4 text-xs text-gray-600">
                            <label className="flex items-center space-x-1">
                              <input
                                type="radio"
                                name={`line-type-${index}-${item.id}`}
                                checked={item.type === 'earning'}
                                onChange={() => handleLineItemTypeChange(index, item.id, 'earning')}
                                disabled={isReadOnly}
                              />
                              <span>지급</span>
                            </label>
                            <label className="flex items-center space-x-1">
                              <input
                                type="radio"
                                name={`line-type-${index}-${item.id}`}
                                checked={item.type === 'deduction'}
                                onChange={() => handleLineItemTypeChange(index, item.id, 'deduction')}
                                disabled={isReadOnly}
                              />
                              <span>공제</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => handleLineItemLabelChange(index, item.id, e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full border rounded px-3 py-2 text-sm ${isReadOnly ? 'bg-gray-100 text-gray-500 border-gray-200' : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'}`}
                            placeholder="항목명을 입력하세요"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-top">
                        {item.type === 'earning' ? (
                          <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => handleLineItemAmountChange(index, item.id, e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full border rounded px-3 py-2 text-right ${isReadOnly ? 'bg-gray-100 text-gray-500 border-gray-200' : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'}`}
                          />
                        ) : (
                          <div className="text-gray-400 text-right">-</div>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        {item.type === 'deduction' ? (
                          <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => handleLineItemAmountChange(index, item.id, e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full border rounded px-3 py-2 text-right ${isReadOnly ? 'bg-gray-100 text-gray-500 border-gray-200' : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'}`}
                          />
                        ) : (
                          <div className="text-gray-400 text-right">-</div>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <div className="space-y-2">
                          <textarea
                            value={item.note}
                            onChange={(e) => handleLineItemNoteChange(index, item.id, e.target.value)}
                            disabled={isReadOnly}
                            rows={Math.max(2, (item.note?.split('\n').length || 1))}
                            className={`w-full border rounded px-3 py-2 text-sm leading-relaxed ${isReadOnly ? 'bg-gray-100 text-gray-500 border-gray-200' : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500'}`}
                            placeholder="산식 또는 참고사항을 입력하세요"
                          />
                          {!isReadOnly && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleDeleteLineItem(index, item.id)}
                                className="text-xs text-rose-600 hover:underline"
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-semibold">
                    <td className="px-4 py-2 text-right">합계</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(totalEarnings)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(totalDeductions)}</td>
                    <td className="px-4 py-2 text-right text-blue-700">실수령액 {formatCurrency(netAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 주휴수당 상세 */}
          {(calc.salaryType === 'hourly' || calc.salaryType === '시급') && calc.weeklyHolidayDetails && calc.weeklyHolidayDetails.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2">주휴수당 상세</h4>
              <ul className="list-disc list-inside text-xs text-blue-700">
                {[...calc.weeklyHolidayDetails].sort((a, b) => {
                  const dateA = new Date(a.weekStart);
                  const dateB = new Date(b.weekStart);
                  return dateA.getTime() - dateB.getTime();
                }).map((detail, idx) => (
                  <li key={idx}>
                    {detail.weekStart} ~ {detail.weekEnd}: {detail.eligible || !(detail.reason && String(detail.reason).includes('이월'))
                      ? `${detail.hours.toFixed(1)}시간, ${detail.pay.toLocaleString()}원 `
                      : ''}
                    ({detail.eligible ? '지급' : `미지급 - ${detail.reason}`})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 급여메모 */}
          <div className="mb-6 space-y-4">
            {/* 관리자용 메모 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                급여메모 (관리자용)
              </label>
              <textarea
                value={adminMemo}
                onChange={(e) => setAdminMemo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="관리자용 메모를 입력하세요..."
              />
              <button
                onClick={saveAdminMemo}
                className="mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
              >
                관리자용 메모 저장
              </button>
            </div>

            {/* 해당직원조회용 메모 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                급여메모 (해당직원조회용)
              </label>
              <textarea
                value={employeeMemo}
                onChange={(e) => setEmployeeMemo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="해당직원조회용 메모를 입력하세요..."
              />
              <button
                onClick={saveEmployeeMemo}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                해당직원조회용 메모 저장
              </button>
            </div>
          </div>
          
          {/* 급여 확정 버튼 */}
          <div className="flex justify-end">
            {!isPayrollConfirmed ? (
              <button
                onClick={handleConfirmPayroll}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                급여 확정
              </button>
            ) : (
              <button
                onClick={handleCancelPayroll}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                급여 확정 취소
              </button>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default PayrollCalculation;
