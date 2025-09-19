'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Schedule {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: Date;
  startTime: string;
  endTime: string;
  breakTime: string;
  totalHours: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Employee {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  employmentType: string;
  hireDate: Date;
  resignationDate?: Date;
}

interface Branch {
  id: string;
  name: string;
}

interface ReportData {
  employeeName: string;
  branchName: string;
  totalWorkDays: number;
  totalWorkHours: number;
  averageWorkHours: number;
  schedules: Schedule[];
}

interface ReportSummary {
  totalEmployees: number;
  totalWorkDays: number;
  totalWorkHours: number;
  averageWorkHours: number;
  branchBreakdown: { [branchName: string]: number };
}

export default function ReportManagement() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 필터 상태
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [reportType, setReportType] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // 보고서 데이터
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (schedules.length > 0) {
      generateReport();
    }
  }, [schedules, selectedEmployee, selectedBranch, reportType, selectedMonth, selectedYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 스케줄 데이터 로드
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesData = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          branchId: data.branchId,
          branchName: data.branchName,
          date: data.date?.toDate ? data.date.toDate() : new Date(),
          startTime: data.startTime,
          endTime: data.endTime,
          breakTime: data.breakTime,
          totalHours: data.totalHours,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });

      // 직원 데이터 로드
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      const employeesData = [];
      
      // 직원-지점 관계 로드
      const employeeBranchesSnapshot = await getDocs(collection(db, 'employeeBranches'));
      const employeeBranches = employeeBranchesSnapshot.docs.map(doc => ({
        id: doc.id,
        employeeId: doc.data().employeeId,
        branchId: doc.data().branchId,
        branchName: doc.data().branchName
      }));

      for (const doc of employeesSnapshot.docs) {
        const data = doc.data();
        // 해당 직원의 지점 관계 찾기 (첫 번째 지점만 사용)
        const employeeBranch = employeeBranches.find(eb => eb.employeeId === doc.id);
        
        employeesData.push({
          id: doc.id,
          name: data.name,
          branchId: employeeBranch?.branchId || '',
          branchName: employeeBranch?.branchName || '',
          employmentType: data.type || data.employmentType || '',
          hireDate: data.hireDate?.toDate ? data.hireDate.toDate() : new Date(),
          resignationDate: data.resignationDate?.toDate ? data.resignationDate.toDate() : undefined
        });
      }

      // 지점 데이터 로드
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = branchesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));

      setSchedules(schedulesData);
      setEmployees(employeesData);
      setBranches(branchesData);
    } catch (error) {
      console.error('데이터 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = () => {
    let filteredSchedules = [...schedules];

    // 기간 필터링
    if (reportType === 'monthly') {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      filteredSchedules = filteredSchedules.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month;
      });
    } else {
      filteredSchedules = filteredSchedules.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate.getFullYear() === selectedYear;
      });
    }

    // 직원 필터링
    if (selectedEmployee) {
      filteredSchedules = filteredSchedules.filter(schedule => 
        schedule.employeeId === selectedEmployee
      );
    }

    // 지점 필터링
    if (selectedBranch) {
      filteredSchedules = filteredSchedules.filter(schedule => 
        schedule.branchId === selectedBranch
      );
    }

    // 직원별 데이터 집계
    const employeeMap = new Map<string, ReportData>();
    
    filteredSchedules.forEach(schedule => {
      const key = schedule.employeeId;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employeeName: schedule.employeeName,
          branchName: schedule.branchName,
          totalWorkDays: 0,
          totalWorkHours: 0,
          averageWorkHours: 0,
          schedules: []
        });
      }
      
      const data = employeeMap.get(key)!;
      data.totalWorkDays += 1;
      data.totalWorkHours += schedule.totalHours;
      data.schedules.push(schedule);
    });

    // 평균 근무시간 계산
    employeeMap.forEach(data => {
      data.averageWorkHours = data.totalWorkDays > 0 ? data.totalWorkHours / data.totalWorkDays : 0;
    });

    const reportDataArray = Array.from(employeeMap.values())
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'));

    setReportData(reportDataArray);

    // 전체 요약 계산
    const totalEmployees = reportDataArray.length;
    const totalWorkDays = reportDataArray.reduce((sum, data) => sum + data.totalWorkDays, 0);
    const totalWorkHours = reportDataArray.reduce((sum, data) => sum + data.totalWorkHours, 0);
    const averageWorkHours = totalWorkDays > 0 ? totalWorkHours / totalWorkDays : 0;

    // 지점별 집계
    const branchBreakdown: { [branchName: string]: number } = {};
    reportDataArray.forEach(data => {
      branchBreakdown[data.branchName] = (branchBreakdown[data.branchName] || 0) + data.totalWorkHours;
    });

    setReportSummary({
      totalEmployees,
      totalWorkDays,
      totalWorkHours,
      averageWorkHours,
      branchBreakdown
    });
  };

  const formatPeriod = () => {
    if (reportType === 'monthly') {
      return `${selectedMonth.getFullYear()}년 ${selectedMonth.getMonth() + 1}월`;
    } else {
      return `${selectedYear}년`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold text-gray-900">근무 보고서</h2>
        <p className="text-gray-600 mt-1">직원별, 지점별 근무 현황을 확인할 수 있습니다.</p>
      </div>

      {/* 필터 섹션 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">보고서 필터</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 보고서 유형 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">보고서 유형</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as 'monthly' | 'yearly')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="monthly">월별</option>
              <option value="yearly">연간</option>
            </select>
          </div>

          {/* 기간 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {reportType === 'monthly' ? '월 선택' : '년도 선택'}
            </label>
            {reportType === 'monthly' ? (
              <input
                type="month"
                value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-');
                  setSelectedMonth(new Date(parseInt(year), parseInt(month) - 1));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={year} value={year}>{year}년</option>
                  );
                })}
              </select>
            )}
          </div>

          {/* 지점 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">지점 선택</label>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setSelectedEmployee(''); // 지점 변경 시 직원 선택 초기화
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">전체 지점</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* 직원 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">직원 선택</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">전체 직원</option>
              {employees
                .filter(employee => !selectedBranch || employee.branchId === selectedBranch)
                .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 요약 정보 */}
      {reportSummary && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {formatPeriod()} 요약
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{reportSummary.totalEmployees}</div>
              <div className="text-sm text-blue-600">총 직원 수</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{reportSummary.totalWorkDays}</div>
              <div className="text-sm text-green-600">총 근무일</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{reportSummary.totalWorkHours.toFixed(1)}</div>
              <div className="text-sm text-purple-600">총 근무시간</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{reportSummary.averageWorkHours.toFixed(1)}</div>
              <div className="text-sm text-orange-600">평균 근무시간</div>
            </div>
          </div>

          {/* 지점별 집계 */}
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-2">지점별 근무시간</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(reportSummary.branchBreakdown).map(([branchName, hours]) => (
                <div key={branchName} className="bg-gray-50 p-3 rounded">
                  <div className="font-medium text-gray-900">{branchName}</div>
                  <div className="text-sm text-gray-600">{hours.toFixed(1)}시간</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 상세 보고서 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {formatPeriod()} 상세 보고서
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  직원명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근무일수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  총 근무시간
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  평균 근무시간
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reportData.map((data, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {data.employeeName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {data.branchName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {data.totalWorkDays}일
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {data.totalWorkHours.toFixed(1)}시간
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {data.averageWorkHours.toFixed(1)}시간
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    선택한 조건에 해당하는 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 개인직원 선택 시 일별 근무내역 */}
      {selectedEmployee && reportData.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              {employees.find(e => e.id === selectedEmployee)?.name} - 일별 근무내역
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    날짜
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    시작시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    종료시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    휴식시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    근무시간
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
                  const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
                  
                  const employeeSchedules = schedules.filter(schedule => 
                    schedule.employeeId === selectedEmployee &&
                    schedule.date >= startDate && 
                    schedule.date <= endDate
                  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  
                  return employeeSchedules.map((schedule, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(schedule.date).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          weekday: 'short'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.startTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.endTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.breakTime}시간
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {schedule.totalHours}시간
                      </td>
                    </tr>
                  ));
                })()}
                {(() => {
                  const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
                  const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
                  
                  const employeeSchedules = schedules.filter(schedule => 
                    schedule.employeeId === selectedEmployee &&
                    schedule.date >= startDate && 
                    schedule.date <= endDate
                  );
                  
                  if (employeeSchedules.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                          해당 기간에 근무 기록이 없습니다.
                        </td>
                      </tr>
                    );
                  }
                  
                  const totalHours = employeeSchedules.reduce((sum, schedule) => sum + schedule.totalHours, 0);
                  const totalBreakHours = employeeSchedules.reduce((sum, schedule) => sum + parseFloat(schedule.breakTime || '0'), 0);
                  
                  return (
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        합계
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        -
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        -
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {totalBreakHours.toFixed(1)}시간
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {totalHours.toFixed(1)}시간
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
