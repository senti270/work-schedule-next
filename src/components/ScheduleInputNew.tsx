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
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  
  // 새로운 입력 형식 상태
  const [scheduleInputs, setScheduleInputs] = useState<{[key: string]: string}>({});
  const [editingCell, setEditingCell] = useState<{employeeId: string, date: string} | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{employeeId: string, date: Date} | null>(null);
  
  // 드래그 상태
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    sourceCell: {employeeId: string, date: Date} | null;
    targetCell: {employeeId: string, date: Date} | null;
    isCopyMode: boolean;
  }>({
    isDragging: false,
    sourceCell: null,
    targetCell: null,
    isCopyMode: false
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentWeekStart) {
      loadSchedules();
      checkPayrollLock();
    }
  }, [currentWeekStart, selectedBranchId]);

  // 전역 마우스 이벤트 리스너 추가
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.isDragging) {
        setDragState({
          isDragging: false,
          sourceCell: null,
          targetCell: null,
          isCopyMode: false
        });
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragState.isDragging) {
        // 드래그 중일 때 커서 변경
        document.body.style.cursor = dragState.isCopyMode ? 'copy' : 'move';
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.body.style.cursor = 'default';
    };
  }, [dragState.isDragging, dragState.isCopyMode]);

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
    // 1주 기간 동안 급여 잠금 상태 확인
    const weekDates = getWeekDates();
    let hasLockedWeek = false;
    
    weekDates.forEach(date => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      const lock = payrollLocks.find(lock => 
        lock.year === year && 
        lock.month === month && 
        lock.branchId === selectedBranchId &&
        lock.isLocked
      );
      
      if (lock) {
        hasLockedWeek = true;
      }
    });
    
    setIsLocked(hasLockedWeek);
  };

  // 주간 네비게이션 핸들러
  const goToPreviousWeek = () => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(newWeekStart.getDate() - 7); // 1주 전
    setCurrentWeekStart(newWeekStart);
  };

  const goToNextWeek = () => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(newWeekStart.getDate() + 7); // 1주 후
    setCurrentWeekStart(newWeekStart);
  };

  // 1주 기간의 날짜들 생성
  const getWeekDates = () => {
    const dates = [];
    const startDate = new Date(currentWeekStart);
    
    // 현재 주의 월요일로 설정
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);
    
    // 1주 (7일) 생성
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
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

  // 다음 셀 찾기 함수
  const getNextCell = (currentEmployeeId: string, currentDate: Date) => {
    const weekDates = getWeekDates();
    const currentEmployeeIndex = employees.findIndex(emp => emp.id === currentEmployeeId);
    const currentDateIndex = weekDates.findIndex(d => d.toDateString() === currentDate.toDateString());
    
    // 같은 직원의 다음 날짜
    if (currentDateIndex < weekDates.length - 1) {
      return {
        employeeId: currentEmployeeId,
        date: weekDates[currentDateIndex + 1]
      };
    }
    
    // 다음 직원의 첫 번째 날짜
    if (currentEmployeeIndex < employees.length - 1) {
      return {
        employeeId: employees[currentEmployeeIndex + 1].id,
        date: weekDates[0]
      };
    }
    
    // 마지막 셀이면 첫 번째 셀로
    return {
      employeeId: employees[0].id,
      date: weekDates[0]
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

  // Tab 키 이벤트 핸들러
  const handleKeyDown = (e: React.KeyboardEvent, employeeId: string, date: Date) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      // 현재 셀 저장
      handleCellSave(employeeId, date);
      
      // 다음 셀로 이동
      const nextCell = getNextCell(employeeId, date);
      setTimeout(() => {
        handleCellEdit(nextCell.employeeId, nextCell.date);
      }, 100);
    }
  };

  // 1주 집계 계산
  const calculateWeeklySummary = () => {
    const weekDates = getWeekDates();
    const summary = employees.map(employee => {
      const dailyHours = weekDates.map(date => {
        const schedule = getScheduleForDate(employee.id, date);
        return schedule ? schedule.totalHours : 0;
      });
      
      const totalHours = dailyHours.reduce((sum, hours) => sum + hours, 0);
      
      return {
        employeeName: employee.name,
        dailyHours,
        totalHours
      };
    });
    
    return summary;
  };

  // 마우스 호버 핸들러
  const handleMouseEnter = (employeeId: string, date: Date) => {
    const existingSchedule = getScheduleForDate(employeeId, date);
    if (existingSchedule && !isLocked) {
      setHoveredCell({ employeeId, date });
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  // 드래그 시작 (마우스 다운)
  const handleMouseDown = (e: React.MouseEvent, employeeId: string, date: Date) => {
    if (isLocked) return;
    
    const existingSchedule = getScheduleForDate(employeeId, date);
    if (!existingSchedule) return; // 스케줄이 없으면 드래그 불가
    
    const isCopyMode = e.ctrlKey;
    
    setDragState({
      isDragging: true,
      sourceCell: { employeeId, date },
      targetCell: null,
      isCopyMode
    });
    
    e.preventDefault();
  };

  // 드래그 중 (마우스 오버)
  const handleDragOver = (e: React.MouseEvent, employeeId: string, date: Date) => {
    if (!dragState.isDragging) return;
    
    setDragState(prev => ({
      ...prev,
      targetCell: { employeeId, date }
    }));
  };

  // 드래그 종료 (마우스 업)
  const handleMouseUp = async (e: React.MouseEvent) => {
    if (!dragState.isDragging || !dragState.sourceCell || !dragState.targetCell) {
      setDragState({
        isDragging: false,
        sourceCell: null,
        targetCell: null,
        isCopyMode: false
      });
      return;
    }

    const { sourceCell, targetCell, isCopyMode } = dragState;
    
    // 같은 셀이면 무시
    if (sourceCell.employeeId === targetCell.employeeId && 
        sourceCell.date.toDateString() === targetCell.date.toDateString()) {
      setDragState({
        isDragging: false,
        sourceCell: null,
        targetCell: null,
        isCopyMode: false
      });
      return;
    }

    const sourceSchedule = getScheduleForDate(sourceCell.employeeId, sourceCell.date);
    if (!sourceSchedule) return;

    const employee = employees.find(emp => emp.id === targetCell.employeeId);
    const branch = branches.find(branch => branch.id === selectedBranchId);
    
    if (employee && branch) {
      try {
        // 대상 셀에 스케줄 추가/수정
        const existingTargetSchedule = getScheduleForDate(targetCell.employeeId, targetCell.date);
        
        if (existingTargetSchedule) {
          // 수정
          await updateDoc(doc(db, 'schedules', existingTargetSchedule.id), {
            startTime: sourceSchedule.startTime,
            endTime: sourceSchedule.endTime,
            breakTime: sourceSchedule.breakTime,
            totalHours: sourceSchedule.totalHours,
            updatedAt: new Date()
          });
        } else {
          // 추가
          await addDoc(collection(db, 'schedules'), {
            employeeId: targetCell.employeeId,
            employeeName: employee.name,
            branchId: selectedBranchId,
            branchName: branch.name,
            date: targetCell.date,
            startTime: sourceSchedule.startTime,
            endTime: sourceSchedule.endTime,
            breakTime: sourceSchedule.breakTime,
            totalHours: sourceSchedule.totalHours,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }

        // 복사 모드가 아니면 원본 삭제
        if (!isCopyMode) {
          await deleteDoc(doc(db, 'schedules', sourceSchedule.id));
        }

        await loadSchedules();
      } catch (error) {
        console.error('드래그 작업 오류:', error);
        alert('드래그 작업 중 오류가 발생했습니다.');
      }
    }

    setDragState({
      isDragging: false,
      sourceCell: null,
      targetCell: null,
      isCopyMode: false
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  const weekDates = getWeekDates();
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

      {/* 주간 네비게이션 */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreviousWeek}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              ← 이전 주
            </button>
            <span className="text-lg font-medium">
              {weekDates[0].toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ~ {weekDates[6].toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
            </span>
            <button
              onClick={goToNextWeek}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              다음 주 →
            </button>
          </div>
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
        <p className="text-sm text-blue-700 mt-1">
          &bull; Tab: 다음 셀로 이동 &bull; 드래그: 시간 이동 &bull; Ctrl+드래그: 시간 복사
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
                {weekDates.map((date, index) => (
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
                  {weekDates.map((date, index) => {
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
                              onKeyDown={(e) => handleKeyDown(e, employee.id, date)}
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
                            className={`relative px-2 py-1 text-xs rounded cursor-pointer hover:bg-gray-100 ${
                              existingSchedule ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-500'
                            } ${isLocked ? 'cursor-not-allowed opacity-50' : ''} ${
                              dragState.isDragging && dragState.targetCell?.employeeId === employee.id && 
                              dragState.targetCell?.date.toDateString() === date.toDateString() 
                                ? 'bg-yellow-200 border-2 border-yellow-400' : ''
                            }`}
                            onClick={() => handleCellEdit(employee.id, date)}
                            onMouseDown={(e) => handleMouseDown(e, employee.id, date)}
                            onMouseEnter={() => handleMouseEnter(employee.id, date)}
                            onMouseLeave={handleMouseLeave}
                            onMouseOver={(e) => handleDragOver(e, employee.id, date)}
                            onMouseUp={handleMouseUp}
                            title={existingSchedule ? 
                              `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})` : 
                              '클릭하여 입력'
                            }
                          >
                            {existingSchedule 
                              ? `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})`
                              : '클릭하여 입력'
                            }
                            
                            {/* 드래그 아이콘 및 툴팁 */}
                            {hoveredCell?.employeeId === employee.id && 
                             hoveredCell?.date.toDateString() === date.toDateString() && 
                             existingSchedule && 
                             !isLocked && (
                              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                                <div className="flex items-center space-x-1">
                                  <span>↕️</span>
                                  <span>드래그: 이동</span>
                                  <span>|</span>
                                  <span>Ctrl+드래그: 복사</span>
                                </div>
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                              </div>
                            )}
                            
                            {/* 드래그 아이콘 */}
                            {hoveredCell?.employeeId === employee.id && 
                             hoveredCell?.date.toDateString() === date.toDateString() && 
                             existingSchedule && 
                             !isLocked && (
                              <div className="absolute top-0 right-0 transform translate-x-1 -translate-y-1 text-gray-600 text-xs">
                                ↕️
                              </div>
                            )}
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
            사람별 주간 집계
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이름
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  월
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  화
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  수
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  목
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  금
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  토
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  일
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  총합
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {weeklySummary.map((summary, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                    {summary.employeeName}
                  </td>
                  {summary.dailyHours.map((hours, dayIndex) => (
                    <td key={dayIndex} className="px-2 py-3 text-center text-sm text-gray-900">
                      {hours > 0 ? hours.toFixed(1) : '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                    {summary.totalHours.toFixed(1)}
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
