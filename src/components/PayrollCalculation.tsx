// 급여 계산 컴포넌트 - PayrollCalculator 클래스 사용
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { PayrollCalculator, PayrollResult } from '@/utils/PayrollCalculator';

interface Branch {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  employmentType: string;
  salaryType?: string;
  hourlyWage?: number;
  monthlySalary?: number;
  probationStartDate?: Date;
  probationEndDate?: Date;
  includesWeeklyHolidayInWage?: boolean;
  weeklyWorkHours?: number;
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
  selectedBranchId?: string;
  employees: Employee[];
  branches: Branch[];
  onPayrollStatusChange?: () => void;
}

const PayrollCalculation: React.FC<PayrollCalculationProps> = ({
  selectedMonth,
  selectedEmployeeId,
  selectedBranchId,
  employees,
  branches,
  onPayrollStatusChange
}) => {
  const [loading, setLoading] = useState(false);
  const [noScheduleData, setNoScheduleData] = useState(false);
  const [payrollResults, setPayrollResults] = useState<PayrollResult[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<Schedule[]>([]);
  const [memo, setMemo] = useState('');
  const [isPayrollConfirmed, setIsPayrollConfirmed] = useState(false);

  // 스케줄 데이터 로드
  const loadSchedules = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) {
      console.log('🔥 loadSchedules 조건 불충족:', { selectedMonth, selectedEmployeeId });
      return;
    }

    console.log('🔥 loadSchedules 시작:', { selectedMonth, selectedEmployeeId });
    setLoading(true);
    try {
      const schedulesQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const schedulesSnapshot = await getDocs(schedulesQuery);
      console.log('🔥 workTimeComparisonResults 조회 결과:', schedulesSnapshot.docs.length, '건');
      
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

  // 급여 계산
  const calculatePayroll = useCallback(async () => {
    if (!employees.length || !selectedEmployeeId || !weeklySchedules.length) {
      setNoScheduleData(weeklySchedules.length === 0);
      setPayrollResults([]);
      return;
    }
    
    setNoScheduleData(false);

    // 선택된 직원 찾기
    const employee = employees.find(emp => emp.id === selectedEmployeeId);
    if (!employee) return;

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

      const scheduleData = weeklySchedules.map(schedule => ({
        date: schedule.date,
        actualWorkHours: schedule.actualWorkHours,
        branchId: schedule.branchId,
        branchName: schedule.branchName
      }));

      // PayrollCalculator로 계산
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
        scheduleData: scheduleData.length 
      });
      const calculator = new PayrollCalculator(employeeData, contractData, scheduleData);
      const result = calculator.calculate();
      console.log('🔥 PayrollCalculator 계산 결과:', result);

      setPayrollResults([result]);
      console.log('🔥 setPayrollResults 호출됨, 결과 개수:', [result].length);
    } catch (error) {
      console.error('급여 계산 실패:', error);
      alert('급여 계산 중 오류가 발생했습니다.');
      setPayrollResults([]);
    }
  }, [employees, selectedEmployeeId, weeklySchedules]);

  // 메모 로드
  const loadMemo = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    try {
      const memosQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const memosSnapshot = await getDocs(memosQuery);
      if (!memosSnapshot.empty) {
        const memoData = memosSnapshot.docs[0].data();
        setMemo(memoData.memo || '');
      } else {
        setMemo('');
      }
    } catch (error) {
      console.error('메모 로드 실패:', error);
      setMemo('');
    }
  }, [selectedMonth, selectedEmployeeId]);

  // 메모 저장
  const saveMemo = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    try {
      const existingMemoQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth),
        where('employeeId', '==', selectedEmployeeId)
      );
      
      const existingMemoSnapshot = await getDocs(existingMemoQuery);
      
      if (!existingMemoSnapshot.empty) {
        const memoDoc = existingMemoSnapshot.docs[0];
        await updateDoc(doc(db, 'employeeMemos', memoDoc.id), {
          memo: memo,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, 'employeeMemos'), {
          month: selectedMonth,
          employeeId: selectedEmployeeId,
          memo: memo,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      alert('메모가 저장되었습니다.');
    } catch (error) {
      console.error('메모 저장 실패:', error);
      alert('메모 저장에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, memo]);

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
      setIsPayrollConfirmed(payrollSnapshot.docs.length > 0);
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
      
      alert('급여가 확정되었습니다.');
      
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
      }
    } catch (error) {
      console.error('급여 확정 실패:', error);
      alert('급여 확정에 실패했습니다.');
    }
  }, [selectedMonth, selectedEmployeeId, payrollResults, employees, onPayrollStatusChange]);

  // 급여 확정 취소
  const handleCancelPayroll = useCallback(async () => {
    if (!selectedMonth || !selectedEmployeeId) return;
    
    if (!confirm('급여 확정을 취소하시겠습니까?')) {
      return;
    }
    
    try {
      // 1. confirmedPayrolls에서 해당 문서 삭제
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
              status: '검토완료',
              updatedAt: new Date()
            }));
          }
        }
        
        // 모든 업데이트를 배치로 실행
        await Promise.all(batch);
      }
      
      // 3. 급여확정 상태 업데이트
      setIsPayrollConfirmed(false);
      
      alert('급여 확정이 취소되었습니다.');
      
      if (onPayrollStatusChange) {
        onPayrollStatusChange();
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
    if (weeklySchedules.length > 0) {
      calculatePayroll();
    }
  }, [calculatePayroll, weeklySchedules]);

  useEffect(() => {
    loadMemo();
  }, [loadMemo]);

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
          <h3 className="text-lg font-semibold mb-4">{calc.employeeName} 급여 계산</h3>
          
          {/* 수습기간 정보 */}
          {calc.probationHours > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">수습기간 적용</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-yellow-700">수습시간:</span>
                  <span className="ml-2 font-medium text-yellow-900">{calc.probationHours.toFixed(1)}시간</span>
                </div>
                <div>
                  <span className="text-yellow-700">수습급여:</span>
                  <span className="ml-2 font-medium text-yellow-900">{calc.probationPay.toLocaleString()}원 (90%)</span>
                </div>
                <div>
                  <span className="text-yellow-700">정규시간:</span>
                  <span className="ml-2 font-medium text-yellow-900">{calc.regularHours.toFixed(1)}시간</span>
                </div>
                <div>
                  <span className="text-yellow-700">정규급여:</span>
                  <span className="ml-2 font-medium text-yellow-900">{calc.regularPay.toLocaleString()}원 (100%)</span>
                </div>
              </div>
            </div>
          )}

          {/* 근무시간 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 text-sm">실 근무시간</h4>
              <p className="text-2xl font-bold text-blue-900">{calc.actualWorkHours.toFixed(1)}h</p>
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    {calc.employmentType === '근로소득' ? '4대보험' : '사업소득공제'}
                  </th>
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
                        <div className="flex justify-between">
                          <span>국민연금:</span>
                          <span>{calc.deductions.insuranceDetails.nationalPension.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span>건강보험:</span>
                          <span>{calc.deductions.insuranceDetails.healthInsurance.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span>장기요양:</span>
                          <span>{calc.deductions.insuranceDetails.longTermCare.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span>고용보험:</span>
                          <span>{calc.deductions.insuranceDetails.employmentInsurance.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t font-medium">
                          <span>합계:</span>
                          <span>{calc.deductions.insurance.toLocaleString()}원</span>
                        </div>
                      </div>
                    ) : calc.employmentType === '근로소득' ? (
                      calc.deductions.insurance > 0 ? calc.deductions.insurance.toLocaleString() + '원' : '-'
                    ) : (
                      calc.deductions.tax > 0 ? calc.deductions.tax.toLocaleString() + '원' : '-'
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-red-600">{calc.deductions.total.toLocaleString()}원</td>
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

          {/* 메모 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="메모를 입력하세요..."
            />
            <button
              onClick={saveMemo}
              className="mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              메모 저장
            </button>
          </div>
          
          {/* 급여 확정 버튼 */}
          {!isPayrollConfirmed ? (
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleConfirmPayroll}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                급여 확정
              </button>
            </div>
          ) : (
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleCancelPayroll}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                급여 확정 취소
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PayrollCalculation;
