'use client';

import React, { useState, useEffect, use } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useSearchParams } from 'next/navigation';

interface Employee {
  id: string;
  name: string;
  residentNumber?: string;
  email?: string;
}

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  calculations: any[];
  totalGrossPay?: number;
  totalDeductions?: number;
  totalNetPay?: number;
}

interface WorkTimeComparisonResult {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string;
  date: string;
  actualWorkHours?: number;
  actualTimeRange?: string;
  posTimeRange?: string;
  actualBreakTime?: number;
}

interface PublicPayrollPageProps {
  params: Promise<{
    employeeId: string;
  }>;
}

export default function PublicPayrollPage({ params }: PublicPayrollPageProps) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [payroll, setPayroll] = useState<ConfirmedPayroll | null>(null);
  const [workTimeComparisons, setWorkTimeComparisons] = useState<WorkTimeComparisonResult[]>([]);
  const [branches, setBranches] = useState<{id: string; name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 토큰에서 월 정보 추출 (간단한 base64 디코딩)
  const getMonthFromToken = (token: string): string | null => {
    try {
      const decoded = atob(token);
      const data = JSON.parse(decoded);
      return data.month || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const employeeId = resolvedParams.employeeId;
        const token = searchParams.get('t');

        if (!token) {
          setError('유효하지 않은 링크입니다.');
          return;
        }

        // 토큰에서 월 정보 추출
        const month = getMonthFromToken(token);
        if (!month) {
          setError('유효하지 않은 링크입니다.');
          return;
        }

        // 직원 정보 로드
        const employeeDoc = await getDoc(doc(db, 'employees', employeeId));
        if (!employeeDoc.exists()) {
          setError('직원 정보를 찾을 수 없습니다.');
          return;
        }
        setEmployee({
          id: employeeDoc.id,
          ...employeeDoc.data()
        } as Employee);

        // 급여 데이터 로드 - 토큰에서 추출한 월로만 조회
        const payrollQuery = query(
          collection(db, 'confirmedPayrolls'),
          where('employeeId', '==', employeeId),
          where('month', '==', month)
        );
        const payrollSnapshot = await getDocs(payrollQuery);
        
        if (payrollSnapshot.empty) {
          setError('급여 데이터를 찾을 수 없습니다.');
          return;
        }

        const payrollData = payrollSnapshot.docs[0].data();
        
        // 🔒 보안: 토큰의 month와 실제 데이터의 month가 일치하는지 검증
        if (payrollData.month !== month) {
          setError('요청한 월의 급여 데이터를 찾을 수 없습니다.');
          return;
        }

        const calculations = payrollData.calculations || [];
        
        const totalGrossPay = calculations.reduce((sum: number, calc: any) => sum + (calc.grossPay || 0), 0);
        const totalDeductions = calculations.reduce((sum: number, calc: any) => {
          const deductions = calc.deductions;
          if (typeof deductions === 'object' && deductions !== null && 'total' in deductions) {
            return sum + (deductions.total || 0);
          }
          return sum + (typeof deductions === 'number' ? deductions : 0);
        }, 0);
        const totalNetPay = calculations.reduce((sum: number, calc: any) => sum + (calc.netPay || 0), 0);

        setPayroll({
          id: payrollSnapshot.docs[0].id,
          ...payrollData,
          totalGrossPay,
          totalDeductions,
          totalNetPay
        } as ConfirmedPayroll);

        // 근무시간 비교 데이터 로드
        const comparisonsQuery = query(
          collection(db, 'workTimeComparisonResults'),
          where('employeeId', '==', employeeId),
          where('month', '==', month)
        );
        const comparisonsSnapshot = await getDocs(comparisonsQuery);
        
        const comparisonsData = comparisonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WorkTimeComparisonResult[];
        
        setWorkTimeComparisons(comparisonsData);

        // 지점 목록 로드
        const branchesSnapshot = await getDocs(collection(db, 'branches'));
        const branchesData = branchesSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || ''
        }));
        setBranches(branchesData);
      } catch (err) {
        console.error('데이터 로드 실패:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [resolvedParams.employeeId, searchParams]);

  // PDF 다운로드
  const handleDownloadPDF = async () => {
    if (!payroll || !employee) {
      alert('데이터를 불러올 수 없습니다.');
      return;
    }

    try {
      const element = document.getElementById('payroll-statement-content');
      if (!element) {
        alert('PDF 생성 대상 요소를 찾을 수 없습니다.');
        return;
      }

      const canvas = await html2canvas(element, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
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
        }
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

      pdf.save(`급여명세서_${employee.name}_${payroll.month}.pdf`);
    } catch (err) {
      console.error('PDF 생성 실패:', err);
      alert('PDF 생성에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  if (error || !employee || !payroll) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">{error || '데이터를 불러올 수 없습니다.'}</div>
      </div>
    );
  }

  const employmentType = (payroll as any).employmentType || (employee as any).employmentType || '';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white shadow rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{employee.name}님의 급여명세서</h1>
              <p className="text-gray-600 mt-1">{payroll.month} 급여</p>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              📄 PDF 다운로드
            </button>
          </div>
        </div>

        <div id="payroll-statement-content" className="border border-gray-300 p-6 bg-white">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">급여명세서</h1>
            <p className="text-gray-600">{payroll.month} 급여</p>
          </div>

          <table className="w-full border-collapse border border-gray-400 mb-6">
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">성명</td>
                <td className="border border-gray-400 p-2 w-1/4">{employee.name}</td>
                <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">주민번호</td>
                <td className="border border-gray-400 p-2 w-1/4">{employee.residentNumber || '-'}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 지급액</td>
                <td className="border border-gray-400 p-2">{(payroll.totalGrossPay || 0).toLocaleString()}원</td>
                <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 공제액</td>
                <td className="border border-gray-400 p-2 text-red-600">-{(payroll.totalDeductions || 0).toLocaleString()}원</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">실수령액</td>
                <td className="border border-gray-400 p-2 font-bold text-blue-600" colSpan={3}>{(payroll.totalNetPay || 0).toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>

          {/* 지점별 상세 - 근무시간만 표시 */}
          {workTimeComparisons.length > 0 && (() => {
            // 지점별로 근무시간 합산
            const branchHoursMap = new Map<string, number>();
            
            workTimeComparisons.forEach((comparison) => {
              let branchName = comparison.branchName;
              if (!branchName && comparison.branchId) {
                const branch = branches.find(b => b.id === comparison.branchId);
                branchName = branch?.name || '-';
              } else if (!branchName) {
                branchName = '-';
              }
              
              const workHours = comparison.actualWorkHours || 0;
              const currentHours = branchHoursMap.get(branchName) || 0;
              branchHoursMap.set(branchName, currentHours + workHours);
            });
            
            // 총합 계산
            const totalHours = Array.from(branchHoursMap.values()).reduce((sum, hours) => sum + hours, 0);
            
            return (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">지점별 상세</h4>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-blue-900 font-semibold mb-2">실 근무시간</div>
                  <div className="text-2xl font-bold text-blue-900 mb-4">
                    {totalHours.toFixed(1)}h
                  </div>
                  <div className="space-y-1">
                    {Array.from(branchHoursMap.entries()).map(([branchName, hours], idx) => (
                      <div key={idx} className="flex justify-between text-blue-900">
                        <span>{branchName}:</span>
                        <span className="font-medium">{hours.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 지급/공제 항목 - 2단 레이아웃 */}
          {(() => {
            const allLineItems: Array<{type: 'earning' | 'deduction', label: string, amount: number, note: string}> = [];
            if (Array.isArray(payroll.calculations)) {
              payroll.calculations.forEach((calc: any) => {
                if (Array.isArray(calc.lineItems)) {
                  calc.lineItems.forEach((item: any) => {
                    const existingIndex = allLineItems.findIndex(li => li.label === item.label && li.type === item.type);
                    if (existingIndex >= 0) {
                      allLineItems[existingIndex].amount += (item.amount || 0);
                    } else {
                      allLineItems.push({
                        type: item.type || 'earning',
                        label: item.label || '',
                        amount: item.amount || 0,
                        note: item.note || ''
                      });
                    }
                  });
                }
              });
            }
            
            const earningItems = allLineItems.filter(item => item.type === 'earning');
            const deductionItems = allLineItems.filter(item => item.type === 'deduction');
            const totalEarnings = earningItems.reduce((sum, item) => sum + item.amount, 0);
            const totalDeductions = deductionItems.reduce((sum, item) => sum + item.amount, 0);
            
            return (
              <div className="mb-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* 좌측: 지급항목 */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-2">지급항목</h4>
                    <table className="w-full border-collapse border border-gray-400">
                      <thead>
                        <tr>
                          <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">항목</th>
                          <th className="border border-gray-400 p-2 bg-gray-100 font-semibold text-right">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earningItems.length > 0 ? (
                          earningItems.map((item, idx) => (
                            <React.Fragment key={idx}>
                              <tr>
                                <td className="border border-gray-400 p-2 text-gray-900">{item.label}</td>
                                <td className="border border-gray-400 p-2 text-right text-gray-900">{item.amount.toLocaleString()}원</td>
                              </tr>
                              {item.note && (
                                <tr>
                                  <td colSpan={2} className="border border-gray-400 p-1 pl-4">
                                    <div className="text-xs text-gray-500 whitespace-pre-line">{item.note}</div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="border border-gray-400 p-2 text-center text-gray-500">지급항목 없음</td>
                          </tr>
                        )}
                        <tr className="bg-gray-50 font-bold">
                          <td className="border border-gray-400 p-2 text-gray-900">합계</td>
                          <td className="border border-gray-400 p-2 text-right text-blue-600">{totalEarnings.toLocaleString()}원</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* 우측: 공제항목 */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-2">공제항목</h4>
                    <table className="w-full border-collapse border border-gray-400">
                      <thead>
                        <tr>
                          <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">항목</th>
                          <th className="border border-gray-400 p-2 bg-gray-100 font-semibold text-right">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deductionItems.length > 0 ? (
                          deductionItems.map((item, idx) => (
                            <React.Fragment key={idx}>
                              <tr>
                                <td className="border border-gray-400 p-2 text-gray-900">{item.label}</td>
                                <td className="border border-gray-400 p-2 text-right text-gray-900">-{item.amount.toLocaleString()}원</td>
                              </tr>
                              {item.note && (
                                <tr>
                                  <td colSpan={2} className="border border-gray-400 p-1 pl-4">
                                    <div className="text-xs text-gray-500 whitespace-pre-line">{item.note}</div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={2} className="border border-gray-400 p-2 text-center text-gray-500">공제항목 없음</td>
                          </tr>
                        )}
                        <tr className="bg-gray-50 font-bold">
                          <td className="border border-gray-400 p-2 text-gray-900">합계</td>
                          <td className="border border-gray-400 p-2 text-right text-gray-900">-{totalDeductions.toLocaleString()}원</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* 실수령액 */}
                <div className="mt-4">
                  <table className="w-full border-collapse border border-gray-400">
                    <tbody>
                      <tr className="bg-blue-50 font-bold">
                        <td className="border border-gray-400 p-2 w-1/2">실수령액</td>
                        <td className="border border-gray-400 p-2 text-right text-blue-600">{(totalEarnings - totalDeductions).toLocaleString()}원</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* 기타사항 */}
          {Array.isArray(payroll.calculations) && (
            <div className="mt-4 mb-6">
              <h4 className="text-md font-semibold text-gray-900 mb-2">기타사항</h4>
              <div className="text-sm text-gray-700 space-y-2">
                {payroll.calculations.map((calc: any, idx) => {
                  const branchName = calc.branchName || (calc.branches && calc.branches[0]?.branchName) || '-';
                  const probationHours = calc.probationHours || 0;
                  const regularHours = calc.regularHours || 0;
                  const probationPay = calc.probationPay || 0;
                  const regularPay = calc.regularPay || 0;
                  const weeklyHolidayPay = calc.weeklyHolidayPay || 0;
                  const weeklyHolidayHours = calc.weeklyHolidayHours || 0;
                  let hourlyWage = calc.hourlyWage || calc.salaryAmount || 0;
                  if (!hourlyWage && regularHours > 0 && regularPay > 0) {
                    hourlyWage = Math.round(regularPay / regularHours);
                  }
                  
                  return (
                    <div key={idx} className="border border-gray-200 p-3 bg-gray-50">
                      <div className="font-medium text-gray-900 mb-2">{branchName} 기준</div>
                      
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

          <div className="mt-8">
            <div className="border border-gray-400 p-4">
              <div className="text-right">
                <div className="mb-2">청담장어마켓 동탄점</div>
                <div className="relative">
                  대표자: 이진영
                  <span className="relative inline-block ml-2">(인)</span>
                </div>
              </div>
            </div>
          </div>

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

        {/* 근무내역 */}
        {workTimeComparisons.length > 0 && (() => {
          // 지점별로 그룹화
          const branchGroups = workTimeComparisons.reduce((groups: {[key: string]: WorkTimeComparisonResult[]}, comparison) => {
            let branchName = comparison.branchName;
            if (!branchName && comparison.branchId) {
              const branch = branches.find(b => b.id === comparison.branchId);
              branchName = branch?.name || '-';
            } else if (!branchName) {
              branchName = '-';
            }
            
            if (!groups[branchName]) {
              groups[branchName] = [];
            }
            groups[branchName].push(comparison);
            return groups;
          }, {});

          // 시간을 HH:MM 형식으로 변환
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

          // 전체 실근무 합계 계산
          const overallTotalActual = workTimeComparisons.reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0);

          return (
            <div className="mt-6 bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">근무내역</h3>
              <div className="border border-gray-300 p-6 bg-white">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">근무내역</h1>
                  <p className="text-gray-600">{employee.name} - {payroll.month}</p>
                </div>

                {/* 직원 정보 테이블 */}
                <table className="w-full border-collapse border border-gray-400 mb-6">
                  <tbody>
                    <tr>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">직원명</td>
                      <td className="border border-gray-400 p-2 w-1/4">{employee.name}</td>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold w-1/4">주민번호</td>
                      <td className="border border-gray-400 p-2 w-1/4">{employee.residentNumber || '-'}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">근무기간</td>
                      <td className="border border-gray-400 p-2">{payroll.month}</td>
                      <td className="border border-gray-400 p-2 bg-gray-100 font-semibold">총 실근무시간</td>
                      <td className="border border-gray-400 p-2 font-bold text-blue-600">
                        {formatTime(overallTotalActual || 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 지점별 근무내역 */}
                {Object.entries(branchGroups).map(([branchName, comparisons]) => {
                  const rows = comparisons.map((item) => {
                    const parseRange = (range: any) => {
                      if (!range || typeof range !== 'string' || !range.includes('-')) return { start: '-', end: '-' };
                      const [s, e] = range.split('-');
                      return { start: s || '-', end: e || '-' };
                    };
                    const pos = parseRange(item.posTimeRange);
                    const actual = parseRange(item.actualTimeRange);
                    const actualHours = item.actualWorkHours ?? 0;
                    const breakTime = item.actualBreakTime ?? 0;
                    return {
                      date: item.date,
                      posStartTime: pos.start,
                      posEndTime: pos.end,
                      actualStartTime: actual.start,
                      actualEndTime: actual.end,
                      actualBreakTime: breakTime,
                      actualWorkHours: actualHours
                    };
                  });
                  
                  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  
                  const branchTotalHours = rows.reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0);
                  
                  return (
                    <div key={branchName} className="mb-8">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{branchName}</h3>
                      
                      <table className="w-full border-collapse border border-gray-400 mb-4">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" rowSpan={2}>날짜</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" colSpan={2}>POS</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" colSpan={2}>실근무</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" rowSpan={2}>휴게시간</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold" rowSpan={2}>근무시간</th>
                          </tr>
                          <tr>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">출근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">퇴근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">출근</th>
                            <th className="border border-gray-400 p-2 bg-gray-100 font-semibold">퇴근</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.filter(result => (Number(result.actualWorkHours) || 0) > 0).map((result, index) => (
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
                          <tr className="bg-gray-50 font-bold">
                            <td className="border border-gray-400 p-2 text-center" colSpan={6}>합계</td>
                            <td className="border border-gray-400 p-2 text-center text-blue-600">
                              {formatTime(rows.filter(r => (Number(r.actualWorkHours) || 0) > 0).reduce((sum, r) => sum + (Number(r.actualWorkHours) || 0), 0))}
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
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

