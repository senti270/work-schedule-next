'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Employee {
  id: string;
  name: string;
  residentNumber?: string;
  email?: string;
  bankName?: string;
  accountNumber?: string;
  employmentType?: string;
  hireDate?: any;
  resignationDate?: any;
}

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  confirmedAt: Date;
  confirmedBy: string;
  employmentType?: string;
  calculations: Array<{
    branchId: string;
    branchName: string;
    grossPay: number;
    deductions: number;
    netPay: number;
    workHours: number;
  }>;
  // 계산된 총합 (모든 지점 합계)
  totalGrossPay?: number;
  totalDeductions?: number;
  totalNetPay?: number;
  totalWorkHours?: number;
}

interface WorkTimeComparisonResult {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string;
  weeklySchedules: Array<{
    weekStart: string;
    weekEnd: string;
    workDays: Array<{
      date: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      breakTime: number;
      workHours: number;
      notes?: string;
    }>;
  }>;
  actualWorkRecords: Array<{
    date: string;
    startTime: string;
    endTime: string;
    breakTime: number;
    workHours: number;
    notes?: string;
  }>;
  comparisonResults: Array<{
    date: string;
    dayOfWeek: string;
    scheduleStartTime: string;
    scheduleEndTime: string;
    scheduleBreakTime: number;
    scheduleWorkHours: number;
    actualStartTime: string;
    actualEndTime: string;
    actualBreakTime: number;
    actualWorkHours: number;
    timeDifference: number;
    status: '정상' | '지각' | '조기퇴근' | '초과근무';
    notes?: string;
  }>;
  totalScheduleHours: number;
  totalActualHours: number;
  totalDifference: number;
  createdAt: Date;
}

