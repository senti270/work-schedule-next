'use client';

import { useState, useEffect, useCallback } from 'react';
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
  status?: 'active' | 'inactive';
  resignationDate?: Date;
  branchNames?: string[]; // 소속 지점명들
  weeklyWorkHours?: number; // 주간 근무시간
}

interface EmployeeBranch {
  id: string;
  employeeId: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  
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

  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [clickTimeout]);

  // 공유 기능
  const handleShare = async () => {
    try {
      const weekDates = getWeekDates();
      const branch = branches.find(b => b.id === selectedBranchId);
      
      if (!branch) {
        alert('지점 정보를 찾을 수 없습니다.');
        return;
      }

      // 현재 주간 스케줄 데이터 생성
      const scheduleData = employees.map(employee => {
        const dailySchedules = weekDates.map(date => {
          const schedule = getScheduleForDate(employee.id, date);
          return schedule ? `${schedule.startTime.split(':')[0]}-${schedule.endTime.split(':')[0]}(${schedule.breakTime})` : '-';
        });
        
        return {
          employeeName: employee.name,
          schedules: dailySchedules
        };
      });

      // 공유할 텍스트 생성
      const shareText = `📅 ${branch.name} 주간 스케줄 (${weekDates[0].toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ~ ${weekDates[6].toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })})\n\n` +
        scheduleData.map(emp => 
          `${emp.employeeName}: ${emp.schedules.join(' | ')}`
        ).join('\n');

      // 클립보드에 복사
      await navigator.clipboard.writeText(shareText);
      alert('스케줄이 클립보드에 복사되었습니다!');
      
    } catch (error) {
      console.error('공유 중 오류:', error);
      alert('공유 중 오류가 발생했습니다.');
    }
  };

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

  const loadEmployees = useCallback(async () => {
    try {
      // 모든 직원 로드
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      
      // 직원-지점 관계 로드
      const employeeBranchesSnapshot = await getDocs(collection(db, 'employeeBranches'));
      
      // 지점 목록 로드
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesMap = new Map();
      branchesSnapshot.docs.forEach(doc => {
        branchesMap.set(doc.id, doc.data().name);
      });
      
      // 직원-지점 관계를 Map으로 변환
      const employeeBranchesMap = new Map<string, EmployeeBranch[]>();
      employeeBranchesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const employeeBranch: EmployeeBranch = {
          id: doc.id,
          employeeId: data.employeeId,
          branchId: data.branchId,
          branchName: data.branchName,
          isActive: data.isActive !== false
        };
        
        if (!employeeBranchesMap.has(employeeBranch.employeeId)) {
          employeeBranchesMap.set(employeeBranch.employeeId, []);
        }
        employeeBranchesMap.get(employeeBranch.employeeId)!.push(employeeBranch);
      });
      
      const employeesData = employeesSnapshot.docs.map(doc => {
        const data = doc.data();
        const resignationDate = data.resignationDate?.toDate ? data.resignationDate.toDate() : undefined;
        
        // 직원의 지점명들 가져오기
        const employeeBranchList = employeeBranchesMap.get(doc.id) || [];
        let branchNames: string[] = [];
        
        if (employeeBranchList.length > 0) {
          // 새로운 EmployeeBranch 관계가 있는 경우
          branchNames = employeeBranchList
            .filter(eb => eb.isActive)
            .map(eb => eb.branchName);
        } else {
          // 기존 데이터 호환성 (branchId, branchName 사용)
          if (data.branchId) {
            const branchName = branchesMap.get(data.branchId);
            if (branchName) {
              branchNames = [branchName];
            }
          } else if (data.branchName) {
            branchNames = [data.branchName];
          }
        }
        
        return {
          id: doc.id,
          name: data.name || '',
          status: resignationDate ? 'inactive' : 'active',
          resignationDate: resignationDate,
          branchNames: branchNames,
          weeklyWorkHours: data.weeklyWorkHours || 40
        };
      }) as Employee[];
      
      // 재직 중인 직원만 필터링
      const activeEmployees = employeesData.filter(emp => emp.status === 'active');
      
      // 지점별 필터링
      const filteredEmployees = selectedBranchId 
        ? activeEmployees.filter(emp => {
            const selectedBranch = branches.find(b => b.id === selectedBranchId);
            return selectedBranch && emp.branchNames?.includes(selectedBranch.name);
          })
        : activeEmployees;
      
      setEmployees(filteredEmployees);
    } catch (error) {
      console.error('직원 목록을 불러올 수 없습니다:', error);
    }
  }, [selectedBranchId, branches]);

  // 지점이 변경될 때 직원 목록 다시 로드
  useEffect(() => {
    if (selectedBranchId) {
      loadEmployees();
    }
  }, [selectedBranchId, loadEmployees]);

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
    
    // 현재 주의 월요일로 설정 (원본을 변경하지 않도록 복사본 사용)
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = new Date(startDate);
    mondayDate.setDate(startDate.getDate() + mondayOffset);
    
    // 1주 (7일) 생성
    for (let i = 0; i < 7; i++) {
      const date = new Date(mondayDate);
      date.setDate(mondayDate.getDate() + i);
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

  // 셀 클릭 핸들러 (더블클릭과 구분)
  const handleCellClick = (employeeId: string, date: Date) => {
    if (isLocked) {
      alert('급여 작업이 완료된 월은 수정할 수 없습니다.');
      return;
    }

    // 기존 타임아웃이 있으면 클리어
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      return; // 더블클릭으로 처리
    }

    // 더블클릭을 기다리는 타임아웃 설정
    const timeout = setTimeout(() => {
      handleCellEdit(employeeId, date);
      setClickTimeout(null);
    }, 300); // 300ms 대기

    setClickTimeout(timeout);
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

  // 스케줄 삭제 (더블클릭)
  const handleScheduleDelete = async (employeeId: string, date: Date) => {
    if (isLocked) {
      alert('급여 작업이 완료된 월은 수정할 수 없습니다.');
      return;
    }

    // 클릭 타임아웃 클리어
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    const existingSchedule = getScheduleForDate(employeeId, date);
    if (!existingSchedule) {
      alert('삭제할 스케줄이 없습니다.');
      return;
    }

    const confirmDelete = window.confirm(
      `${existingSchedule.employeeName}의 ${date.toLocaleDateString('ko-KR')} 스케줄을 삭제하시겠습니까?\n` +
      `스케줄: ${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})`
    );

    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, 'schedules', existingSchedule.id));
        await loadSchedules();
      } catch (error) {
        console.error('스케줄 삭제 오류:', error);
        alert('스케줄 삭제 중 오류가 발생했습니다.');
      }
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

  // 키보드 이벤트 핸들러
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
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      // 현재 셀 저장
      handleCellSave(employeeId, date);
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
        totalHours,
        weeklyWorkHours: employee.weeklyWorkHours
      };
    }).filter(emp => emp.totalHours > 0); // 총 근무시간이 0보다 큰 직원만 필터링
    
    return summary;
  };

  // 이전 주 데이터가 있는지 확인하는 함수
  const hasPreviousWeekData = (employeeId: string) => {
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    
    const previousWeekSchedules = schedules.filter(schedule => {
      const scheduleDate = schedule.date;
      const weekStart = new Date(previousWeekStart);
      const weekEnd = new Date(previousWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      return schedule.employeeId === employeeId && 
             scheduleDate >= weekStart && 
             scheduleDate <= weekEnd;
    });
    
    return previousWeekSchedules.length > 0;
  };

  // 이전 주 데이터 복사 핸들러
  const handleCopyPreviousWeek = async (employeeId: string) => {
    if (isLocked) {
      alert('급여 작업이 완료되어 수정할 수 없습니다.');
      return;
    }

    const confirmMessage = `이전 주 데이터를 복사하시겠습니까?\n\n주의: 현재 입력된 데이터는 삭제됩니다.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // 이전 주 날짜 계산
      const previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      
      // 이전 주의 스케줄 데이터 가져오기
      const previousWeekSchedules = schedules.filter(schedule => {
        const scheduleDate = schedule.date;
        const weekStart = new Date(previousWeekStart);
        const weekEnd = new Date(previousWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        return schedule.employeeId === employeeId && 
               scheduleDate >= weekStart && 
               scheduleDate <= weekEnd;
      });

      if (previousWeekSchedules.length === 0) {
        alert('이전 주에 복사할 데이터가 없습니다.');
        return;
      }

      // 현재 주의 기존 스케줄 삭제
      const currentWeekSchedules = schedules.filter(schedule => {
        const scheduleDate = schedule.date;
        const weekStart = new Date(currentWeekStart);
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        return schedule.employeeId === employeeId && 
               scheduleDate >= weekStart && 
               scheduleDate <= weekEnd;
      });

      // 기존 스케줄 삭제
      for (const schedule of currentWeekSchedules) {
        await deleteDoc(doc(db, 'schedules', schedule.id));
      }

      // 이전 주 데이터를 현재 주로 복사
      const weekDates = getWeekDates();
      const branch = branches.find(b => b.id === selectedBranchId);
      
      for (const prevSchedule of previousWeekSchedules) {
        const prevDate = new Date(prevSchedule.date);
        const dayOfWeek = prevDate.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
        
        // getWeekDates()는 월요일부터 시작하는 배열 [월, 화, 수, 목, 금, 토, 일]
        // dayOfWeek를 배열 인덱스로 변환: 월요일(1)->0, 화요일(2)->1, ..., 일요일(0)->6
        const weekIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const targetDate = new Date(weekDates[weekIndex]);
        
        console.log('복사 중:', {
          prevDate: prevDate.toDateString(),
          dayOfWeek,
          weekIndex,
          targetDate: targetDate.toDateString(),
          schedule: `${prevSchedule.startTime}-${prevSchedule.endTime}(${prevSchedule.breakTime})`
        });
        
        await addDoc(collection(db, 'schedules'), {
          employeeId: employeeId,
          employeeName: prevSchedule.employeeName,
          branchId: selectedBranchId,
          branchName: branch?.name || '',
          date: targetDate,
          startTime: prevSchedule.startTime,
          endTime: prevSchedule.endTime,
          breakTime: prevSchedule.breakTime,
          totalHours: prevSchedule.totalHours,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // 스케줄 다시 로드
      await loadSchedules();
      alert('이전 주 데이터가 성공적으로 복사되었습니다.');
      
    } catch (error) {
      console.error('이전 주 데이터 복사 중 오류:', error);
      alert('데이터 복사 중 오류가 발생했습니다.');
    }
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
        <div className="flex items-center space-x-3">
          <button
            onClick={handleShare}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
            <span>공유</span>
          </button>
          {isLocked && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
              ⚠️ 급여 작업 완료로 인해 수정이 제한됩니다
            </div>
          )}
        </div>
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
          휴게시간 있는 경우: 시작시간-종료시간(휴식시간) &nbsp;&nbsp; ex) 10-22(2)
        </p>
        <p className="text-sm text-blue-700">
          휴게시간 없는 경우: 시작시간-종료시간 &nbsp;&nbsp; ex) 18-23
        </p>
        
        <h4 className="text-sm font-medium text-blue-800 mb-2 mt-3">입력 방법 안내</h4>
        <p className="text-sm text-blue-700">
          &bull; Enter: 저장 &bull; Tab: 다음 입력칸 이동 &bull; 드래그: 스케줄 이동 &bull; Ctrl+드래그: 스케줄 복사 &bull; 더블클릭: 스케줄 삭제
        </p>
        <p className="text-sm text-blue-700">
          &bull; 이름 옆 아이콘 클릭시 이전 주 데이터 복사
        </p>
      </div>

      {/* 스케줄 입력 테이블 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점직원
                </th>
                {weekDates.map((date, index) => (
                  <th key={index} className="w-24 px-1 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {date.getDate()}({['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="w-24 px-2 py-3 text-center text-sm font-medium text-gray-900 truncate">
                    <div className="flex items-center justify-center space-x-1">
                      <span>{employee.name}</span>
                      {hasPreviousWeekData(employee.id) && (
                        <button
                          onClick={() => handleCopyPreviousWeek(employee.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                          title="이전 주 데이터 복사"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                            <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                  {weekDates.map((date, index) => {
                    const dateString = date.toISOString().split('T')[0];
                    const inputKey = `${employee.id}-${dateString}`;
                    const isEditing = editingCell?.employeeId === employee.id && editingCell?.date === dateString;
                    const existingSchedule = getScheduleForDate(employee.id, date);
                    
                    return (
                      <td key={index} className="w-24 px-1 py-2 text-center">
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
                              className="w-full max-w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="10-22(2)"
                              autoFocus
                            />
                            <div className="flex space-x-1 justify-center">
                              <button
                                onClick={() => handleCellSave(employee.id, date)}
                                className="px-1 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => handleCellCancel(employee.id, date)}
                                className="px-1 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`relative px-1 py-1 text-xs rounded cursor-pointer hover:bg-gray-100 ${
                              existingSchedule ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-500'
                            } ${isLocked ? 'cursor-not-allowed opacity-50' : ''} ${
                              dragState.isDragging && dragState.targetCell?.employeeId === employee.id && 
                              dragState.targetCell?.date.toDateString() === date.toDateString() 
                                ? 'bg-yellow-200 border-2 border-yellow-400' : ''
                            }`}
                            onClick={() => handleCellClick(employee.id, date)}
                            onDoubleClick={() => handleScheduleDelete(employee.id, date)}
                            onMouseDown={(e) => handleMouseDown(e, employee.id, date)}
                            onMouseEnter={() => handleMouseEnter(employee.id, date)}
                            onMouseLeave={handleMouseLeave}
                            onMouseOver={(e) => handleDragOver(e, employee.id, date)}
                            onMouseUp={handleMouseUp}
                            title={existingSchedule ? 
                              `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime}) - 더블클릭: 삭제` : 
                              '클릭하여 입력'
                            }
                          >
                            <div className="truncate">
                              {existingSchedule 
                                ? `${existingSchedule.startTime.split(':')[0]}-${existingSchedule.endTime.split(':')[0]}(${existingSchedule.breakTime})`
                                : '클릭하여 입력'
                              }
                            </div>
                            
                            {/* 드래그 아이콘 및 툴팁 */}
                            {hoveredCell?.employeeId === employee.id && 
                             hoveredCell?.date.toDateString() === date.toDateString() && 
                             existingSchedule && 
                             !isLocked && (
                              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                                <div className="flex items-center space-x-1">
                                  <span>↕️</span>
                                  <span>드래그: 이동</span>
                                  <span>|</span>
                                  <span>Ctrl+드래그: 복사</span>
                                  <span>|</span>
                                  <span>🗑️ 더블클릭: 삭제</span>
                                </div>
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                              </div>
                            )}
                            
                            {/* 드래그 아이콘 */}
                            {hoveredCell?.employeeId === employee.id && 
                             hoveredCell?.date.toDateString() === date.toDateString() && 
                             existingSchedule && 
                             !isLocked && (
                              <div className="absolute top-0 right-0 transform translate-x-0.5 -translate-y-0.5 text-gray-600 text-xs">
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
              {weeklySummary.length > 0 ? (
                <>
                  {weeklySummary.map((summary, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                        {summary.employeeName}
                        {summary.weeklyWorkHours && (
                          <span className="text-xs text-gray-500 ml-1">
                            ({summary.weeklyWorkHours})
                          </span>
                        )}
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
                  {/* 합계 행 */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">
                      합계
                    </td>
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const dayTotal = weeklySummary.reduce((sum, summary) => sum + summary.dailyHours[dayIndex], 0);
                      return (
                        <td key={dayIndex} className="px-2 py-3 text-center text-sm font-bold text-gray-900">
                          {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">
                      {weeklySummary.reduce((sum, summary) => sum + summary.totalHours, 0).toFixed(1)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    이번 주에 등록된 스케줄이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
