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
  bankName?: string;
  accountNumber?: string;
}

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string;
  confirmedAt: Date;
  grossPay: number;
  deductions: number;
  netPay: number;
  memo?: string;
  branches: {
    branchId: string;
    branchName: string;
    workHours: number;
  }[];
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
      const payrollsQuery = query(
        collection(db, 'confirmedPayrolls'),
        where('month', '==', selectedMonth),
        orderBy('employeeName', 'asc')
      );
      const payrollsSnapshot = await getDocs(payrollsQuery);
      const payrollsData = payrollsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ConfirmedPayroll[];
      setConfirmedPayrolls(payrollsData);
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
      const comparisonsQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('month', '==', selectedMonth),
        orderBy('employeeName', 'asc')
      );
      const comparisonsSnapshot = await getDocs(comparisonsQuery);
      const comparisonsData = comparisonsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkTimeComparisonResult[];
      setWorkTimeComparisons(comparisonsData);
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
        grossPay: selectedPayroll.grossPay,
        deductions: selectedPayroll.deductions,
        netPay: selectedPayroll.netPay,
        branchName: selectedPayroll.branchName,
        confirmedAt: selectedPayroll.confirmedAt
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

    const subject = `급여명세서 - ${selectedEmployeeInfo.name} (${selectedMonth})`;
    const body = `
안녕하세요.

${selectedMonth} 급여명세서를 전달드립니다.

- 직원명: ${selectedEmployeeInfo.name}
- 지점: ${selectedPayroll.branchName}
- 기본급: ${selectedPayroll.grossPay.toLocaleString()}원
- 공제액: ${selectedPayroll.deductions.toLocaleString()}원
- 실지급액: ${selectedPayroll.netPay.toLocaleString()}원

자세한 내용은 첨부된 PDF 파일을 확인해주세요.

감사합니다.
    `;

    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
            <td width="30%">${selectedWorkTimeComparison.branchName}</td>
          </tr>
          <tr>
            <th>총 스케줄 시간</th>
            <td>${selectedWorkTimeComparison.totalScheduleHours.toFixed(2)}시간</td>
            <th>총 실제 근무시간</th>
            <td>${selectedWorkTimeComparison.totalActualHours.toFixed(2)}시간</td>
          </tr>
          <tr>
            <th>시간 차이</th>
            <td>${selectedWorkTimeComparison.totalDifference.toFixed(2)}시간</td>
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
            ${selectedWorkTimeComparison.comparisonResults.map(result => `
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
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
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
                    <span className="ml-2 font-medium text-green-600">{(selectedPayroll.grossPay || 0).toLocaleString()}원</span>
                  </div>
                  <div>
                    <span className="text-gray-600">공제액:</span>
                    <span className="ml-2 font-medium text-red-600">-{(selectedPayroll.deductions || 0).toLocaleString()}원</span>
                  </div>
                  <div>
                    <span className="text-gray-600">실지급액:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedPayroll.netPay || 0).toLocaleString()}원</span>
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
                  <button
                    onClick={handleEmailShare}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    📧 이메일 공유
                  </button>
                </div>
              </div>
            )}

            {selectedWorkTimeComparison && (
              <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                <h4 className="text-sm font-medium text-blue-800 mb-2">근무 정보</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">총 스케줄 시간:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedWorkTimeComparison.totalScheduleHours || 0).toFixed(2)}시간</span>
                  </div>
                  <div>
                    <span className="text-gray-600">총 실제 근무시간:</span>
                    <span className="ml-2 font-medium text-blue-600">{(selectedWorkTimeComparison.totalActualHours || 0).toFixed(2)}시간</span>
                  </div>
                  <div>
                    <span className="text-gray-600">시간 차이:</span>
                    <span className="ml-2 font-medium text-purple-600">{(selectedWorkTimeComparison.totalDifference || 0).toFixed(2)}시간</span>
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
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">지점</td>
                    <td className="border border-gray-400 p-2">{selectedPayroll.branchName}</td>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">급여지급일</td>
                    <td className="border border-gray-400 p-2">{new Date(selectedPayroll.confirmedAt).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">은행</td>
                    <td className="border border-gray-400 p-2">{selectedEmployeeInfo.bankName || '-'}</td>
                    <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">계좌번호</td>
                    <td className="border border-gray-400 p-2">{selectedEmployeeInfo.accountNumber || '-'}</td>
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
                    <td className="border border-gray-400 p-2 text-right">{(selectedPayroll.grossPay || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-2">공제액</td>
                    <td className="border border-gray-400 p-2 text-right text-red-600">-{(selectedPayroll.deductions || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                  <tr className="bg-gray-50 font-bold">
                    <td className="border border-gray-400 p-2">실지급액</td>
                    <td className="border border-gray-400 p-2 text-right text-blue-600">{(selectedPayroll.netPay || 0).toLocaleString()}원</td>
                    <td className="border border-gray-400 p-2 text-right">-</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-between mt-8">
                <div className="text-center">
                  <div className="mb-2">급여지급자</div>
                  <div className="border-b border-gray-400 w-32 h-8 mb-1"></div>
                  <div className="text-sm">(인)</div>
                </div>
                <div className="text-center">
                  <div className="mb-2">급여수령자</div>
                  <div className="border-b border-gray-400 w-32 h-8 mb-1"></div>
                  <div className="text-sm">(인)</div>
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
