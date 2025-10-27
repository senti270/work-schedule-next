'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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
}

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  confirmedAt: Date;
  confirmedBy: string;
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

  // 현재 월 설정
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  // 직원 목록 로드
  const loadEmployees = async () => {
    try {
      const employeesQuery = query(
        collection(db, 'employees'),
        orderBy('name', 'asc')
      );
      const employeesSnapshot = await getDocs(employeesQuery);
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      setEmployees(employeesData);
    } catch (error) {
      console.error('직원 목록 로드 실패:', error);
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
      
      // 클라이언트에서 월별 필터링
      const filteredData = allComparisonsData.filter(item => item.month === selectedMonth);
      
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
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadConfirmedPayrolls();
      loadWorkTimeComparisons();
    }
  }, [selectedMonth]);

  // 선택된 직원의 급여 데이터 찾기
  const selectedPayroll = confirmedPayrolls.find(p => p.employeeId === selectedEmployee);
  const selectedWorkTimeComparison = workTimeComparisons.find(w => w.employeeId === selectedEmployee);
  const selectedEmployeeInfo = employees.find(e => e.id === selectedEmployee);

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
      const element = document.getElementById('payroll-statement-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`급여명세서_${selectedEmployeeInfo.name}_${selectedMonth}.pdf`);
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      alert('PDF 생성에 실패했습니다.');
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

  // 이메일 공유
  const handleEmailShare = () => {
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

    const mailtoUrl = `mailto:${selectedEmployeeInfo.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
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
            <button
              onClick={() => {
                loadConfirmedPayrolls();
                loadWorkTimeComparisons();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              🔄 새로고침
            </button>
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

          <div className="flex items-end space-x-4">
            <button
              onClick={handleDownloadPDF}
              disabled={!selectedPayroll}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📄 PDF 다운로드
            </button>
            <button
              onClick={handlePrintWorkHistory}
              disabled={!selectedWorkTimeComparison}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📋 근무내역 출력
            </button>
          </div>
        </div>

        {/* 선택된 직원 정보 */}
        {selectedEmployee && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-md font-medium text-gray-900 mb-2">선택된 직원 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">이름:</span>
                <span className="ml-2 font-medium">{selectedEmployeeInfo?.name || '-'}</span>
              </div>
              <div>
                <span className="text-gray-600">주민번호:</span>
                <span className="ml-2 font-medium">{selectedEmployeeInfo?.residentNumber || '-'}</span>
              </div>
              <div>
                <span className="text-gray-600">은행:</span>
                <span className="ml-2 font-medium">{selectedEmployeeInfo?.bankName || '-'}</span>
              </div>
              <div>
                <span className="text-gray-600">계좌번호:</span>
                <span className="ml-2 font-medium">{selectedEmployeeInfo?.accountNumber || '-'}</span>
              </div>
            </div>
            
            {selectedPayroll && (
              <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
                <h4 className="text-sm font-medium text-green-800 mb-2">급여 정보</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">기본급:</span>
                    <span className="ml-2 font-medium text-green-600">{(selectedPayroll?.totalGrossPay || 0).toLocaleString()}원</span>
                  </div>
                  <div>
                    <span className="text-gray-600">공제액:</span>
                    <span className="ml-2 font-medium text-red-600">-{(selectedPayroll?.totalDeductions || 0).toLocaleString()}원</span>
                  </div>
                  <div>
                    <span className="text-gray-600">실지급액:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedPayroll?.totalNetPay || 0).toLocaleString()}원</span>
                  </div>
                </div>
                
                {/* 공유 기능 */}
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={handleShareLink}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                  >
                    🔗 링크 공유
                  </button>
                  <div className="relative">
                    <button
                      onClick={handleEmailShare}
                      disabled={!selectedEmployeeInfo?.email}
                      className={`px-3 py-1 rounded text-sm ${
                        selectedEmployeeInfo?.email
                          ? 'bg-green-500 text-white hover:bg-green-600'
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
            )}

            {selectedWorkTimeComparison && (
              <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                <h4 className="text-sm font-medium text-blue-800 mb-2">근무 정보</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">총 스케줄 시간:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedWorkTimeComparison?.totalScheduleHours || 0).toFixed(2)}시간</span>
                  </div>
                  <div>
                    <span className="text-gray-600">총 실제 근무시간:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedWorkTimeComparison?.totalActualHours || 0).toFixed(2)}시간</span>
                  </div>
                  <div>
                    <span className="text-gray-600">시간 차이:</span>
                    <span className="ml-2 font-medium text-purple-600">{(selectedWorkTimeComparison?.totalDifference || 0).toFixed(2)}시간</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 급여명세서 미리보기 */}
        {selectedPayroll && selectedEmployeeInfo && (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">급여명세서 미리보기</h3>
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
                </tbody>
              </table>

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
                  <tr>
                    <td className="border border-gray-400 p-2">국민연금</td>
                    <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.045).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2">건강보험</td>
                    <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.03495).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2">장기요양보험</td>
                    <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.0088).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2">고용보험</td>
                    <td className="border border-gray-400 p-2 text-right text-red-600">-{Math.round((selectedPayroll?.totalGrossPay || 0) * 0.008).toLocaleString()}원</td>
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
                        <img 
                          src="/images/signature.png" 
                          alt="서명" 
                          className="absolute top-0 left-0 w-16 h-8 object-contain opacity-80"
                          style={{ transform: 'translateY(-2px)' }}
                        />
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
          return (
            <div className="mt-6 bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">근무내역 미리보기</h3>
              <div className="border border-gray-300 p-6 bg-white">
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
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">지점</td>
                    <td className="border border-gray-400 p-2 w-1/4">{selectedWorkTimeComparison?.branchName || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">주민번호</td>
                    <td className="border border-gray-400 p-2">{selectedEmployeeInfo.residentNumber || '-'}</td>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">근무기간</td>
                    <td className="border border-gray-400 p-2">{selectedMonth}</td>
                  </tr>
                </tbody>
              </table>

              {/* 근무내역 테이블 */}
              <table className="w-full border-collapse border border-gray-400 mb-6">
                <thead>
                  <tr>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/8">날짜</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/12">요일</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/6">스케줄 출근</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/6">스케줄 퇴근</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/12">스케줄 시간</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/6">실제 출근</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/6">실제 퇴근</th>
                    <th className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/12">실제 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedWorkTimeComparison?.comparisonResults || []).map((result, index) => (
                    <tr key={index}>
                      <td className="border border-gray-400 p-2 text-center">{result.date}</td>
                      <td className="border border-gray-400 p-2 text-center">{result.dayOfWeek}</td>
                      <td className="border border-gray-400 p-2 text-center">{result.scheduleStartTime || '-'}</td>
                      <td className="border border-gray-400 p-2 text-center">{result.scheduleEndTime || '-'}</td>
                      <td className="border border-gray-400 p-2 text-center">{(result.scheduleWorkHours || 0).toFixed(2)}시간</td>
                      <td className="border border-gray-400 p-2 text-center">{result.actualStartTime || '-'}</td>
                      <td className="border border-gray-400 p-2 text-center">{result.actualEndTime || '-'}</td>
                      <td className="border border-gray-400 p-2 text-center">{(result.actualWorkHours || 0).toFixed(2)}시간</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 근무시간 요약 */}
              <div className="mt-6 p-4 bg-gray-50 border border-gray-300">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">근무시간 요약</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-600">총 스케줄 시간</div>
                    <div className="text-lg font-bold text-blue-600">{(selectedWorkTimeComparison?.totalScheduleHours || 0).toFixed(2)}시간</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">총 실제 근무시간</div>
                    <div className="text-lg font-bold text-green-600">{(selectedWorkTimeComparison?.totalActualHours || 0).toFixed(2)}시간</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">시간 차이</div>
                    <div className={`text-lg font-bold ${(selectedWorkTimeComparison?.totalDifference || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(selectedWorkTimeComparison?.totalDifference || 0).toFixed(2)}시간
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
