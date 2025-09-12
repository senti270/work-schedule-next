'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

interface ActualWorkRecord {
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  employeeName?: string; // 파싱 후 매칭을 위해 추가
}

interface WorkTimeComparison {
  employeeName: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  difference: number;
  status: 'match' | 'over' | 'under';
}

interface WorkTimeComparisonProps {
  userBranch?: {
    id: string;
    name: string;
    managerEmail?: string;
  } | null;
  isManager?: boolean;
}

export default function WorkTimeComparison({ userBranch, isManager }: WorkTimeComparisonProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [actualWorkData, setActualWorkData] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<WorkTimeComparison[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<{id: string; name: string; branchId: string}[]>([]);
  const [branches, setBranches] = useState<{id: string; name: string}[]>([]);

  useEffect(() => {
    loadBranches();
    loadEmployees();
    // 현재 월을 기본값으로 설정
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    
    // 매니저인 경우 해당 지점을 기본값으로 설정
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
    }
  }, [isManager, userBranch]);

  // 지점이 변경될 때 직원 목록 다시 로드
  useEffect(() => {
    if (selectedBranchId || (isManager && userBranch)) {
      loadEmployees();
    }
  }, [selectedBranchId, isManager, userBranch]);

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || ''
      }));
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      let querySnapshot;
      
      // 선택된 지점이 있으면 해당 지점 직원만 로드
      if (selectedBranchId) {
        const q = query(collection(db, 'employees'), where('branchId', '==', selectedBranchId));
        querySnapshot = await getDocs(q);
      } else if (isManager && userBranch) {
        // 매니저 권한이 있으면 해당 지점 직원만 로드
        const q = query(collection(db, 'employees'), where('branchId', '==', userBranch.id));
        querySnapshot = await getDocs(q);
      } else {
        querySnapshot = await getDocs(collection(db, 'employees'));
      }
      
      const employeesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || '',
        branchId: doc.data().branchId || ''
      }));
      setEmployees(employeesData);
    } catch (error) {
      console.error('직원 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadSchedules = async (month: string) => {
    try {
      setLoading(true);
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

      const querySnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesData = querySnapshot.docs.map(doc => {
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

      // 선택된 월의 스케줄만 필터링
      const filteredSchedules = schedulesData.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });

      // 매니저 권한이 있으면 해당 지점만 필터링
      const finalSchedules = isManager && userBranch 
        ? filteredSchedules.filter(schedule => schedule.branchId === userBranch.id)
        : filteredSchedules;

      setSchedules(finalSchedules);
    } catch (error) {
      console.error('스케줄 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseActualWorkData = (data: string): ActualWorkRecord[] => {
    const lines = data.trim().split('\n');
    const records: ActualWorkRecord[] = [];

    lines.forEach(line => {
      if (line.trim()) {
        const columns = line.split('\t');
        if (columns.length >= 8) {
          const date = columns[0];
          const startTime = columns[1];
          const endTime = columns[2];
          const totalTimeStr = columns[6]; // "3:11" 형태

          // 시간 문자열을 소수점 시간으로 변환 (예: "3:11" -> 3.18)
          const [hours, minutes] = totalTimeStr.split(':').map(Number);
          const totalHours = hours + (minutes / 60);

          records.push({
            date,
            startTime,
            endTime,
            totalHours
          });
        }
      }
    });

    return records;
  };

  const compareWorkTimes = () => {
    if (!selectedMonth || !actualWorkData.trim()) {
      alert('월을 선택하고 실제근무 데이터를 입력해주세요.');
      return;
    }

    const actualRecords = parseActualWorkData(actualWorkData);
    const comparisons: WorkTimeComparison[] = [];

    // 각 스케줄에 대해 실제근무 데이터와 비교
    schedules.forEach(schedule => {
      const scheduleDate = schedule.date.toISOString().split('T')[0];
      const actualRecord = actualRecords.find(record => record.date === scheduleDate);

      if (actualRecord) {
        const difference = actualRecord.totalHours - schedule.totalHours;
        let status: 'match' | 'over' | 'under' = 'match';
        
        if (Math.abs(difference) < 0.1) {
          status = 'match';
        } else if (difference > 0) {
          status = 'over';
        } else {
          status = 'under';
        }

        comparisons.push({
          employeeName: schedule.employeeName,
          date: scheduleDate,
          scheduledHours: schedule.totalHours,
          actualHours: actualRecord.totalHours,
          difference,
          status
        });
      }
    });

    setComparisonResults(comparisons);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'match': return 'text-green-600 bg-green-50';
      case 'over': return 'text-blue-600 bg-blue-50';
      case 'under': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'match': return '일치';
      case 'over': return '초과';
      case 'under': return '부족';
      default: return '알 수 없음';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">근무시간 비교</h1>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-blue-900 mb-2">사용 방법</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 매월 한번씩 스케줄과 실제근무 시간을 비교합니다</li>
            <li>• 비교할 월을 선택하고 실제근무 데이터를 복사붙여넣기합니다</li>
            <li>• 차이가 있는 경우 초과/부족 시간을 확인할 수 있습니다</li>
          </ul>
        </div>
      </div>

      {/* 필터 선택 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 지점 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            지점 선택
          </label>
          <select
            value={selectedBranchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              setSelectedEmployeeId(''); // 지점 변경 시 직원 선택 초기화
            }}
            disabled={isManager} // 매니저는 지점 선택 불가
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">전체 지점</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {isManager && (
            <p className="text-xs text-gray-500 mt-1">
              매니저는 해당 지점만 접근 가능합니다
            </p>
          )}
        </div>

        {/* 월 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            비교할 월 선택
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              loadSchedules(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 직원 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            직원 선택
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 직원</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 실제근무 데이터 입력 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          실제근무 데이터 (복사붙여넣기)
        </label>
        <textarea
          value={actualWorkData}
          onChange={(e) => setActualWorkData(e.target.value)}
          placeholder="실제근무 데이터를 복사해서 붙여넣으세요..."
          className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 비교 실행 버튼 */}
      <div className="mb-6">
        <button
          onClick={compareWorkTimes}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {loading ? '로딩 중...' : '근무시간 비교'}
        </button>
      </div>

      {/* 비교 결과 */}
      {comparisonResults.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              비교 결과 ({comparisonResults.length}건)
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
                    날짜
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    스케줄 시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실제 시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    차이
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonResults.map((result, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.employeeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {result.scheduledHours.toFixed(1)}시간
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {result.actualHours.toFixed(1)}시간
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {result.difference > 0 ? '+' : ''}{result.difference.toFixed(1)}시간
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.status)}`}>
                        {getStatusText(result.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 요약 통계 */}
      {comparisonResults.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {comparisonResults.filter(r => r.status === 'match').length}
            </div>
            <div className="text-sm text-green-600">일치</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {comparisonResults.filter(r => r.status === 'over').length}
            </div>
            <div className="text-sm text-blue-600">초과</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {comparisonResults.filter(r => r.status === 'under').length}
            </div>
            <div className="text-sm text-red-600">부족</div>
          </div>
        </div>
      )}
    </div>
  );
}
