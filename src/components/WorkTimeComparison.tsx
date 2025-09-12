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
  status: 'match' | 'over' | 'under' | 'review_required' | 'modified';
  scheduledTimeRange?: string; // "19:00-22:00" 형태
  actualTimeRange?: string; // "19:00-22:11" 형태
  isModified?: boolean; // 수정 여부
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
  const [employeeReviewStatus, setEmployeeReviewStatus] = useState<{[key: string]: '검토전' | '검토중' | '검토완료'}>({});

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

  // 지점이나 직원이 변경될 때 스케줄 다시 로드
  useEffect(() => {
    if (selectedMonth) {
      loadSchedules(selectedMonth);
    }
  }, [selectedBranchId, selectedEmployeeId, selectedMonth]);

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
      let filteredSchedules = schedulesData.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });

      // 선택된 지점으로 필터링
      if (selectedBranchId) {
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === selectedBranchId);
      } else if (isManager && userBranch) {
        // 매니저 권한이 있으면 해당 지점만 필터링
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === userBranch.id);
      }

      // 선택된 직원으로 필터링
      if (selectedEmployeeId) {
        filteredSchedules = filteredSchedules.filter(schedule => schedule.employeeId === selectedEmployeeId);
      }

      setSchedules(filteredSchedules);
    } catch (error) {
      console.error('스케줄 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseActualWorkData = (data: string): ActualWorkRecord[] => {
    const lines = data.trim().split('\n');
    const records: ActualWorkRecord[] = [];

    console.log('실제근무 데이터 파싱 시작, 총 라인 수:', lines.length);

    lines.forEach((line, index) => {
      if (line.trim()) {
        const columns = line.split('\t');
        console.log(`라인 ${index + 1}:`, columns);
        
        if (columns.length >= 8) {
          const date = columns[0].trim(); // "2025-09-11"
          const startTime = columns[1].trim(); // "2025-09-11 19:00:10"
          const endTime = columns[2].trim(); // "2025-09-11 22:11:05"
          
          // 여러 컬럼에서 시간 정보 찾기
          let totalTimeStr = '';
          let totalHours = 0;
          
          // 7번째 컬럼부터 12번째 컬럼까지 시간 형식 찾기
          for (let i = 6; i < Math.min(columns.length, 12); i++) {
            const colValue = columns[i].trim();
            if (colValue.includes(':') && colValue.match(/^\d+:\d+$/)) {
              totalTimeStr = colValue;
              console.log(`시간 발견: 컬럼 ${i} = "${colValue}"`);
              break;
            }
          }
          
          // 시간을 찾지 못한 경우 시작/종료 시간으로 계산
          if (!totalTimeStr) {
            try {
              const start = new Date(startTime);
              const end = new Date(endTime);
              const diffMs = end.getTime() - start.getTime();
              totalHours = diffMs / (1000 * 60 * 60); // 시간 단위로 변환
              console.log(`시간 계산: ${startTime} ~ ${endTime} = ${totalHours}시간`);
            } catch (error) {
              console.error('시간 계산 오류:', error);
            }
          }

          console.log(`전체 컬럼 정보:`, columns.map((col, idx) => `${idx}: "${col}"`));
          console.log(`파싱된 데이터: 날짜=${date}, 시작=${startTime}, 종료=${endTime}, 총시간=${totalTimeStr}`);

          // 시간 문자열을 소수점 시간으로 변환 (예: "3:11" -> 3.18)
          if (totalTimeStr) {
            try {
              console.log(`시간 문자열 파싱: "${totalTimeStr}"`);
              
              // 여러 가지 시간 형식 시도
              if (totalTimeStr.includes(':')) {
                const timeParts = totalTimeStr.split(':');
                console.log(`시간 파싱: ${totalTimeStr} -> parts:`, timeParts);
                
                if (timeParts.length === 2) {
                  const hours = parseInt(timeParts[0], 10);
                  const minutes = parseInt(timeParts[1], 10);
                  console.log(`시간 변환: hours=${hours}, minutes=${minutes}`);
                  
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    totalHours = hours + (minutes / 60);
                    console.log(`최종 계산: ${hours} + (${minutes}/60) = ${totalHours}`);
                  } else {
                    console.error('시간 파싱 실패: hours 또는 minutes가 NaN', { hours, minutes });
                  }
                } else {
                  console.error('시간 형식 오류: 콜론이 1개가 아님', timeParts);
                }
              } else {
                // 콜론이 없는 경우 숫자로만 파싱 시도
                const numericValue = parseFloat(totalTimeStr);
                if (!isNaN(numericValue)) {
                  totalHours = numericValue;
                  console.log(`숫자로 파싱: ${totalTimeStr} -> ${totalHours}`);
                } else {
                  console.error('시간 파싱 실패: 숫자도 아니고 시간 형식도 아님', totalTimeStr);
                }
              }
            } catch (error) {
              console.error('시간 파싱 오류:', error, '원본 데이터:', totalTimeStr);
            }
          }

          records.push({
            date,
            startTime,
            endTime,
            totalHours
          });
        } else {
          console.log(`라인 ${index + 1} 컬럼 수 부족:`, columns.length);
        }
      }
    });

    console.log('파싱 완료된 실제근무 데이터:', records);
    return records;
  };

  const compareWorkTimes = () => {
    console.log('근무시간 비교 시작');
    console.log('선택된 지점:', selectedBranchId);
    console.log('선택된 월:', selectedMonth);
    console.log('선택된 직원:', selectedEmployeeId);
    console.log('실제근무 데이터 길이:', actualWorkData.length);
    console.log('스케줄 개수:', schedules.length);

    // 필수 항목 검증
    if (!selectedBranchId) {
      alert('지점을 선택해주세요.');
      return;
    }

    if (!selectedMonth) {
      alert('월을 선택해주세요.');
      return;
    }

    if (!selectedEmployeeId) {
      alert('직원을 선택해주세요.');
      return;
    }

    if (!actualWorkData.trim()) {
      alert('실제근무 데이터를 입력해주세요.');
      return;
    }

    const actualRecords = parseActualWorkData(actualWorkData);
    console.log('파싱된 실제근무 데이터:', actualRecords);

    const comparisons: WorkTimeComparison[] = [];
    const processedDates = new Set<string>();

    // 1. 스케줄이 있는 경우: 스케줄과 실제근무 데이터 비교
    schedules.forEach(schedule => {
      const scheduleDate = schedule.date.toISOString().split('T')[0];
      const actualRecord = actualRecords.find(record => record.date === scheduleDate);

      console.log(`스케줄: ${schedule.employeeName} ${scheduleDate}`, schedule);
      console.log(`실제근무 데이터 찾기:`, actualRecord);

      if (actualRecord) {
        const difference = actualRecord.totalHours - schedule.totalHours;
        let status: 'match' | 'over' | 'under' | 'review_required' = 'match';
        
        // 10분(0.17시간) 이상 차이나면 검토필요
        if (Math.abs(difference) >= 0.17) {
          status = 'review_required';
        } else if (Math.abs(difference) < 0.1) {
          status = 'match';
        } else {
          // 10분 이내 차이는 모두 검토필요로 통일
          status = 'review_required';
        }

        comparisons.push({
          employeeName: schedule.employeeName,
          date: scheduleDate,
          scheduledHours: schedule.totalHours,
          actualHours: actualRecord.totalHours,
          difference,
          status,
          scheduledTimeRange: `${schedule.startTime}-${schedule.endTime}`,
          actualTimeRange: formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false
        });

        processedDates.add(scheduleDate);
      } else {
        // 스케줄은 있지만 실제근무 데이터가 없는 경우
        comparisons.push({
          employeeName: schedule.employeeName,
          date: scheduleDate,
          scheduledHours: schedule.totalHours,
          actualHours: 0,
          difference: -schedule.totalHours,
          status: 'under',
          scheduledTimeRange: `${schedule.startTime}-${schedule.endTime}`,
          actualTimeRange: '-',
          isModified: false
        });
      }
    });

    // 2. 실제근무 데이터는 있지만 스케줄이 없는 경우
    actualRecords.forEach(actualRecord => {
      if (!processedDates.has(actualRecord.date)) {
        // 선택된 직원의 이름을 사용 (실제근무 데이터에는 직원명이 없으므로)
        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
        const employeeName = selectedEmployee ? selectedEmployee.name : '알 수 없음';

        comparisons.push({
          employeeName: employeeName,
          date: actualRecord.date,
          scheduledHours: 0,
          actualHours: actualRecord.totalHours,
          difference: actualRecord.totalHours,
          status: 'review_required', // 스케줄 없이 근무한 경우 검토필요
          scheduledTimeRange: '-',
          actualTimeRange: formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false
        });
      }
    });

    // 날짜순으로 정렬
    comparisons.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log('비교 결과:', comparisons);
    setComparisonResults(comparisons);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'match': return 'text-green-600 bg-green-50';
      case 'over': return 'text-blue-600 bg-blue-50';
      case 'under': return 'text-red-600 bg-red-50';
      case 'review_required': return 'text-orange-600 bg-orange-50';
      case 'modified': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'match': return '근무시간일치';
      case 'over': return '초과';
      case 'under': return '부족';
      case 'review_required': return '검토필요';
      case 'modified': return '수정완료';
      default: return '알 수 없음';
    }
  };

  // 시간 범위 포맷 함수
  const formatTimeRange = (startTime: string, endTime: string) => {
    // "2025-09-11 19:00:10" -> "19:00"
    const start = startTime.split(' ')[1]?.substring(0, 5) || startTime.substring(0, 5);
    const end = endTime.split(' ')[1]?.substring(0, 5) || endTime.substring(0, 5);
    return `${start}-${end}`;
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
            지점 선택 <span className="text-red-500">*</span>
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
            비교할 월 선택 <span className="text-red-500">*</span>
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

      </div>

      {/* 직원 리스트 테이블 */}
      {selectedBranchId && selectedMonth && employees.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            선택된 지점의 직원 목록
          </h3>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      선택
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      직원명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      검토여부
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {employees.map((employee) => (
                    <tr 
                      key={employee.id} 
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedEmployeeId === employee.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedEmployeeId(employee.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="radio"
                          name="employee"
                          value={employee.id}
                          checked={selectedEmployeeId === employee.id}
                          onChange={() => setSelectedEmployeeId(employee.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <select
                          value={employeeReviewStatus[employee.id] || '검토전'}
                          onChange={(e) => {
                            setEmployeeReviewStatus(prev => ({
                              ...prev,
                              [employee.id]: e.target.value as '검토전' | '검토중' | '검토완료'
                            }));
                          }}
                          onClick={(e) => e.stopPropagation()} // 행 클릭 이벤트 방지
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="검토전">검토전</option>
                          <option value="검토중">검토중</option>
                          <option value="검토완료">검토완료</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* 본사전송 버튼 */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                alert('본사전송 기능은 향후 구현될 예정입니다.');
              }}
              disabled={!employees.every(emp => employeeReviewStatus[emp.id] === '검토완료')}
              className={`px-6 py-2 rounded-md font-medium ${
                employees.every(emp => employeeReviewStatus[emp.id] === '검토완료')
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              본사전송
            </button>
          </div>
        </div>
      )}

      {/* 실제근무 데이터 입력 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          실제근무 데이터 (복사붙여넣기) <span className="text-red-500">*</span>
        </label>
        
        {/* 도움말 */}
        <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 mb-2">데이터 복사 방법</h4>
              <div className="text-sm text-blue-800 space-y-2">
                <p><strong>POS ASP 시스템에서 복사하기:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>POS ASP 시스템 → 기타관리 → 근태관리 → 월근태내역</li>
                  <li>조회일자 설정 후 &quot;조회&quot; 버튼 클릭</li>
                  <li>아래 표에서 해당 직원의 <strong>전체 데이터 영역을 선택</strong>하여 복사</li>
                  <li>복사한 데이터를 아래 텍스트 영역에 붙여넣기</li>
                </ol>
                <div className="mt-3 p-2 bg-white border border-blue-300 rounded text-xs">
                  <p className="font-medium text-gray-700">복사 예시:</p>
                  <p className="text-gray-600 font-mono">2025-09-11	2025-09-11 19:00:10	2025-09-11 22:11:05	2025-09-11	...	3:11</p>
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        const modal = document.createElement('div');
                        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                        modal.innerHTML = `
                          <div class="bg-white p-4 rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
                            <div class="flex justify-between items-center mb-4">
                              <h3 class="text-lg font-semibold">POS ASP 시스템 화면 예시</h3>
                              <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
                            </div>
                            <div class="text-sm text-gray-600 mb-4">
                              <p><strong>복사할 영역:</strong> 아래 표에서 해당 직원의 전체 데이터 행을 선택하여 복사하세요.</p>
                              <p><strong>주의:</strong> 표 헤더는 제외하고 데이터 행만 복사해야 합니다.</p>
                            </div>
                            <div class="bg-gray-100 p-4 rounded border">
                              <p class="text-xs text-gray-500 mb-2">POS ASP 시스템 → 기타관리 → 근태관리 → 월근태내역 화면</p>
                              <div class="bg-white border rounded p-3 text-xs">
                                <div class="grid grid-cols-12 gap-1 mb-2 font-semibold border-b pb-1">
                                  <div>No.</div><div>사원</div><div>총근무시간</div><div>일자</div><div>출근시각</div><div>퇴근시각</div><div>근무시각</div><div>시급</div><div>외시급</div><div>근무시간</div><div>근무시간외</div><div>총근무시간</div>
                                </div>
                                <div class="grid grid-cols-12 gap-1 text-gray-600">
                                  <div>1</div><div>빠잉</div><div>50:37</div><div>2025-09-11</div><div>19:00:10</div><div>22:11:05</div><div>3:11</div><div>0</div><div>0</div><div>3:11</div><div>0:00</div><div>3:11</div>
                                </div>
                                <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                  <p class="font-medium text-yellow-800">💡 복사 방법:</p>
                                  <p class="text-yellow-700">위 표에서 "빠잉" 직원의 데이터 행 전체를 마우스로 드래그하여 선택한 후 Ctrl+C로 복사하세요.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        `;
                        document.body.appendChild(modal);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-xs underline"
                    >
                      📷 POS ASP 화면 예시 보기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <textarea
          value={actualWorkData}
          onChange={(e) => setActualWorkData(e.target.value)}
          placeholder="POS ASP 시스템에서 복사한 실제근무 데이터를 붙여넣으세요..."
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonResults.map((result, index) => {
                  // 행 배경색 결정
                  const rowBgColor = (result.status === 'modified' || result.status === 'match') 
                    ? 'bg-white' 
                    : 'bg-yellow-50';
                  
                  return (
                    <tr key={index} className={`hover:bg-gray-50 ${rowBgColor}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {result.employeeName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {result.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{result.scheduledHours.toFixed(1)}시간</div>
                        <div className="text-xs text-gray-500">{result.scheduledTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{result.actualHours.toFixed(1)}시간</div>
                        <div className="text-xs text-gray-500">{result.actualTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {(() => {
                          const totalMinutes = Math.abs(result.difference) * 60;
                          const hours = Math.floor(totalMinutes / 60);
                          const minutes = Math.round(totalMinutes % 60);
                          const sign = result.difference > 0 ? '+' : result.difference < 0 ? '-' : '';
                          return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.status)}`}>
                          {getStatusText(result.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {result.status === 'review_required' && (
                          <button
                            onClick={() => {
                              const newHours = prompt('수정할 실제 근무시간을 입력하세요 (시간 단위):', result.actualHours.toString());
                              if (newHours && !isNaN(parseFloat(newHours))) {
                                const updatedResults = [...comparisonResults];
                                updatedResults[index] = {
                                  ...result,
                                  actualHours: parseFloat(newHours),
                                  difference: parseFloat(newHours) - result.scheduledHours,
                                  status: 'modified',
                                  isModified: true
                                };
                                setComparisonResults(updatedResults);
                              }
                            }}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            수정
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 요약 통계 */}
      {comparisonResults.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {comparisonResults.filter(r => r.status === 'review_required').length}
            </div>
            <div className="text-sm text-orange-600">검토필요</div>
          </div>
        </div>
      )}
    </div>
  );
}