const PayrollStatement: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [confirmedPayrolls, setConfirmedPayrolls] = useState<ConfirmedPayroll[]>([]);
  const [workTimeComparisons, setWorkTimeComparisons] = useState<WorkTimeComparisonResult[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filterWithWorkHistory, setFilterWithWorkHistory] = useState(false);
  const [filterWithConfirmedPayroll, setFilterWithConfirmedPayroll] = useState(false);
  const [employeeMemos, setEmployeeMemos] = useState<Array<{id: string, employeeId: string, month: string, type: string, memo: string, createdAt: Date}>>([]);

  // 월 문자열 표준화: 'YYYY-M' -> 'YYYY-MM'
  const normalizeMonth = (value: string) => {
    if (!value) return value;
    const match = String(value).match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      return `${year}-${month}`;
    }
    return value;
  };

  // 현재 월 설정
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  // 직원 목록 로드
  const loadEmployees = async () => {
    console.log('🔥 loadEmployees 호출됨, selectedMonth:', selectedMonth);
    if (!selectedMonth) {
      console.log('🔥 selectedMonth가 없어서 리턴');
      return;
    }
    
    try {
      // 선택된 월의 시작일과 끝일 계산
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      
      console.log('🔥 월 범위:', { monthStart, monthEnd });
      
      const employeesQuery = query(
        collection(db, 'employees'),
        orderBy('name', 'asc')
      );
      console.log('🔥 Firestore 쿼리 실행 중...');
      const employeesSnapshot = await getDocs(employeesQuery);
      console.log('🔥 Firestore 쿼리 완료, 문서 수:', employeesSnapshot.docs.length);
      
      const employeesData = employeesSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Employee))
        .filter(employee => {
          // 입사일과 퇴사일 확인
          const hireDate = employee.hireDate?.toDate ? employee.hireDate.toDate() : 
                          employee.hireDate ? new Date(employee.hireDate) : null;
          const resignationDate = employee.resignationDate?.toDate ? employee.resignationDate.toDate() : 
                                 employee.resignationDate ? new Date(employee.resignationDate) : null;
          
          // 나인 직원 디버깅
          if (employee.name === '나인') {
            console.log('나인 직원 데이터:', {
              name: employee.name,
              hireDate,
              resignationDate,
              monthStart: monthStart.toISOString(),
              monthEnd: monthEnd.toISOString(),
              hireDateAfterMonthEnd: hireDate && hireDate > monthEnd,
              resignationDateBeforeMonthStart: resignationDate && resignationDate < monthStart,
              hireDateString: hireDate ? hireDate.toISOString() : 'null',
              resignationDateString: resignationDate ? resignationDate.toISOString() : 'null'
            });
          }
          
          // 입사일이 없으면 제외
          if (!hireDate) {
            if (employee.name === '나인') console.log('나인: 입사일 없음');
            return false;
          }
          
          // 입사일이 해당월 이후면 제외
          if (hireDate > monthEnd) {
            if (employee.name === '나인') console.log('나인: 입사일이 해당월 이후');
            return false;
          }
          
          // 퇴사일이 있고, 퇴사일이 해당월 이전이면 제외
          if (resignationDate && resignationDate < monthStart) {
            if (employee.name === '나인') console.log('나인: 퇴사일이 해당월 이전');
            return false;
          }
          
          if (employee.name === '나인') console.log('나인: 필터 통과');
          return true;
        }) as Employee[];
      
      console.log('🔥 필터링된 직원 수:', employeesData.length);
      console.log('🔥 필터링된 직원 목록:', employeesData.map(emp => emp.name));
      setEmployees(employeesData);
    } catch (error) {
      console.error('🔥 직원 목록 로드 실패:', error);
    }
  };

  // 급여 확정 데이터 로드
  const loadConfirmedPayrolls = async () => {
    if (!selectedMonth) return;
    
    try {
      setLoading(true);
      console.log('🔥 급여 확정 데이터 로드 시작:', selectedMonth);
      
      // 인덱스 없이 작동하도록 orderBy 제거
      const payrollsQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('month', '==', selectedMonth)
      );
      const payrollsSnapshot = await getDocs(payrollsQuery);
      const payrollsData = payrollsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ConfirmedPayroll[];
      
      console.log('🔥 급여 확정 데이터 로드 결과:', {
        month: selectedMonth,
        count: payrollsData.length,
        data: payrollsData
      });
      
      // 각 직원의 모든 지점 데이터를 합산하여 총합 계산
      const processedPayrollsData = payrollsData.map(payroll => {
        // calculations 배열이 존재하는지 확인
        const calculations = payroll.calculations || [];
        
        const totalGrossPay = calculations.reduce((sum, calc) => sum + (calc.grossPay || 0), 0);
        const totalDeductions = calculations.reduce((sum, calc) => sum + (calc.deductions || 0), 0);
        const totalNetPay = calculations.reduce((sum, calc) => sum + (calc.netPay || 0), 0);
        const totalWorkHours = calculations.reduce((sum, calc) => sum + (calc.workHours || 0), 0);
        
        return {
          ...payroll,
          totalGrossPay,
          totalDeductions,
          totalNetPay,
          totalWorkHours
        };
      });
      
      console.log('🔥 처리된 급여 데이터:', processedPayrollsData);
      
      // 클라이언트 사이드에서 정렬
      processedPayrollsData.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      setConfirmedPayrolls(processedPayrollsData);
    } catch (error) {
      console.error('급여 확정 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 직원 메모 로드
  const loadEmployeeMemos = async () => {
    try {
      const memosSnapshot = await getDocs(collection(db, 'employeeMemos'));
      const memosData = memosSnapshot.docs.map(doc => ({
        id: doc.id,
        employeeId: doc.data().employeeId,
        month: doc.data().month,
        type: doc.data().type,
        memo: doc.data().memo || '',
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : (doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date())
      })) as Array<{id: string, employeeId: string, month: string, type: string, memo: string, createdAt: Date}>;
      
      console.log('🔥 직원 메모 로드:', memosData.length, '개');
      setEmployeeMemos(memosData);
    } catch (error) {
      console.error('직원 메모 로드 실패:', error);
    }
  };

  // 근무시간 비교 데이터 로드
  const loadWorkTimeComparisons = async () => {
    if (!selectedMonth) return;
    
    try {
      console.log('🔥 근무시간 비교 데이터 로드 시작:', selectedMonth);
      
      // 전체 데이터를 가져와서 클라이언트에서 필터링
      const comparisonsSnapshot = await getDocs(collection(db, 'workTimeComparisonResults'));
      console.log('🔥 전체 workTimeComparisonResults 문서 수:', comparisonsSnapshot.docs.length);
      
      const allComparisonsData = comparisonsSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('🔥 문서 데이터:', { id: doc.id, month: data.month, employeeName: data.employeeName });
        return {
          id: doc.id,
          ...data
        };
      }) as WorkTimeComparisonResult[];
      
      // 클라이언트에서 월별 필터링 (형식 표준화)
      const filteredData = allComparisonsData.filter(item => normalizeMonth(item.month) === selectedMonth);
      
      console.log('🔥 필터링된 근무시간 비교 데이터:', {
        month: selectedMonth,
        totalCount: allComparisonsData.length,
        filteredCount: filteredData.length,
        filteredData: filteredData
      });
      
      // 클라이언트 사이드에서 정렬
      filteredData.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      setWorkTimeComparisons(filteredData);
    } catch (error) {
      console.error('근무시간 비교 데이터 로드 실패:', error);
    }
  };

  useEffect(() => {
    loadEmployeeMemos();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadEmployees();
      loadConfirmedPayrolls();
      loadWorkTimeComparisons();
    }
  }, [selectedMonth]);

  // 선택된 직원의 급여 데이터 찾기
  const selectedPayroll = confirmedPayrolls.find(p => p.employeeId === selectedEmployee);
  const selectedEmployeeInfo = employees.find(e => e.id === selectedEmployee);
  const employmentType = (selectedPayroll as any)?.employmentType || (selectedEmployeeInfo as any)?.employmentType || '';
  
  // 근무내역 찾기 (employeeId 우선, 없으면 employeeName으로)
  const selectedWorkTimeComparison = workTimeComparisons.find(w => 
    w.employeeId === selectedEmployee || 
    (selectedEmployeeInfo && w.employeeName === selectedEmployeeInfo.name)
  );

  // 근무내역 매칭 디버깅
  if (selectedEmployee && selectedEmployeeInfo) {
    console.log('🔍 근무내역 매칭 디버깅:', {
      selectedEmployee,
      selectedEmployeeName: selectedEmployeeInfo.name,
      workTimeComparisonsCount: workTimeComparisons.length,
      allWorkTimeComparisons: workTimeComparisons.map(w => ({
        id: w.id,
        employeeId: w.employeeId,
        employeeName: w.employeeName,
        month: w.month,
        normalizedMonth: normalizeMonth(w.month)
      })),
      selectedWorkTimeComparison: selectedWorkTimeComparison ? 'FOUND' : 'NOT_FOUND',
      selectedMonth,
      normalizedSelectedMonth: normalizeMonth(selectedMonth)
    });
    
    // 선택된 근무내역 데이터 구조 상세 분석
    if (selectedWorkTimeComparison) {
      console.log('🔍 selectedWorkTimeComparison 상세 구조:', {
        id: selectedWorkTimeComparison.id,
        employeeId: selectedWorkTimeComparison.employeeId,
        employeeName: selectedWorkTimeComparison.employeeName,
        month: selectedWorkTimeComparison.month,
        branchName: selectedWorkTimeComparison.branchName,
        totalScheduleHours: selectedWorkTimeComparison.totalScheduleHours,
        totalActualHours: selectedWorkTimeComparison.totalActualHours,
        totalDifference: selectedWorkTimeComparison.totalDifference,
        hasComparisonResults: !!selectedWorkTimeComparison.comparisonResults,
        comparisonResultsLength: selectedWorkTimeComparison.comparisonResults?.length || 0,
        allKeys: Object.keys(selectedWorkTimeComparison),
        sampleData: selectedWorkTimeComparison
      });
    }
  }

  // 데이터 찾기 디버깅
  if (selectedEmployee) {
    console.log('🔍 데이터 찾기 디버깅:', {
      selectedEmployee,
      confirmedPayrollsCount: confirmedPayrolls.length,
      workTimeComparisonsCount: workTimeComparisons.length,
      selectedPayroll: selectedPayroll ? 'FOUND' : 'NOT_FOUND',
      selectedWorkTimeComparison: selectedWorkTimeComparison ? 'FOUND' : 'NOT_FOUND',
      selectedEmployeeInfo: selectedEmployeeInfo ? 'FOUND' : 'NOT_FOUND',
      workTimeComparisonsData: workTimeComparisons.map(w => ({
        employeeId: w.employeeId,
        employeeName: w.employeeName,
        month: w.month,
        totalScheduleHours: w.totalScheduleHours,
        totalActualHours: w.totalActualHours,
        comparisonResultsCount: w.comparisonResults?.length || 0
      }))
    });
    
    if (selectedWorkTimeComparison) {
      console.log('🔍 selectedWorkTimeComparison 상세:', {
        id: selectedWorkTimeComparison.id,
        employeeId: selectedWorkTimeComparison.employeeId,
        employeeName: selectedWorkTimeComparison.employeeName,
        branchName: selectedWorkTimeComparison.branchName,
        month: selectedWorkTimeComparison.month,
        totalScheduleHours: selectedWorkTimeComparison.totalScheduleHours,
        totalActualHours: selectedWorkTimeComparison.totalActualHours,
        totalDifference: selectedWorkTimeComparison.totalDifference,
        comparisonResultsLength: selectedWorkTimeComparison.comparisonResults?.length || 0,
        comparisonResults: selectedWorkTimeComparison.comparisonResults?.slice(0, 3) // 처음 3개만 로그
      });
      
      // comparisonResults가 비어있는지 확인
      if (!selectedWorkTimeComparison.comparisonResults || selectedWorkTimeComparison.comparisonResults.length === 0) {
        console.log('⚠️ comparisonResults가 비어있습니다!');
        console.log('전체 데이터 구조:', selectedWorkTimeComparison);
      } else {
        console.log('✅ comparisonResults 데이터 있음:', selectedWorkTimeComparison.comparisonResults.length, '개');
      }
    }
  }

  // 필터링된 직원 목록 계산
  const filteredEmployees = employees.filter(employee => {
    if (filterWithWorkHistory) {
      const hasWorkHistory = workTimeComparisons.some(comparison => comparison.employeeId === employee.id);
      if (!hasWorkHistory) return false;
    }
    
    if (filterWithConfirmedPayroll) {
      const hasConfirmedPayroll = confirmedPayrolls.some(payroll => payroll.employeeId === employee.id);
      if (!hasConfirmedPayroll) return false;
    }
    
    return true;
  });

  // 필터링이 변경될 때 선택된 직원이 필터링된 목록에 없으면 선택 해제
  useEffect(() => {
    if (selectedEmployee && !filteredEmployees.some(emp => emp.id === selectedEmployee)) {
      setSelectedEmployee('');
    }
  }, [filteredEmployees, selectedEmployee]);

  // 디버깅을 위한 로그
  console.log('🔍 급여명세서 디버깅:', {
    selectedEmployee,
    selectedPayroll,
    selectedEmployeeInfo,
    confirmedPayrolls: confirmedPayrolls.length,
    workTimeComparisons: workTimeComparisons.length,
    employees: employees.length,
    filteredEmployees: filteredEmployees.length,
    filterWithWorkHistory,
    filterWithConfirmedPayroll
  });

  // 김유정 데이터 특별 디버깅
  if (selectedEmployee && selectedEmployeeInfo?.name === '김유정') {
    console.log('🔥 김유정 특별 디버깅:', {
      selectedEmployee,
      selectedEmployeeInfo,
      selectedPayroll,
      selectedWorkTimeComparison,
      confirmedPayrollsForKim: confirmedPayrolls.filter(p => p.employeeId === selectedEmployee),
      workTimeComparisonsForKim: workTimeComparisons.filter(w => w.employeeId === selectedEmployee),
      selectedMonth
    });
  }

  // PDF 다운로드
  const handleDownloadPDF = async () => {
    if (!selectedPayroll || !selectedEmployeeInfo) {
      alert('직원과 급여 데이터를 선택해주세요.');
      return;
    }

    try {
      console.log('PDF 생성 시작...');
      const element = document.getElementById('payroll-statement-content');
      if (!element) {
        console.error('payroll-statement-content 요소를 찾을 수 없습니다.');
        alert('PDF 생성 대상 요소를 찾을 수 없습니다.');
        return;
      }

      console.log('jsPDF + html2canvas 실행 중...');
      
         // HTML을 캔버스로 변환
         const canvas = await html2canvas(element, {
           scale: 1,
           useCORS: true,
           allowTaint: true,
           backgroundColor: '#ffffff',
           logging: false,
           ignoreElements: (element) => {
             // 문제가 되는 요소들을 무시
             return element.classList.contains('problematic-element');
           },
           onclone: (clonedDoc) => {
             // 모든 스타일을 강제로 RGB로 변환 (lab() 색상 함수 제거)
             const style = clonedDoc.createElement('style');
             style.textContent = `
               *, *::before, *::after {
                 color: #000000 !important;
                 background-color: #ffffff !important;
                 border-color: #d1d5db !important;
                 background-image: none !important;
                 box-shadow: none !important;
               }
               .bg-gray-50, [class*="bg-gray-50"] { background-color: #f9fafb !important; }
               .bg-gray-100, [class*="bg-gray-100"] { background-color: #f3f4f6 !important; }
               .bg-gray-200, [class*="bg-gray-200"] { background-color: #e5e7eb !important; }
               .text-gray-600, [class*="text-gray-600"] { color: #4b5563 !important; }
               .text-gray-700, [class*="text-gray-700"] { color: #374151 !important; }
               .text-gray-800, [class*="text-gray-800"] { color: #1f2937 !important; }
               .text-gray-900, [class*="text-gray-900"] { color: #111827 !important; }
               .text-blue-600, [class*="text-blue-600"] { color: #2563eb !important; }
               .text-red-600, [class*="text-red-600"] { color: #dc2626 !important; }
               .border-gray-200, [class*="border-gray-200"] { border-color: #e5e7eb !important; }
               .border-gray-300, [class*="border-gray-300"] { border-color: #d1d5db !important; }
               .border-gray-400, [class*="border-gray-400"] { border-color: #9ca3af !important; }
               table { border-collapse: collapse !important; }
               td, th { border: 1px solid #d1d5db !important; }
             `;
             clonedDoc.head.insertBefore(style, clonedDoc.head.firstChild);
             
             // 모든 요소의 인라인 스타일도 강제로 RGB로 변환
             const allElements = clonedDoc.querySelectorAll('*');
             (allElements as NodeListOf<HTMLElement>).forEach(el => {
               if (el.style) {
                 el.style.color = '#000000';
                 el.style.backgroundColor = '#ffffff';
                 el.style.borderColor = '#d1d5db';
               }
             });
           }
         });

      console.log('Canvas 생성 완료:', canvas.width, 'x', canvas.height);
      const imgData = canvas.toDataURL('image/png');
      console.log('이미지 데이터 생성 완료, 길이:', imgData.length);

      // PDF 생성
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      console.log('이미지 크기:', imgWidth, 'x', imgHeight);
      console.log('페이지 높이:', pageHeight);

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      console.log('PDF 저장 중...');
      pdf.save(`급여명세서_${selectedEmployeeInfo.name}_${selectedMonth}.pdf`);
      console.log('PDF 생성 완료!');
    } catch (err) {
      console.error('PDF 생성 실패 상세:', err);
      const e = err as unknown as { message?: string; stack?: string };
      if (e?.stack) {
        console.error('에러 스택:', e.stack);
      }
      alert(`PDF 생성에 실패했습니다: ${e?.message || String(err)}`);
    }
  };

  // 공유 링크 생성
  const handleShareLink = async () => {
    if (!selectedPayroll || !selectedEmployeeInfo) {
      alert('직원과 급여 데이터를 선택해주세요.');
      return;
    }

    try {
      // 공유용 데이터 생성
      const shareData = {
        employeeName: selectedEmployeeInfo.name,
        month: selectedMonth,
        grossPay: selectedPayroll?.totalGrossPay || 0,
        deductions: selectedPayroll?.totalDeductions || 0,
        netPay: selectedPayroll?.totalNetPay || 0,
        branchName: selectedPayroll?.calculations?.[0]?.branchName || '-',
        confirmedAt: selectedPayroll?.confirmedAt
      };

      // 공유 링크 생성 (실제로는 서버에서 처리해야 함)
      const shareUrl = `${window.location.origin}/payroll-share/${btoa(JSON.stringify(shareData))}`;
      
      // 클립보드에 복사
      await navigator.clipboard.writeText(shareUrl);
      alert('공유 링크가 클립보드에 복사되었습니다.');
    } catch (error) {
      console.error('공유 링크 생성 실패:', error);
      alert('공유 링크 생성에 실패했습니다.');
    }
  };

  // 이메일 공유 (서버 발송)
  const handleEmailShare = async () => {
    if (!selectedPayroll || !selectedEmployeeInfo) {
      alert('직원과 급여 데이터를 선택해주세요.');
      return;
    }

    if (!selectedEmployeeInfo.email) {
      alert('직원의 이메일 주소가 등록되지 않았습니다.');
      return;
    }

    const subject = `급여명세서 - ${selectedEmployeeInfo.name} (${selectedMonth})`;
    const body = `
안녕하세요 ${selectedEmployeeInfo.name}님.

${selectedMonth} 급여명세서를 전달드립니다.

- 직원명: ${selectedEmployeeInfo.name}
- 지점: ${selectedPayroll?.calculations?.[0]?.branchName || '-'}
- 기본급: ${(selectedPayroll?.totalGrossPay || 0).toLocaleString()}원
- 공제액: ${(selectedPayroll?.totalDeductions || 0).toLocaleString()}원
- 실지급액: ${(selectedPayroll?.totalNetPay || 0).toLocaleString()}원

자세한 내용은 첨부된 PDF 파일을 확인해주세요.

감사합니다.
    `;

    try {
      const element = document.getElementById('payroll-statement-content');
      if (!element) {
        alert('PDF 생성 대상 요소를 찾을 수 없습니다.');
        return;
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // 모든 스타일을 강제로 RGB로 변환 (lab() 색상 함수 제거)
          const style = clonedDoc.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              color: #000000 !important;
              background-color: #ffffff !important;
              border-color: #d1d5db !important;
              background-image: none !important;
              box-shadow: none !important;
            }
            .bg-gray-50, [class*="bg-gray-50"] { background-color: #f9fafb !important; }
            .bg-gray-100, [class*="bg-gray-100"] { background-color: #f3f4f6 !important; }
            .bg-gray-200, [class*="bg-gray-200"] { background-color: #e5e7eb !important; }
            .text-gray-600, [class*="text-gray-600"] { color: #4b5563 !important; }
            .text-gray-700, [class*="text-gray-700"] { color: #374151 !important; }
            .text-gray-800, [class*="text-gray-800"] { color: #1f2937 !important; }
            .text-gray-900, [class*="text-gray-900"] { color: #111827 !important; }
            .text-blue-600, [class*="text-blue-600"] { color: #2563eb !important; }
            .text-red-600, [class*="text-red-600"] { color: #dc2626 !important; }
            .border-gray-200, [class*="border-gray-200"] { border-color: #e5e7eb !important; }
            .border-gray-300, [class*="border-gray-300"] { border-color: #d1d5db !important; }
            .border-gray-400, [class*="border-gray-400"] { border-color: #9ca3af !important; }
            table { border-collapse: collapse !important; }
            td, th { border: 1px solid #d1d5db !important; }
          `;
          clonedDoc.head.insertBefore(style, clonedDoc.head.firstChild);
          
          // 모든 요소의 인라인 스타일도 강제로 RGB로 변환
          const allElements = clonedDoc.querySelectorAll('*');
          (allElements as NodeListOf<HTMLElement>).forEach(el => {
            if (el.style) {
              el.style.color = '#000000';
              el.style.backgroundColor = '#ffffff';
              el.style.borderColor = '#d1d5db';
            }
          });
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 295;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 295;
      }

      const pdfBlob = pdf.output('blob');
      const form = new FormData();
      form.append('to', selectedEmployeeInfo.email);
      form.append('subject', subject);
      form.append('text', body.trim());
      form.append('html', body.trim().replace(/\n/g, '<br/>'));
      form.append('file', pdfBlob, `급여명세서_${selectedEmployeeInfo.name}_${selectedMonth}.pdf`);

      const res = await fetch('/api/send-email', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || '메일 전송 실패');
      }
      alert('이메일을 전송했습니다.');
    } catch (err) {
      console.error('이메일 전송 실패:', err);
      alert('이메일 전송에 실패했습니다. 콘솔을 확인해주세요.');
    }
  };

  // 근무내역 출력
  const handlePrintWorkHistory = () => {
    if (!selectedWorkTimeComparison || !selectedEmployeeInfo) {
      alert('직원과 근무 데이터를 선택해주세요.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const workHistoryHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>근무내역 - ${selectedEmployeeInfo.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .subtitle { font-size: 16px; color: #666; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .info-table th, .info-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .info-table th { background-color: #f5f5f5; font-weight: bold; }
          .work-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .work-table th, .work-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          .work-table th { background-color: #f5f5f5; font-weight: bold; }
          .status-normal { color: #28a745; }
          .status-late { color: #dc3545; }
          .status-early { color: #ffc107; }
          .status-overtime { color: #17a2b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">근무내역</div>
          <div class="subtitle">${selectedMonth} 근무</div>
        </div>

        <table class="info-table">
          <tr>
            <th width="20%">성명</th>
            <td width="30%">${selectedEmployeeInfo.name}</td>
            <th width="20%">지점</th>
            <td width="30%">${selectedWorkTimeComparison?.branchName}</td>
          </tr>
          <tr>
            <th>총 스케줄 시간</th>
            <td>${selectedWorkTimeComparison?.totalScheduleHours.toFixed(2)}시간</td>
            <th>총 실제 근무시간</th>
            <td>${selectedWorkTimeComparison?.totalActualHours.toFixed(2)}시간</td>
          </tr>
          <tr>
            <th>시간 차이</th>
            <td>${selectedWorkTimeComparison?.totalDifference.toFixed(2)}시간</td>
            <th>출력일</th>
            <td>${new Date().toLocaleDateString()}</td>
          </tr>
        </table>

        <table class="work-table">
          <thead>
            <tr>
              <th width="12%">날짜</th>
              <th width="8%">요일</th>
              <th width="15%">스케줄 출근</th>
              <th width="15%">스케줄 퇴근</th>
              <th width="10%">스케줄 시간</th>
              <th width="15%">실제 출근</th>
              <th width="15%">실제 퇴근</th>
              <th width="10%">실제 시간</th>
            </tr>
          </thead>
          <tbody>
            ${(selectedWorkTimeComparison?.comparisonResults || []).map(result => `
              <tr>
                <td>${result.date}</td>
                <td>${result.dayOfWeek}</td>
                <td>${result.scheduleStartTime}</td>
                <td>${result.scheduleEndTime}</td>
                <td>${result.scheduleWorkHours.toFixed(2)}시간</td>
                <td>${result.actualStartTime}</td>
                <td>${result.actualEndTime}</td>
                <td>${result.actualWorkHours.toFixed(2)}시간</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(workHistoryHTML);
    printWindow.document.close();
    printWindow.print();
  };

  // 근무내역 PDF 다운로드
  const handleDownloadWorkHistoryPDF = async () => {
    if (!selectedWorkTimeComparison || !selectedEmployeeInfo) {
      alert('직원과 근무 데이터를 선택해주세요.');
      return;
    }

    try {
      const element = document.getElementById('work-history-content');
      if (!element) {
        alert('PDF 생성 대상 요소를 찾을 수 없습니다.');
        return;
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // 모든 스타일을 강제로 RGB로 변환
          const style = clonedDoc.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              color: #000000 !important;
              background-color: #ffffff !important;
              border-color: #d1d5db !important;
              background-image: none !important;
              box-shadow: none !important;
            }
            .bg-gray-50, [class*="bg-gray-50"] { background-color: #f9fafb !important; }
            .bg-gray-100, [class*="bg-gray-100"] { background-color: #f3f4f6 !important; }
            .bg-gray-200, [class*="bg-gray-200"] { background-color: #e5e7eb !important; }
            .bg-blue-50, [class*="bg-blue-50"] { background-color: #eff6ff !important; }
            .bg-blue-300, [class*="bg-blue-300"] { background-color: #93c5fd !important; }
            .bg-yellow-50, [class*="bg-yellow-50"] { background-color: #fefce8 !important; }
            .bg-yellow-300, [class*="bg-yellow-300"] { background-color: #fde047 !important; }
            .text-gray-600, [class*="text-gray-600"] { color: #4b5563 !important; }
            .text-gray-700, [class*="text-gray-700"] { color: #374151 !important; }
            .text-gray-800, [class*="text-gray-800"] { color: #1f2937 !important; }
            .text-gray-900, [class*="text-gray-900"] { color: #111827 !important; }
            .text-blue-600, [class*="text-blue-600"] { color: #2563eb !important; }
            .border-gray-200, [class*="border-gray-200"] { border-color: #e5e7eb !important; }
            .border-gray-300, [class*="border-gray-300"] { border-color: #d1d5db !important; }
            .border-gray-400, [class*="border-gray-400"] { border-color: #9ca3af !important; }
            .border-blue-300, [class*="border-blue-300"] { border-color: #93c5fd !important; }
            .border-yellow-300, [class*="border-yellow-300"] { border-color: #fde047 !important; }
            table { border-collapse: collapse !important; }
            td, th { border: 1px solid #d1d5db !important; }
          `;
          clonedDoc.head.insertBefore(style, clonedDoc.head.firstChild);
          
          // 모든 요소의 인라인 스타일도 강제로 RGB로 변환
          const allElements = clonedDoc.querySelectorAll('*');
          (allElements as NodeListOf<HTMLElement>).forEach(el => {
            if (el.style) {
              el.style.color = '#000000';
              el.style.backgroundColor = '#ffffff';
              el.style.borderColor = '#d1d5db';
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 295;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 295;
      }

      pdf.save(`근무내역_${selectedEmployeeInfo.name}_${selectedMonth}.pdf`);
    } catch (error: any) {
      console.error('근무내역 PDF 생성 실패:', error);
      alert(`PDF 생성에 실패했습니다: ${error?.message || '알 수 없는 오류'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">급여명세서</h1>
            <p className="mt-1 text-sm text-gray-600">직원별 월별 급여명세서와 근무내역을 출력합니다</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">처리할 월:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 직원 선택 및 출력 */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">직원 선택</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">직원 선택</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">직원을 선택하세요</option>
              {filteredEmployees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            
            {/* 필터링 옵션 */}
            <div className="mt-3 space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filterWithWorkHistory}
                  onChange={(e) => setFilterWithWorkHistory(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">근무시간비교 데이터가 있는 직원만</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filterWithConfirmedPayroll}
                  onChange={(e) => setFilterWithConfirmedPayroll(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">급여확정 데이터가 있는 직원만</span>
              </label>
            </div>
          </div>

        </div>


        {/* 급여명세서 미리보기 */}
        {selectedPayroll && selectedEmployeeInfo && (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">급여명세서 미리보기</h3>
              <div className="flex space-x-2">
                <button
                  onClick={handleDownloadPDF}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  📄 PDF 다운로드
                </button>
                <div className="relative">
                  <button
                    onClick={handleEmailShare}
                    disabled={!selectedEmployeeInfo?.email}
                    className={`px-4 py-2 rounded-md text-sm ${
                      selectedEmployeeInfo?.email
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    📧 이메일 공유
                  </button>
                  {!selectedEmployeeInfo?.email && (
                    <div className="absolute top-full left-0 mt-1 text-xs text-gray-500 whitespace-nowrap">
                      이메일주소가 없습니다
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div id="payroll-statement-content" className="border border-gray-300 p-6 bg-white">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">급여명세서</h1>
                <p className="text-gray-600">{selectedMonth} 급여</p>
              </div>

              <table className="w-full border-collapse border border-gray-400 mb-6">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">성명</td>
                    <td className="border border-gray-400 p-2 w-1/4">{selectedEmployeeInfo.name}</td>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">주민번호</td>
                    <td className="border border-gray-400 p-2 w-1/4">{selectedEmployeeInfo.residentNumber || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 지급액</td>
                    <td className="border border-gray-400 p-2">{(selectedPayroll?.totalGrossPay || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 공제액</td>
                    <td className="border border-gray-400 p-2 text-red-600">-{(selectedPayroll?.totalDeductions || 0).toLocaleString()}원</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">실수령액</td>
                    <td className="border border-gray-400 p-2 font-bold text-blue-600" colSpan={3}>{(selectedPayroll?.totalNetPay || 0).toLocaleString()}원</td>
                  </tr>
                </tbody>
              </table>

              {/* 지점별 확정 계산 내역 (confirmedPayrolls.calculations 그대로 뷰) */}
              {Array.isArray(selectedPayroll?.calculations) && selectedPayroll!.calculations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-md font-semibold text-gray-900 mb-2">지점별 상세</h4>
                  <table className="w-full border-collapse border border-gray-400">
                    <thead>
                      <tr>
                        <th className="border border-gray-300 p-2 bg-gray-100">지점</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">근무시간</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">수습급여</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">정규급여</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">주휴수당</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">지급액</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">공제액</th>
                        <th className="border border-gray-300 p-2 bg-gray-100">실지급액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPayroll!.calculations.map((calc, idx) => {
                        const branchName = (calc as any).branchName || ((calc as any).branches && (calc as any).branches[0]?.branchName) || '-';
                        const workHours = (calc as any).actualWorkHours ?? (calc as any).totalWorkHours ?? 0;
                        const gross = (calc as any).grossPay ?? 0;
                        const ded = ((calc as any).deductions && (((calc as any).deductions as any).total ?? 0)) || 0;
                        const net = (calc as any).netPay ?? (gross - ded);
                        return (
                          <tr key={idx}>
                            <td className="border border-gray-300 p-2 text-center">{branchName}</td>
                            <td className="border border-gray-300 p-2 text-right">{(workHours as number).toFixed ? (workHours as number).toFixed(2) : workHours}h</td>
                            <td className="border border-gray-300 p-2 text-right">{(calc as any).probationPay ?? 0}원</td>
                            <td className="border border-gray-300 p-2 text-right">{(calc as any).regularPay ?? 0}원</td>
                            <td className="border border-gray-300 p-2 text-right">{(calc as any).weeklyHolidayPay ?? 0}원</td>
                            <td className="border border-gray-300 p-2 text-right">{(gross as number).toLocaleString()}원</td>
                            <td className="border border-gray-300 p-2 text-right text-red-600">-{(ded as number).toLocaleString()}원</td>
                            <td className="border border-gray-300 p-2 text-right font-semibold text-blue-600">{(net as number).toLocaleString()}원</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 기타사항: 주휴수당 계산식, 수습 계산식 */}
              {Array.isArray(selectedPayroll?.calculations) && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-900 mb-2">기타사항</h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    {selectedPayroll.calculations.map((calc, idx) => {
                      const branchName = (((calc as any).branchName) || (((calc as any).branches && (calc as any).branches[0]?.branchName)) || '-');
                      const probationHours = (calc as any).probationHours || 0;
                      const regularHours = (calc as any).regularHours || 0;
                      const probationPay = (calc as any).probationPay || 0;
                      const regularPay = (calc as any).regularPay || 0;
                      const weeklyHolidayPay = (calc as any).weeklyHolidayPay || 0;
                      const weeklyHolidayHours = (calc as any).weeklyHolidayHours || 0;
                      const hourlyWage = (calc as any).hourlyWage || 0;
                      
                      return (
                        <div key={idx} className="border border-gray-200 p-3 bg-gray-50">
                          <div className="font-medium text-gray-900 mb-2">{branchName} 기준</div>
                          
                          {/* 주휴수당 계산식 (주휴수당이 있는 경우만) */}
                          {weeklyHolidayPay > 0 && weeklyHolidayHours > 0 && (
                            <div className="mb-2">
                              <div className="font-medium text-gray-800">주휴수당 계산식:</div>
                              <div className="text-gray-600 ml-2">
                                주휴수당 = 시급 × 주휴시간 × 1.5<br/>
                                = {hourlyWage.toLocaleString()}원 × {weeklyHolidayHours}h × 1.5<br/>
                                = {weeklyHolidayPay.toLocaleString()}원
                              </div>
                            </div>
                          )}
                          
                          {/* 수습 계산식 (수습이 있는 경우만) */}
                          {probationHours > 0 && (
                            <div className="mb-2">
                              <div className="font-medium text-gray-800">수습 계산식:</div>
                              <div className="text-gray-600 ml-2">
                                수습급여 = 시급 × 수습시간<br/>
                                = {hourlyWage.toLocaleString()}원 × {probationHours.toFixed(2)}h<br/>
                                = {probationPay.toLocaleString()}원
                              </div>
                            </div>
                          )}
                          
                          {/* 정규 급여 계산식 */}
                          {regularHours > 0 && (
                            <div className="mb-2">
                              <div className="font-medium text-gray-800">정규급여 계산식:</div>
                              <div className="text-gray-600 ml-2">
                                정규급여 = 시급 × 정규시간<br/>
                                = {hourlyWage.toLocaleString()}원 × {regularHours.toFixed(2)}h<br/>
                                = {regularPay.toLocaleString()}원
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <table className="w-full border-collapse border border-gray-400 mb-6">
                <thead>
                  <tr>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/2">항목</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4 text-right">금액</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4 text-right">비고</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-2">기본급</td>
                    <td className="border border-gray-400 p-2 text-right">{(selectedPayroll?.totalGrossPay || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  {employmentType === '근로소득' && (
                    <>
                      <tr>
                        <td className="border border-gray-400 p-2">국민연금</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.045).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-2">건강보험</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.03545).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-2">장기요양보험</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round(Math.round((selectedPayroll?.totalGrossPay || 0) * 0.03545) * 0.1295).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-2">고용보험</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.009).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-2">소득세</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.03).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-2">지방소득세</td>
                        <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.003).toLocaleString()}원</td>
                        <td className="border border-gray-400 p-2 text-right">-</td>
                      </tr>
                    </>
                  )}
                  {(employmentType === '사업소득' || employmentType === '외국인') && (
                    <tr>
                      <td className="border border-gray-400 p-2">원천징수(사업소득 3.3%)</td>
                      <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.033).toLocaleString()}원</td>
                      <td className="border border-gray-400 p-2 text-right">-</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 font-bold">
                    <td className="border border-gray-400 p-2">실지급액</td>
                    <td className="border border-gray-400 p-2 text-right text-blue-600">{(selectedPayroll?.totalNetPay || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-8">
                <div className="border border-gray-400 p-4">
                  <div className="text-right">
                    <div className="mb-2">청담장어마켓 동탄점</div>
                    <div className="relative">
                      대표자: 이진영
                      <span className="relative inline-block ml-2">
                        (인)
                        {/* 서명 이미지는 필요시 추가 */}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 증명 문구 및 발급일 */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-700 mb-2">
                  위 내역과 같이 급여가 지급되었음을 증명합니다.
                </p>
                <p className="text-sm text-gray-600">
                  발급일: {new Date().toLocaleDateString('ko-KR', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 근무내역 미리보기 */}
        {selectedWorkTimeComparison && selectedEmployeeInfo && (() => {
          console.log('🔍 근무내역 미리보기 렌더링:', {
            hasSelectedWorkTimeComparison: !!selectedWorkTimeComparison,
            hasSelectedEmployeeInfo: !!selectedEmployeeInfo,
            comparisonResultsLength: selectedWorkTimeComparison?.comparisonResults?.length || 0,
            totalScheduleHours: selectedWorkTimeComparison?.totalScheduleHours || 0,
            totalActualHours: selectedWorkTimeComparison?.totalActualHours || 0
          });

          // 선택된 직원의 데이터만 필터링
          const selectedEmployeeComparisons = workTimeComparisons.filter(comparison => comparison.employeeId === selectedEmployee);

          // 전체 실근무 합계 계산을 위해 모든 행으로 변환해 합산
          const toRows = (items: any[]) => items.map((item) => {
            const parseRange = (range: string) => {
              if (!range || typeof range !== 'string' || !range.includes('-')) return { start: '-', end: '-' };
              const [s, e] = range.split('-');
              return { start: s || '-', end: e || '-' };
            };
            const sched = parseRange(item.scheduledTimeRange as any);
            const actual = parseRange(item.actualTimeRange as any);
            const actualHours = (item as any).actualWorkHours ?? (item as any).actualHours ?? 0;
            const scheduleHours = (item as any).scheduledHours ?? 0;
            const breakTime = (item as any).breakTime ?? 0;
            return {
              date: (item as any).date,
              scheduleStartTime: sched.start,
              scheduleEndTime: sched.end,
              scheduleWorkHours: scheduleHours,
              actualStartTime: actual.start,
              actualEndTime: actual.end,
              actualBreakTime: breakTime,
              actualWorkHours: actualHours
            };
          });
          const allRowsForSelected = toRows(selectedEmployeeComparisons as any[]);
          const overallTotalActual = allRowsForSelected.reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0);
          
          // 지점별로 그룹화 (WorkTimeComparisonResult 레벨에서)
          const branchGroups = selectedEmployeeComparisons.reduce((groups: {[key: string]: WorkTimeComparisonResult[]}, comparison) => {
            const branchName = comparison.branchName || '미지정지점';
            if (!groups[branchName]) {
              groups[branchName] = [];
            }
            groups[branchName].push(comparison);
            return groups;
          }, {});

          // 시간을 HH:MM 형식으로 변환하는 함수
          const formatTime = (hours: number) => {
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          };

          // 날짜를 YY.MM.DD(요일) 형식으로 변환
          const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const dayOfWeek = dayNames[date.getDay()];
            return `${year}.${month}.${day}(${dayOfWeek})`;
          };

          return (
            <div className="mt-6 bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">근무내역 미리보기</h3>
                <button
                  onClick={handleDownloadWorkHistoryPDF}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  📋 근무내역 PDF 다운로드
                </button>
              </div>
              <div id="work-history-content" className="border border-gray-300 p-6 bg-white">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">근무내역</h1>
                  <p className="text-gray-600">{selectedEmployeeInfo.name} - {selectedMonth}</p>
                </div>

                {/* 직원 정보 테이블 */}
                <table className="w-full border-collapse border border-gray-400 mb-6">
                  <tbody>
                    <tr>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">직원명</td>
                      <td className="border border-gray-400 p-2 w-1/4">{selectedEmployeeInfo.name}</td>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">주민번호</td>
                      <td className="border border-gray-400 p-2 w-1/4">{selectedEmployeeInfo.residentNumber || '-'}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">근무기간</td>
                      <td className="border border-gray-400 p-2">{selectedMonth}</td>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 실근무시간</td>
                      <td className="border border-gray-400 p-2 font-bold text-blue-600">
                        {formatTime(selectedWorkTimeComparison?.totalActualHours || 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 지점별 근무내역 */}
                {Object.entries(branchGroups).map(([branchName, comparisons]) => {
                  // 데이터 구조 표준화: 일자 단위 레코드를 표 렌더링용으로 변환
                  const rows = (comparisons || []).map((item) => {
                    const parseRange = (range: any) => {
                      if (!range || typeof range !== 'string' || !range.includes('-')) return { start: '-', end: '-' };
                      const [s, e] = range.split('-');
                      return { start: s || '-', end: e || '-' };
                    };
                    const pos = parseRange((item as any).posTimeRange);
                    const actual = parseRange((item as any).actualTimeRange);
                    const actualHours = (item as any).actualWorkHours ?? 0;
                    const breakTime = (item as any).breakTime ?? 0;
                    return {
                      date: (item as any).date,
                      posStartTime: pos.start,
                      posEndTime: pos.end,
                      actualStartTime: actual.start,
                      actualEndTime: actual.end,
                      actualBreakTime: breakTime,
                      actualWorkHours: actualHours
                    };
                  });
                  
                  // 날짜순 정렬
                  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  
                  const branchTotalHours = rows.reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0);
                  
                  return (
                    <div key={branchName} className="mb-8">
                      {/* 지점명 */}
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{branchName}</h3>
                      
                      {/* 근무내역표 */}
                      <table className="w-full border-collapse border border-gray-400 mb-4">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">날짜</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" colSpan={2}>POS</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" colSpan={2}>실근무</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">휴게시간</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">근무시간</th>
                          </tr>
                          <tr>
                            
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">출근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">퇴근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">출근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">퇴근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold"></th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold"></th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((result, index) => (
                            <tr key={index}>
                              <td className="border border-gray-400 p-2 text-center">{formatDate(result.date)}</td>
                              <td className="border border-gray-400 p-2 text-center">{result.posStartTime || '-'}</td>
                              <td className="border border-gray-400 p-2 text-center">{result.posEndTime || '-'}</td>
                              <td className="border border-gray-400 p-2 text-center">{result.actualStartTime || '-'}</td>
                              <td className="border border-gray-400 p-2 text-center">{result.actualEndTime || '-'}</td>
                              <td className="border border-gray-400 p-2 text-center">
                                {formatTime(result.actualBreakTime || 0)}
                              </td>
                              <td className="border border-gray-400 p-2 text-center font-semibold">
                                {formatTime(result.actualWorkHours || 0)}
                              </td>
                            </tr>
                          ))}
                          {/* 지점별 합계 */}
                          <tr className="bg-gray-50 font-bold">
                            <td className="border border-gray-400 p-2 text-center" colSpan={6}>합계</td>
                            <td className="border border-gray-400 p-2 text-center text-blue-600">
                              {formatTime(branchTotalHours)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {/* 총합계 */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-300">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-gray-900 mb-2">총합계</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatTime(overallTotalActual || 0)}
                    </div>
                  </div>
                </div>

                {/* 메모 (선택된 월 기준) */}
                {(() => {
                  const targetMonth = normalizeMonth(selectedMonth);
                  // month 필드로 필터링 (관리자용 메모 우선, 없으면 해당직원공지용 메모)
                  const monthFiltered = employeeMemos
                    .filter(m => m.employeeId === selectedEmployee && normalizeMonth(m.month) === targetMonth)
                    .sort((a, b) => {
                      // 관리자용 메모를 우선으로
                      if (a.type === 'admin' && b.type !== 'admin') return -1;
                      if (a.type !== 'admin' && b.type === 'admin') return 1;
                      return b.createdAt.getTime() - a.createdAt.getTime();
                    });
                  
                  // 관리자용 메모가 있으면 그것을, 없으면 해당직원공지용 메모를 사용
                  const employeeMemo = monthFiltered.find(m => m.type === 'admin') || monthFiltered.find(m => m.type === 'employee') || monthFiltered[0];

                  if (!employeeMemo) return null;

                  return (
                    <div className="mt-6 p-4 bg-yellow-50 border border-yellow-300">
                      <h4 className="text-md font-semibold text-gray-900 mb-2">메모</h4>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {employeeMemo.memo}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        작성일: {employeeMemo.createdAt.toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">데이터를 불러오는 중...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollStatement;
