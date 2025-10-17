// 급여 계산 컴포넌트 - PayrollCalculator 클래스 사용
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
  const [payrollResults, setPayrollResults] = useState<PayrollResult[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<Schedule[]>([]);
  const [adminMemo, setAdminMemo] = useState(''); // 관리자용 메모
  const [employeeMemo, setEmployeeMemo] = useState(''); // 해당직원조회용 메모
  const [isPayrollConfirmed, setIsPayrollConfirmed] = useState(false);
  const [editableDeductions, setEditableDeductions] = useState<{[key: string]: number}>({});

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
      
      if (schedulesSnapshot.empty && retryCount < 2) {
        console.log('🔥 데이터 없음 - 1초 후 재시도:', retryCount + 1);
        setTimeout(() => {
          loadSchedules(retryCount + 1);
        }, 1000);
        return;
      }
      
      const schedulesData = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('🔥 스케줄 데이터:', data);
        return {
          employeeId: data.employeeId,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
          actualWorkHours: data.actualWorkHours || 0,
          branchId: data.branchId,
          branchName: data.branchName,
          breakTime: data.breakTime || 0
        };
      }) as Schedule[];

      console.log('🔥 변환된 스케줄 데이터:', schedulesData);
      setWeeklySchedules(schedulesData);
    } catch (error) {
      console.error('스케줄 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedEmployeeId]);

  // 기존 급여 데이터 로드
  const loadExistingPayroll = useCallback(async () => {
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
        
        // editableDeductions 설정
        if (payrollData.editableDeductions) {
          setEditableDeductions(payrollData.editableDeductions);
        }
        
        const calculations = payrollData.calculations || [];
        console.log('🔥 calculations 배열:', calculations);
        console.log('🔥 calculations 길이:', calculations.length);
        return calculations;
      }
      
      return null;
    } catch (error) {
      console.error('기존 급여 데이터 로드 실패:', error);
      return null;
    }
  }, [selectedMonth, selectedEmployeeId]);

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
    
    // 🔥 급여가 확정된 경우 재계산하지 않고 기존 데이터 사용
    if (isPayrollConfirmed) {
      console.log('🔥 급여 확정됨 - 재계산 방지, 기존 데이터 사용');
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
    // 기존 공제 데이터만 보존
    const existingPayroll = await loadExistingPayroll();
    let preservedDeductions = {};
    
    if (existingPayroll && existingPayroll.length > 0) {
      console.log('🔥 기존 공제 데이터 보존:', existingPayroll.editableDeductions);
      preservedDeductions = existingPayroll.editableDeductions || {};
    }
    
    // 선택된 직원 찾기
    const employee = employees.find(emp => emp.id === selectedEmployeeId);
    if (!employee) return;
    
    // 기존 데이터가 없으면 새로 계산
    // 월급직의 경우 스케줄 데이터가 없어도 계산 가능
    const isMonthlySalary = employee.salaryType === 'monthly';
    if (!weeklySchedules.length && !isMonthlySalary) {
      console.log('🔥 스케줄 데이터 없음 - 근무시간비교가 완료되지 않았을 수 있음');
      setNoScheduleData(true);
      setPayrollResults([]);
      
      // 근무시간비교 데이터가 있는지 확인
      try {
        const comparisonQuery = query(
          collection(db, 'workTimeComparisonResults'),
          where('month', '==', selectedMonth),
          where('employeeId', '==', selectedEmployeeId)
        );
        const comparisonSnapshot = await getDocs(comparisonQuery);
        
        if (comparisonSnapshot.empty) {
          console.log('🔥 근무시간비교 데이터가 없음 - 근무시간비교를 먼저 완료해주세요');
          alert('근무시간비교를 먼저 완료해주세요.');
        } else {
          console.log('🔥 근무시간비교 데이터는 있지만 스케줄 로딩 실패 - 페이지를 새로고침하거나 다른 직원을 선택 후 다시 시도해주세요');
          alert('데이터 로딩에 문제가 있습니다. 페이지를 새로고침하거나 다른 직원을 선택 후 다시 시도해주세요.');
        }
      } catch (error) {
        console.error('근무시간비교 데이터 확인 실패:', error);
      }
      
      return;
    }
    
    setNoScheduleData(false);

    try {
      // PayrollCalculator에 전달할 데이터 준비 (이미 계약서 정보가 병합된 employee 사용)
      const employeeData = {
        id: employee.id,
        name: employee.name,
        employmentType: employee.employmentType,
        salaryType: employee.salaryType,
        salaryAmount: employee.salaryAmount,
        probationStartDate: employee.probationStartDate,
        probationEndDate: employee.probationEndDate,
        includesWeeklyHolidayInWage: employee.includesWeeklyHolidayInWage,
        weeklyWorkHours: employee.weeklyWorkHours || 40
      };

      const contractData = {
        employmentType: employee.employmentType,
        salaryType: employee.salaryType || 'hourly',
        salaryAmount: employee.salaryAmount || 0,
        weeklyWorkHours: employee.weeklyWorkHours || 40,
        includeHolidayAllowance: employee.includesWeeklyHolidayInWage
      };

      // 스케줄 데이터 처리 (월급직의 경우 빈 배열)
      const scheduleData = weeklySchedules.length > 0 ? 
        await Promise.all(weeklySchedules.map(async (schedule) => {
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

      console.log('🔥 PayrollCalculator 입력 데이터:', { 
        employeeData: {
          ...employeeData,
          salaryAmount: employeeData.salaryAmount,
          probationStartDate: employeeData.probationStartDate,
          probationEndDate: employeeData.probationEndDate
        }, 
        contractData: {
          ...contractData,
          salaryAmount: contractData.salaryAmount
        }, 
        scheduleData: scheduleData.length,
        scheduleDataWithBranchNames: scheduleData.map(s => ({ branchId: s.branchId, branchName: s.branchName }))
      });

      // PayrollCalculator로 계산
      const calculator = new PayrollCalculator(employeeData, contractData, scheduleData);
      const result = calculator.calculate();
      console.log('🔥 PayrollCalculator 계산 결과:', result);
      console.log('🔥 branches 정보:', result.branches);

      // 🔥 보존된 공제 데이터가 있으면 적용
      if (Object.keys(preservedDeductions).length > 0) {
        console.log('🔥 보존된 공제 데이터 적용:', preservedDeductions);
        setEditableDeductions(preservedDeductions);
        
        // 계산 결과의 공제 부분을 보존된 값으로 업데이트
        if (result.deductions && result.deductions.editableDeductions) {
          result.deductions.editableDeductions = preservedDeductions as {
            nationalPension: number;
            healthInsurance: number;
            longTermCare: number;
            employmentInsurance: number;
            incomeTax: number;
            localIncomeTax: number;
          };
          
          // 총 공제액 재계산
          const totalDeductions = Object.values(preservedDeductions).reduce((sum: number, val: unknown) => sum + ((val as number) || 0), 0);
          result.deductions.total = totalDeductions;
          result.netPay = result.grossPay - totalDeductions;
        }
      }

      setPayrollResults([result]);
      console.log('🔥 setPayrollResults 호출됨, 결과 개수:', [result].length);
    } catch (error) {
      console.error('급여 계산 실패:', error);
      alert('급여 계산 중 오류가 발생했습니다.');
      setPayrollResults([]);
    }
  }, [employees, selectedEmployeeId, weeklySchedules, loadExistingPayroll, isPayrollConfirmed, selectedMonth]);

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
      // 1. confirmedPayrolls에 급여 확정 데이터 추가
      const confirmedPayrollData = {
        month: selectedMonth,
        employeeId: selectedEmployeeId,
        employeeName: payrollResults[0].employeeName,
        calculations: payrollResults,
        confirmedAt: new Date(),
        confirmedBy: 'admin'
      };
      
      await addDoc(collection(db, 'confirmedPayrolls'), confirmedPayrollData);
      
      // 2. 해당 직원의 모든 지점 상태를 "급여확정완료"로 업데이트
      const employee = employees.find(emp => emp.id === selectedEmployeeId);
      if (employee && employee.branches) {
        const batch = [];
        
        for (const branchId of employee.branches) {
          // 기존 상태 문서 찾기
          const statusQuery = query(
            collection(db, 'employeeReviewStatus'),
            where('employeeId', '==', selectedEmployeeId),
            where('month', '==', selectedMonth),
            where('branchId', '==', branchId)
          );
          const statusSnapshot = await getDocs(statusQuery);
          
          if (statusSnapshot.docs.length > 0) {
            // 기존 문서 업데이트
            const statusDoc = statusSnapshot.docs[0];
            batch.push(updateDoc(doc(db, 'employeeReviewStatus', statusDoc.id), {
              status: '급여확정완료',
              updatedAt: new Date()
            }));
          } else {
            // 새 문서 생성
            batch.push(addDoc(collection(db, 'employeeReviewStatus'), {
              employeeId: selectedEmployeeId,
              employeeName: employee.name,
              month: selectedMonth,
              branchId: branchId,
              status: '급여확정완료',
              createdAt: new Date(),
              updatedAt: new Date()
            }));
          }
        }
        
        // 모든 업데이트를 배치로 실행
        await Promise.all(batch);
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
      alert('급여 확정에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, payrollResults, employees, onPayrollStatusChange]);

  // 급여 저장 (confirmedAt = null)
  const handleSavePayroll = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId || payrollResults.length === 0) return;
    
    try {
      // 1. confirmedPayrolls에서 해당 문서 찾기
      const payrollQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      const payrollData = {
        month: selectedMonth,
        employeeId: selectedEmployeeId,
        employeeName: payrollResults[0].employeeName,
        calculations: payrollResults,
        editableDeductions: editableDeductions,
        confirmedAt: null, // 미확정 상태
        savedAt: new Date(),
        savedBy: 'admin'
      };
      
      if (payrollSnapshot.docs.length > 0) {
        // 기존 문서 업데이트
        const docRef = payrollSnapshot.docs[0];
        await updateDoc(doc(db, 'confirmedPayrolls', docRef.id), payrollData);
      } else {
        // 새 문서 생성
        await addDoc(collection(db, 'confirmedPayrolls'), payrollData);
      }
      
      alert('급여 정보가 저장되었습니다.');
    } catch (error) {
      console.error('급여 저장 실패:', error);
      alert('급여 저장에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, payrollResults, editableDeductions]);

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
      
      // 2. 해당 직원의 모든 지점 상태를 "검토완료"로 되돌리기
      const employee = employees.find(emp => emp.id === selectedEmployeeId);
      if (employee && employee.branches) {
        const batch = [];
        
        for (const branchId of employee.branches) {
          // 기존 상태 문서 찾기
          const statusQuery = query(
            collection(db, 'employeeReviewStatus'),
            where('employeeId', '==', selectedEmployeeId),
            where('month', '==', selectedMonth),
            where('branchId', '==', branchId)
          );
          const statusSnapshot = await getDocs(statusQuery);
          
          if (statusSnapshot.docs.length > 0) {
            // 기존 문서 업데이트
            const statusDoc = statusSnapshot.docs[0];
            batch.push(updateDoc(doc(db, 'employeeReviewStatus', statusDoc.id), {
              status: '근무시간검토완료',
              updatedAt: new Date()
            }));
          }
        }
        
        // 모든 업데이트를 배치로 실행
        await Promise.all(batch);
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
      {payrollResults.map((calc, index) => (
        <div key={index} className="bg-white rounded-lg shadow p-6">
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
          {(calc.probationHours || 0) > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">수습기간 적용</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
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
          )}

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
              <p className="text-2xl font-bold text-green-900">{calc.grossPay.toLocaleString()}원</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-medium text-purple-800 text-sm">실수령액</h4>
              <p className="text-2xl font-bold text-purple-900">{calc.netPay.toLocaleString()}원</p>
            </div>
          </div>
          
          {/* 급여 상세 테이블 */}
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">기본급</th>
                      {(calc.salaryType === 'hourly' || calc.salaryType === '시급') && (
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">주휴수당</th>
                      )}
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">총 공제액</th>
                      <th className="px-4 py-2 text-sm font-bold text-blue-700 bg-blue-50">실수령액</th>
                    </tr>
                  </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {(calc.salaryType === 'hourly' || calc.salaryType === '시급')
                      ? (calc.grossPay - (calc.weeklyHolidayPay || 0)).toLocaleString() + '원'
                      : calc.grossPay.toLocaleString() + '원'
                    }
                  </td>
                  {(calc.salaryType === 'hourly' || calc.salaryType === '시급') && (
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {calc.weeklyHolidayPay ? calc.weeklyHolidayPay.toLocaleString() + '원' : '-'}
                    </td>
                  )}
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {calc.employmentType === '근로소득' && calc.deductions.insuranceDetails ? (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span>국민연금:</span>
                          <input
                            type="number"
                            value={editableDeductions.nationalPension ?? calc.deductions.insuranceDetails.nationalPension}
                            onChange={(e) => setEditableDeductions(prev => ({...prev, nationalPension: parseInt(e.target.value) || 0}))}
                            className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span>건강보험:</span>
                          <input
                            type="number"
                            value={editableDeductions.healthInsurance ?? calc.deductions.insuranceDetails.healthInsurance}
                            onChange={(e) => setEditableDeductions(prev => ({...prev, healthInsurance: parseInt(e.target.value) || 0}))}
                            className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span>장기요양:</span>
                          <input
                            type="number"
                            value={editableDeductions.longTermCare ?? calc.deductions.insuranceDetails.longTermCare}
                            onChange={(e) => setEditableDeductions(prev => ({...prev, longTermCare: parseInt(e.target.value) || 0}))}
                            className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span>고용보험:</span>
                          <input
                            type="number"
                            value={editableDeductions.employmentInsurance ?? calc.deductions.insuranceDetails.employmentInsurance}
                            onChange={(e) => setEditableDeductions(prev => ({...prev, employmentInsurance: parseInt(e.target.value) || 0}))}
                            className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                          />
                        </div>
                        {/* 소득세 표시 */}
                        {calc.deductions.taxDetails && (
                          <>
                            <div className="flex justify-between items-center pt-1">
                              <span>소득세:</span>
                              <input
                                type="number"
                                value={editableDeductions.incomeTax ?? calc.deductions.taxDetails.incomeTax}
                                onChange={(e) => setEditableDeductions(prev => ({...prev, incomeTax: parseInt(e.target.value) || 0}))}
                                className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span>지방소득세:</span>
                              <input
                                type="number"
                                value={editableDeductions.localIncomeTax ?? calc.deductions.taxDetails.localIncomeTax}
                                onChange={(e) => setEditableDeductions(prev => ({...prev, localIncomeTax: parseInt(e.target.value) || 0}))}
                                className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right"
                              />
                            </div>
                            <div className="flex justify-between pt-1 border-t font-bold text-red-600">
                              <span>총 공제액:</span>
                              <span>{(Object.values(editableDeductions).reduce((sum, val) => sum + (val || 0), 0) || calc.deductions.total).toLocaleString()}원</span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : calc.employmentType === '근로소득' ? (
                      calc.deductions.insurance > 0 ? calc.deductions.insurance.toLocaleString() + '원' : '-'
                    ) : (
                      calc.deductions.tax > 0 ? calc.deductions.tax.toLocaleString() + '원' : '-'
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm font-bold text-blue-700 bg-blue-50">{calc.netPay.toLocaleString()}원</td>
                </tr>
              </tbody>
            </table>
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
                    {detail.weekStart} ~ {detail.weekEnd}: {detail.hours.toFixed(1)}시간, {detail.pay.toLocaleString()}원 ({detail.eligible ? '지급' : `미지급 - ${detail.reason}`})
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
          
          {/* 저장 및 급여 확정 버튼 */}
          <div className="flex justify-end space-x-4">
            <button
              onClick={handleSavePayroll}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              저장
            </button>
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
      ))}
    </div>
  );
};

export default PayrollCalculation;
