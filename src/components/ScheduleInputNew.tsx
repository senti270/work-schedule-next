'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
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
  status?: 'active' | 'inactive';
  resignationDate?: Date;
}

interface Branch {
  id: string;
  name: string;
}

interface PayrollLock {
  id: string;
  year: number;
  month: number;
  branchId: string;
  branchName: string;
  isLocked: boolean;
  lockedAt: Date;
  lockedBy: string;
}

interface ScheduleInputNewProps {
  selectedBranchId?: string;
}

export default function ScheduleInputNew({ selectedBranchId }: ScheduleInputNewProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [payrollLocks, setPayrollLocks] = useState<PayrollLock[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  
  // 새로운 입력 형식 상태
  const [scheduleInputs, setScheduleInputs] = useState<{[key: string]: string}>({});
  const [editingCell, setEditingCell] = useState<{employeeId: string, date: string} | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadSchedules();
      checkPayrollLock();
    }
  }, [selectedMonth, selectedBranchId]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEmployees(),
        loadBranches(),
        loadSchedules(),
        loadPayrollLocks()
      ]);
    } catch (error) {
      console.error('데이터 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const employeesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          branchId: data.branchId,
          branchName: data.branchName,
          status: data.resignationDate ? 'inactive' : 'active',
          resignationDate: data.resignationDate?.toDate ? data.resignationDate.toDate() : undefined
        };
      }) as Employee[];
      
      // 재직 중인 직원만 필터링
      const activeEmployees = employeesData.filter(emp => emp.status === 'active');
      
      // 지점별 필터링
      const filteredEmployees = selectedBranchId 
        ? activeEmployees.filter(emp => emp.branchId === selectedBranchId)
        : activeEmployees;
        
      setEmployees(filteredEmployees);
    } catch (error) {
      console.error('직원 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      })) as Branch[];
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadSchedules = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        date: doc.data().date?.toDate() || new Date()
      })) as Schedule[];
      setSchedules(schedulesData);
    } catch (error) {
      console.error('스케줄 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadPayrollLocks = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'payrollLocks'));
      const locksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lockedAt: doc.data().lockedAt?.toDate() || new Date()
      })) as PayrollLock[];
      setPayrollLocks(locksData);
    } catch (error) {
      console.error('급여 잠금 상태를 불러올 수 없습니다:', error);
    }
  };

  const checkPayrollLock = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    
    const lock = payrollLocks.find(lock => 
      lock.year === year && 
      lock.month === month && 
      lock.branchId === selectedBranchId &&
      lock.isLocked
    );
    
    setIsLocked(!!lock);
  };

  // 월 변경 핸들러
  const handleMonthChange = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    setSelectedMonth(new Date(year, month - 1, 1));
  };

  // 해당 월의 날짜들 생성
  const getMonthDates = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    
    const dates = [];
    for (let day = 1; day <= lastDay.getDate(); day++) {
      dates.push(new Date(year, month, day));
    }
    return dates;
  };

  // 해당 날짜의 스케줄 가져오기
  const getScheduleForDate = (employeeId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return schedules.find(schedule => 
      schedule.employeeId === employeeId &&
      schedule.date.toISOString().split('T')[0] === dateString
    );
  };

  // 시간 계산 함수
  const calculateTotalHours = (startTime: string, endTime: string, breakTime: string) => {
    if (!startTime || !endTime) return 0;
    
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    const breakHours = parseFloat(breakTime) || 0;
    
    const totalHours = endHour - startHour - breakHours;
    return Math.max(0, totalHours);
  };

  // 스케줄 입력 파싱 함수
  const parseScheduleInput = (input: string) => {
    // 입력 형식: "10-22(2)" -> 시작시간: 10, 종료시간: 22, 휴식시간: 2
    const match = input.match(/^(\d{1,2})-(\d{1,2})(?:\((\d+(?:\.\d+)?)\))?$/);
    if (!match) return null;
    
    const [, startHour, endHour, breakTime = '0'] = match;
    return {
      startTime: `${startHour.padStart(2, '0')}:00`,
      endTime: `${endHour.padStart(2, '0')}:00`,
      breakTime: breakTime
    };
  };

  // 셀 편집 시작
  const handleCellEdit = (employeeId: string, date: Date) => {
    if (isLocked) {
      alert('급여 작업이 완료된 월은 수정할 수 없습니다.');
      return;
    }
    
    const dateString = date.toISOString().split('T')[0];
    setEditingCell({ employeeId, date: dateString });
    
    // 기존 스케줄이 있으면 입력 필드에 표시
    const existingSchedule = getScheduleForDate(employeeId, date);
    if (existingSchedule) {
      const inputValue = `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})`;
      setScheduleInputs(prev => ({
        ...prev,
        [`${employeeId}-${dateString}`]: inputValue
      }));
    }
  };

  // 셀 편집 완료
  const handleCellSave = async (employeeId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const inputKey = `${employeeId}-${dateString}`;
    const inputValue = scheduleInputs[inputKey] || '';
    
    if (!inputValue.trim()) {
      // 입력이 비어있으면 기존 스케줄 삭제
      const existingSchedule = getScheduleForDate(employeeId, date);
      if (existingSchedule) {
        try {
          await deleteDoc(doc(db, 'schedules', existingSchedule.id));
          await loadSchedules();
        } catch (error) {
          console.error('스케줄 삭제 오류:', error);
        }
      }
    } else {
      // 입력이 있으면 파싱하여 저장
      const parsed = parseScheduleInput(inputValue);
      if (parsed) {
        const employee = employees.find(emp => emp.id === employeeId);
        const branch = branches.find(branch => branch.id === selectedBranchId);
        
        if (employee && branch) {
          const totalHours = calculateTotalHours(parsed.startTime, parsed.endTime, parsed.breakTime);
          const existingSchedule = getScheduleForDate(employeeId, date);
          
          try {
            if (existingSchedule) {
              // 수정
              await updateDoc(doc(db, 'schedules', existingSchedule.id), {
                startTime: parsed.startTime,
                endTime: parsed.endTime,
                breakTime: parsed.breakTime,
                totalHours: totalHours,
                updatedAt: new Date()
              });
            } else {
              // 추가
              await addDoc(collection(db, 'schedules'), {
                employeeId: employeeId,
                employeeName: employee.name,
                branchId: selectedBranchId,
                branchName: branch.name,
                date: date,
                startTime: parsed.startTime,
                endTime: parsed.endTime,
                breakTime: parsed.breakTime,
                totalHours: totalHours,
                createdAt: new Date(),
                updatedAt: new Date()
              });
            }
            await loadSchedules();
          } catch (error) {
            console.error('스케줄 저장 오류:', error);
            alert('스케줄 저장 중 오류가 발생했습니다.');
          }
        }
      } else {
        alert('올바른 형식으로 입력해주세요. 예: 10-22(2)');
      }
    }
    
    setEditingCell(null);
    setScheduleInputs(prev => {
      const newInputs = { ...prev };
      delete newInputs[inputKey];
      return newInputs;
    });
  };

  // 셀 편집 취소
  const handleCellCancel = (employeeId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const inputKey = `${employeeId}-${dateString}`;
    
    setEditingCell(null);
    setScheduleInputs(prev => {
      const newInputs = { ...prev };
      delete newInputs[inputKey];
      return newInputs;
    });
  };

  // 주간 집계 계산
  const calculateWeeklySummary = () => {
    const monthDates = getMonthDates();
    const summary = employees.map(employee => {
      let totalHours = 0;
      let workDays = 0;
      
      monthDates.forEach(date => {
        const schedule = getScheduleForDate(employee.id, date);
        if (schedule) {
          totalHours += schedule.totalHours;
          workDays += 1;
        }
      });
      
      return {
        employeeName: employee.name,
        totalHours,
        workDays,
        averageHours: workDays > 0 ? totalHours / workDays : 0
      };
    });
    
    return summary;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  const monthDates = getMonthDates();
  const weeklySummary = calculateWeeklySummary();

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          스케줄 입력 (새 형식)
        </h3>
        {isLocked && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
            ⚠️ 급여 작업 완료로 인해 수정이 제한됩니다
          </div>
        )}
      </div>

      {/* 월 선택 */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">월 선택:</label>
          <input
            type="month"
            value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 입력 형식 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">입력 형식 안내</h4>
        <p className="text-sm text-blue-700">
          각 셀에 &quot;시작시간-종료시간(휴식시간)&quot; 형식으로 입력하세요. 예: 10-22(2)
        </p>
        <p className="text-sm text-blue-700 mt-1">
          &bull; 시작시간: 10 (10시) &bull; 종료시간: 22 (22시) &bull; 휴식시간: 2 (2시간)
        </p>
      </div>

      {/* 스케줄 입력 테이블 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점직원
                </th>
                {monthDates.map((date, index) => (
                  <th key={index} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {date.getDate()}({['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {employee.name}
                  </td>
                  {monthDates.map((date, index) => {
                    const dateString = date.toISOString().split('T')[0];
                    const inputKey = `${employee.id}-${dateString}`;
                    const isEditing = editingCell?.employeeId === employee.id && editingCell?.date === dateString;
                    const existingSchedule = getScheduleForDate(employee.id, date);
                    
                    return (
                      <td key={index} className="px-2 py-3 text-center">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={scheduleInputs[inputKey] || ''}
                              onChange={(e) => setScheduleInputs(prev => ({
                                ...prev,
                                [inputKey]: e.target.value
                              }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="10-22(2)"
                              autoFocus
                            />
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleCellSave(employee.id, date)}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => handleCellCancel(employee.id, date)}
                                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`px-2 py-1 text-xs rounded cursor-pointer hover:bg-gray-100 ${
                              existingSchedule ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-500'
                            } ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                            onClick={() => handleCellEdit(employee.id, date)}
                          >
                            {existingSchedule 
                              ? `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})`
                              : '클릭하여 입력'
                            }
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 주간 집계 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {selectedMonth.getFullYear()}년 {selectedMonth.getMonth() + 1}월 주간 집계
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
              {weeklySummary.map((summary, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {summary.employeeName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.workDays}일
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.totalHours.toFixed(1)}시간
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {summary.averageHours.toFixed(1)}시간
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
