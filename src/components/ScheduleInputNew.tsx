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

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  action?: 'click' | 'type' | 'drag' | 'keyboard';
  expectedValue?: string;
  completed: boolean;
}

interface TutorialState {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  showOverlay: boolean;
  // 미니 테이블 데이터
  miniTableData: {
    employees: Array<{id: string; name: string}>;
    schedules: Array<{id: string; employeeId: string; date: string; startTime: string; endTime: string; breakTime: string}>;
    inputs: {[key: string]: string};
    editingCell: {employeeId: string, date: string} | null;
    // 드래그 상태
    dragState: {
      isDragging: boolean;
      sourceCell: {employeeId: string, date: string} | null;
      targetCell: {employeeId: string, date: string} | null;
      isCopyMode: boolean;
    };
  };
}

export default function ScheduleInputNew({ selectedBranchId }: ScheduleInputNewProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [payrollLocks, setPayrollLocks] = useState<PayrollLock[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // 현재 날짜가 속한 주의 월요일을 기준으로 설정
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일이면 -6, 아니면 1-dayOfWeek
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return monday;
  });
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

  // 튜토리얼 상태
  const [tutorial, setTutorial] = useState<TutorialState>({
    isActive: false,
    currentStep: 0,
    steps: [
      {
        id: 'welcome',
        title: '스케줄 입력 튜토리얼에 오신 것을 환영합니다!',
        description: '아래 미니 테이블에서 실제로 기능들을 체험해보세요.',
        completed: false
      },
      {
        id: 'basic_input',
        title: '기본 입력 방법',
        description: '아래 테이블의 빈 셀을 클릭하여 "10-22(2)"를 입력해보세요.',
        action: 'type',
        expectedValue: '10-22(2)',
        completed: false
      },
      {
        id: 'tab_navigation',
        title: 'Tab 키로 이동하기',
        description: '입력 중인 셀에서 Tab 키를 눌러 다음 칸으로 이동해보세요.',
        action: 'keyboard',
        expectedValue: 'Tab',
        completed: false
      },
      {
        id: 'enter_save',
        title: 'Enter 키로 저장하기',
        description: '입력 중인 셀에서 Enter 키를 눌러 저장해보세요.',
        action: 'keyboard',
        expectedValue: 'Enter',
        completed: false
      },
      {
        id: 'drag_move',
        title: '드래그로 스케줄 이동하기',
        description: '아래 테이블에서 "09-18(1)" 스케줄을 드래그하여 다른 셀로 이동해보세요.',
        action: 'drag',
        completed: false
      },
      {
        id: 'ctrl_drag_copy',
        title: 'Ctrl+드래그로 스케줄 복사하기',
        description: 'Ctrl 키를 누른 상태에서 스케줄을 드래그하여 복사해보세요.',
        action: 'drag',
        completed: false
      },
      {
        id: 'double_click_delete',
        title: '더블클릭으로 스케줄 삭제하기',
        description: '아래 테이블의 "14-22(2)" 스케줄을 더블클릭하여 삭제해보세요.',
        action: 'click',
        completed: false
      },
      {
        id: 'complete',
        title: '튜토리얼 완료!',
        description: '모든 기능을 익히셨습니다. 이제 실제 스케줄 입력을 자유롭게 사용하세요!',
        completed: false
      }
    ],
    showOverlay: false,
    miniTableData: {
      employees: [
        { id: 'tutorial-emp1', name: '김직원' },
        { id: 'tutorial-emp2', name: '이직원' }
      ],
      schedules: [
        { id: 'tutorial-schedule1', employeeId: 'tutorial-emp1', date: '2024-01-01', startTime: '09:00', endTime: '18:00', breakTime: '1' },
        { id: 'tutorial-schedule2', employeeId: 'tutorial-emp1', date: '2024-01-02', startTime: '14:00', endTime: '22:00', breakTime: '2' }
      ],
      inputs: {},
      editingCell: null,
      dragState: {
        isDragging: false,
        sourceCell: null,
        targetCell: null,
        isCopyMode: false
      }
    }
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

  // 튜토리얼 관련 함수들
  const startTutorial = () => {
    setTutorial(prev => ({
      ...prev,
      isActive: true,
      currentStep: 0,
      showOverlay: true
    }));
  };

  const nextTutorialStep = () => {
    setTutorial(prev => {
      const newSteps = [...prev.steps];
      newSteps[prev.currentStep].completed = true;
      
      if (prev.currentStep < prev.steps.length - 1) {
        return {
          ...prev,
          currentStep: prev.currentStep + 1,
          steps: newSteps
        };
      } else {
        // 튜토리얼 완료
        return {
          ...prev,
          isActive: false,
          showOverlay: false,
          steps: newSteps
        };
      }
    });
  };

  const skipTutorial = () => {
    setTutorial(prev => ({
      ...prev,
      isActive: false,
      showOverlay: false
    }));
  };

  // 미니 테이블용 함수들
  const getMiniScheduleForDate = (employeeId: string, date: string) => {
    return tutorial.miniTableData.schedules.find(schedule => 
      schedule.employeeId === employeeId && schedule.date === date
    );
  };

  const handleMiniCellClick = (employeeId: string, date: string) => {
    if (!tutorial.isActive) return;
    
    setTutorial(prev => ({
      ...prev,
      miniTableData: {
        ...prev.miniTableData,
        editingCell: { employeeId, date }
      }
    }));
  };

  const handleMiniCellSave = (employeeId: string, date: string) => {
    const inputKey = `${employeeId}-${date}`;
    const inputValue = tutorial.miniTableData.inputs[inputKey] || '';
    
    if (inputValue.trim()) {
      // 스케줄 추가/수정
      const parsed = parseScheduleInput(inputValue);
      if (parsed) {
        setTutorial(prev => {
          const newSchedules = [...prev.miniTableData.schedules];
          const existingIndex = newSchedules.findIndex(s => s.employeeId === employeeId && s.date === date);
          
          const newSchedule = {
            id: `tutorial-schedule-${Date.now()}`,
            employeeId,
            date,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            breakTime: parsed.breakTime
          };
          
          if (existingIndex >= 0) {
            newSchedules[existingIndex] = newSchedule;
          } else {
            newSchedules.push(newSchedule);
          }
          
          return {
            ...prev,
            miniTableData: {
              ...prev.miniTableData,
              schedules: newSchedules,
              editingCell: null,
              inputs: { ...prev.miniTableData.inputs, [inputKey]: '' }
            }
          };
        });
        
        // 튜토리얼 체크
        checkTutorialAction('type', inputValue);
      }
    }
    
    setTutorial(prev => ({
      ...prev,
      miniTableData: {
        ...prev.miniTableData,
        editingCell: null
      }
    }));
  };

  const handleMiniKeyDown = (e: React.KeyboardEvent, employeeId: string, date: string) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      handleMiniCellSave(employeeId, date);
      checkTutorialAction('keyboard', 'Tab');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleMiniCellSave(employeeId, date);
      checkTutorialAction('keyboard', 'Enter');
    }
  };

  const handleMiniDoubleClick = (employeeId: string, date: string) => {
    setTutorial(prev => ({
      ...prev,
      miniTableData: {
        ...prev.miniTableData,
        schedules: prev.miniTableData.schedules.filter(s => 
          !(s.employeeId === employeeId && s.date === date)
        )
      }
    }));
    
    checkTutorialAction('double_click');
  };

  // 미니 테이블 드래그 함수들
  const handleMiniMouseDown = (e: React.MouseEvent, employeeId: string, date: string) => {
    const existingSchedule = getMiniScheduleForDate(employeeId, date);
    if (!existingSchedule) return; // 스케줄이 없으면 드래그 불가
    
    const isCopyMode = e.ctrlKey;
    
    setTutorial(prev => ({
      ...prev,
      miniTableData: {
        ...prev.miniTableData,
        dragState: {
          isDragging: true,
          sourceCell: { employeeId, date },
          targetCell: null,
          isCopyMode
        }
      }
    }));
  };

  const handleMiniDragOver = (e: React.MouseEvent, employeeId: string, date: string) => {
    if (!tutorial.miniTableData.dragState.isDragging) return;
    
    setTutorial(prev => ({
      ...prev,
      miniTableData: {
        ...prev.miniTableData,
        dragState: {
          ...prev.miniTableData.dragState,
          targetCell: { employeeId, date }
        }
      }
    }));
  };

  const handleMiniMouseUp = () => {
    const { dragState } = tutorial.miniTableData;
    
    if (!dragState.isDragging || !dragState.sourceCell || !dragState.targetCell) {
      setTutorial(prev => ({
        ...prev,
        miniTableData: {
          ...prev.miniTableData,
          dragState: {
            isDragging: false,
            sourceCell: null,
            targetCell: null,
            isCopyMode: false
          }
        }
      }));
      return;
    }

    const { sourceCell, targetCell, isCopyMode } = dragState;
    
    // 같은 셀이면 무시
    if (sourceCell.employeeId === targetCell.employeeId && sourceCell.date === targetCell.date) {
      setTutorial(prev => ({
        ...prev,
        miniTableData: {
          ...prev.miniTableData,
          dragState: {
            isDragging: false,
            sourceCell: null,
            targetCell: null,
            isCopyMode: false
          }
        }
      }));
      return;
    }

    const sourceSchedule = getMiniScheduleForDate(sourceCell.employeeId, sourceCell.date);
    if (!sourceSchedule) return;

    setTutorial(prev => {
      let newSchedules = [...prev.miniTableData.schedules];
      
      // 대상 셀에 스케줄 추가/수정
      const existingTargetIndex = newSchedules.findIndex(s => 
        s.employeeId === targetCell.employeeId && s.date === targetCell.date
      );
      
      const newSchedule = {
        id: `tutorial-schedule-${Date.now()}`,
        employeeId: targetCell.employeeId,
        date: targetCell.date,
        startTime: sourceSchedule.startTime,
        endTime: sourceSchedule.endTime,
        breakTime: sourceSchedule.breakTime
      };
      
      if (existingTargetIndex >= 0) {
        newSchedules[existingTargetIndex] = newSchedule;
      } else {
        newSchedules.push(newSchedule);
      }
      
      // 복사 모드가 아니면 원본 삭제
      if (!isCopyMode) {
        newSchedules = newSchedules.filter(s => 
          !(s.employeeId === sourceCell.employeeId && s.date === sourceCell.date && s.id === sourceSchedule.id)
        );
      }
      
      return {
        ...prev,
        miniTableData: {
          ...prev.miniTableData,
          schedules: newSchedules,
          dragState: {
            isDragging: false,
            sourceCell: null,
            targetCell: null,
            isCopyMode: false
          }
        }
      };
    });
    
    // 튜토리얼 체크
    checkTutorialAction('drag', { isCopyMode });
  };

  const checkTutorialAction = (action: string, data?: string | { isCopyMode: boolean }) => {
    if (!tutorial.isActive) return;
    
    const currentStep = tutorial.steps[tutorial.currentStep];
    if (!currentStep) return;

    let shouldComplete = false;

    switch (currentStep.id) {
      case 'basic_input':
        if (action === 'type' && typeof data === 'string' && data.includes('10-22(2)')) {
          shouldComplete = true;
        }
        break;
      case 'tab_navigation':
        if (action === 'keyboard' && data === 'Tab') {
          shouldComplete = true;
        }
        break;
      case 'enter_save':
        if (action === 'keyboard' && data === 'Enter') {
          shouldComplete = true;
        }
        break;
      case 'drag_move':
        if (action === 'drag' && data && typeof data === 'object' && !data.isCopyMode) {
          shouldComplete = true;
        }
        break;
      case 'ctrl_drag_copy':
        if (action === 'drag' && data && typeof data === 'object' && data.isCopyMode) {
          shouldComplete = true;
        }
        break;
      case 'double_click_delete':
        if (action === 'double_click') {
          shouldComplete = true;
        }
        break;
    }

    if (shouldComplete) {
      setTimeout(() => {
        nextTutorialStep();
      }, 1000);
    }
  };

  // 공유 기능
  const handleShare = async () => {
    try {
      const weekDates = getWeekDates();
      const branch = branches.find(b => b.id === selectedBranchId);
      
      if (!branch) {
        alert('지점 정보를 찾을 수 없습니다.');
        return;
      }

      // 공유 URL 생성
      const weekString = currentWeekStart.toISOString().split('T')[0];
      const shareUrl = `${window.location.origin}/public/schedule/${selectedBranchId || 'all'}/${weekString}`;

      // Web Share API 지원 확인
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${branch.name} 주간 스케줄`,
            text: `${branch.name} 주간 스케줄을 확인해보세요!`,
            url: shareUrl
          });
          return; // Web Share API 성공 시 여기서 종료
        } catch (error) {
          // 사용자가 공유를 취소한 경우는 에러로 처리하지 않음
          if (error instanceof Error && error.name !== 'AbortError') {
            console.log('Web Share API 실패, 클립보드 복사로 대체');
          } else {
            return; // 사용자가 취소한 경우
          }
        }
      }

      // 현재 주간 스케줄 데이터 생성
      const scheduleData = employees.map(employee => {
        const dailySchedules = weekDates.map(date => {
          const schedule = getScheduleForDate(employee.id, date);
          return schedule ? `${timeToDecimal(schedule.startTime)}-${timeToDecimal(schedule.endTime)}(${schedule.breakTime})` : '-';
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
        ).join('\n') + `\n\n🔗 공유 링크: ${shareUrl}`;

      // Web Share API를 지원하지 않거나 실패한 경우 클립보드 복사
      try {
        await navigator.clipboard.writeText(shareText);
        alert('스케줄이 클립보드에 복사되었습니다!');
      } catch (error) {
        // 클립보드 복사 실패 시 대체 방법
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('스케줄이 클립보드에 복사되었습니다!');
      }
      
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
    // currentWeekStart는 이미 월요일이므로 그대로 사용
    const mondayDate = new Date(currentWeekStart);
    
    // 1주 (7일) 생성
    for (let i = 0; i < 7; i++) {
      const date = new Date(mondayDate);
      date.setDate(mondayDate.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  // 해당 날짜의 스케줄 가져오기 (지점별 필터링 포함)
  const getScheduleForDate = (employeeId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return schedules.find(schedule => 
      schedule.employeeId === employeeId &&
      schedule.date.toISOString().split('T')[0] === dateString &&
      schedule.branchId === selectedBranchId // 지점별 필터링 추가
    );
  };

  // 시간을 소수점 형태로 변환하는 함수 (18:30 -> 18.5)
  const timeToDecimal = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (minutes === 0) {
      return hours.toString();
    } else {
      const decimalMinutes = minutes / 60;
      if (decimalMinutes === 0.5) {
        return `${hours}.5`;
      } else if (decimalMinutes === 0.25) {
        return `${hours}.25`;
      } else if (decimalMinutes === 0.75) {
        return `${hours}.75`;
      } else {
        return (hours + decimalMinutes).toString();
      }
    }
  };

  // 시간 겹침 검증 함수
  const checkTimeOverlap = (employeeId: string, date: Date, startTime: string, endTime: string, excludeScheduleId?: string) => {
    const dateString = date.toISOString().split('T')[0];
    
    // 해당 직원의 같은 날짜 모든 스케줄 확인 (모든 지점 포함)
    const employeeSchedules = schedules.filter(schedule => 
      schedule.employeeId === employeeId &&
      schedule.date.toISOString().split('T')[0] === dateString &&
      (excludeScheduleId ? schedule.id !== excludeScheduleId : true)
    );

    // 시간을 분 단위로 변환 (정확한 비교를 위해)
    const timeToMinutes = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);

    for (const schedule of employeeSchedules) {
      const existingStart = timeToMinutes(schedule.startTime);
      const existingEnd = timeToMinutes(schedule.endTime);
      
      // 시간 겹침 확인
      if ((newStart < existingEnd && newEnd > existingStart)) {
        const branchName = branches.find(b => b.id === schedule.branchId)?.name || '알 수 없는 지점';
        return {
          hasOverlap: true,
          conflictSchedule: schedule,
          branchName,
          message: `${timeToDecimal(schedule.startTime)}-${timeToDecimal(schedule.endTime)} (${branchName})와 시간이 겹칩니다.`
        };
      }
    }

    return { hasOverlap: false };
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
    // 입력 형식: "10-22(2)" 또는 "18.5-23" -> 시작시간: 10 또는 18.5, 종료시간: 22 또는 23, 휴식시간: 2
    const match = input.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:\((\d+(?:\.\d+)?)\))?$/);
    if (!match) return null;
    
    const [, startTimeStr, endTimeStr, breakTime = '0'] = match;
    
    // 소수점 시간을 시:분 형태로 변환
    const parseTime = (timeStr: string) => {
      const time = parseFloat(timeStr);
      const hours = Math.floor(time);
      const minutes = Math.round((time - hours) * 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };
    
    return {
      startTime: parseTime(startTimeStr),
      endTime: parseTime(endTimeStr),
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
      const inputValue = `${timeToDecimal(existingSchedule.startTime)}-${timeToDecimal(existingSchedule.endTime)}(${existingSchedule.breakTime})`;
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

    try {
      await deleteDoc(doc(db, 'schedules', existingSchedule.id));
      await loadSchedules();
      
      // 튜토리얼 체크
      checkTutorialAction('double_click');
    } catch (error) {
      console.error('스케줄 삭제 오류:', error);
      alert('스케줄 삭제 중 오류가 발생했습니다.');
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
          
          // 시간 겹침 검증
          const overlapCheck = checkTimeOverlap(
            employeeId, 
            date, 
            parsed.startTime, 
            parsed.endTime, 
            existingSchedule?.id // 기존 스케줄은 제외
          );
          
          if (overlapCheck.hasOverlap) {
            const confirmMessage = `⚠️ 시간 겹침 경고\n\n${employee.name}님의 ${overlapCheck.message}\n\n그래도 저장하시겠습니까?`;
            if (!confirm(confirmMessage)) {
              return; // 사용자가 취소한 경우
            }
          }
          
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
            
            // 튜토리얼 체크
            checkTutorialAction('type', inputValue);
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
      
      // 튜토리얼 체크
      checkTutorialAction('keyboard', 'Tab');
      
      // 현재 셀 저장
      handleCellSave(employeeId, date);
      
      // 다음 셀로 이동
      const nextCell = getNextCell(employeeId, date);
      setTimeout(() => {
        handleCellEdit(nextCell.employeeId, nextCell.date);
      }, 100);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      // 튜토리얼 체크
      checkTutorialAction('keyboard', 'Enter');
      
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

  // 이전 주 데이터가 있는지 확인하는 함수 (해당 지점만)
  const hasPreviousWeekData = (employeeId: string) => {
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    
    const previousWeekSchedules = schedules.filter(schedule => {
      const scheduleDate = schedule.date;
      const weekStart = new Date(previousWeekStart);
      const weekEnd = new Date(previousWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      return schedule.employeeId === employeeId && 
             schedule.branchId === selectedBranchId && // 해당 지점만 확인
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
      
      // 이전 주의 스케줄 데이터 가져오기 (해당 지점만)
      const previousWeekSchedules = schedules.filter(schedule => {
        const scheduleDate = schedule.date;
        const weekStart = new Date(previousWeekStart);
        const weekEnd = new Date(previousWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        return schedule.employeeId === employeeId && 
               schedule.branchId === selectedBranchId && // 해당 지점만
               scheduleDate >= weekStart && 
               scheduleDate <= weekEnd;
      });

      if (previousWeekSchedules.length === 0) {
        alert('이전 주에 복사할 데이터가 없습니다.');
        return;
      }

      // 현재 주의 기존 스케줄 삭제 (해당 지점만)
      const currentWeekSchedules = schedules.filter(schedule => {
        const scheduleDate = schedule.date;
        const weekStart = new Date(currentWeekStart);
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        return schedule.employeeId === employeeId && 
               schedule.branchId === selectedBranchId && // 해당 지점만
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
          schedule: `${timeToDecimal(prevSchedule.startTime)}-${timeToDecimal(prevSchedule.endTime)}(${prevSchedule.breakTime})`
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
      
      // 튜토리얼 체크
      checkTutorialAction('copy_previous_week');
      
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
        // 시간 겹침 검증 (드래그 대상 직원)
        const overlapCheck = checkTimeOverlap(
          targetCell.employeeId,
          targetCell.date,
          sourceSchedule.startTime,
          sourceSchedule.endTime
        );
        
        if (overlapCheck.hasOverlap) {
          const targetEmployee = employees.find(emp => emp.id === targetCell.employeeId);
          const confirmMessage = `⚠️ 시간 겹침 경고\n\n${targetEmployee?.name}님의 ${overlapCheck.message}\n\n그래도 이동/복사하시겠습니까?`;
          if (!confirm(confirmMessage)) {
            // 드래그 상태 초기화
            setDragState({
              isDragging: false,
              sourceCell: null,
              targetCell: null,
              isCopyMode: false
            });
            return;
          }
        }
        
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
        
        // 튜토리얼 체크
        checkTutorialAction('drag', { isCopyMode });
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
            onClick={startTutorial}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>튜토리얼</span>
          </button>
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
          휴게시간 있는 경우: 시작시간-종료시간(휴식시간) &nbsp;&nbsp; ex) 10-22(2), 18.5-23(1)
        </p>
        <p className="text-sm text-blue-700">
          휴게시간 없는 경우: 시작시간-종료시간 &nbsp;&nbsp; ex) 18-23, 18.5-23
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
                              `${timeToDecimal(existingSchedule.startTime)}-${timeToDecimal(existingSchedule.endTime)}(${existingSchedule.breakTime}) - 더블클릭: 삭제` : 
                              '클릭하여 입력'
                            }
                          >
                            <div className="truncate">
                              {existingSchedule 
                                ? `${timeToDecimal(existingSchedule.startTime)}-${timeToDecimal(existingSchedule.endTime)}(${existingSchedule.breakTime})`
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

      {/* 시간대별 근무 인원 히트맵 */}
      {weeklySummary.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">시간대별 근무 인원 현황</h3>
            <p className="text-sm text-gray-600 mt-1">특정 시간대에 몇 명이 근무하는지 확인할 수 있습니다</p>
          </div>
          <div className="p-6">
            {/* 시간대별 근무 인원 계산 */}
            {(() => {
              const weekDates = getWeekDates();
              const timeSlots = [];
              
              // 9시부터 23시까지 1시간 단위로 시간대 생성
              for (let hour = 9; hour <= 23; hour++) {
                timeSlots.push(hour);
              }
              
              // 각 시간대별로 근무 인원 계산
              const hourlyData = timeSlots.map(hour => {
                const dayData = weekDates.map(date => {
                  const workingEmployees = schedules.filter(schedule => {
                    const scheduleDate = schedule.date;
                    const isSameDate = scheduleDate.toDateString() === date.toDateString();
                    
                    if (!isSameDate) return false;
                    
                    // 시작시간과 종료시간을 숫자로 변환
                    const startHour = parseFloat(schedule.startTime.split(':')[0]) + 
                                    (parseFloat(schedule.startTime.split(':')[1]) / 60);
                    const endHour = parseFloat(schedule.endTime.split(':')[0]) + 
                                  (parseFloat(schedule.endTime.split(':')[1]) / 60);
                    
                    // 해당 시간대에 근무하는지 확인
                    return startHour <= hour && endHour > hour;
                  });
                  
                  return workingEmployees.length;
                });
                
                return { hour, dayData };
              });
              
              const maxCount = Math.max(...hourlyData.flatMap(d => d.dayData));
              
              return (
                <div className="space-y-4">
                  {/* 요일 헤더 */}
                  <div className="flex">
                    <div className="w-16 text-sm font-medium text-gray-700 text-center">시간</div>
                    {weekDates.map((date, index) => (
                      <div key={index} className="flex-1 text-center">
                        <div className="text-sm font-medium text-gray-700">
                          {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {['월', '화', '수', '목', '금', '토', '일'][index]}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 시간대별 히트맵 */}
                  <div className="space-y-1">
                    {hourlyData.map(({ hour, dayData }) => (
                      <div key={hour} className="flex items-center">
                        <div className="w-16 text-sm font-medium text-gray-700 text-center">
                          {hour}:00
                        </div>
                        {dayData.map((count, dayIndex) => {
                          const intensity = maxCount > 0 ? count / maxCount : 0;
                          const bgColor = count === 0 ? 'bg-gray-100' :
                                        count === 1 ? 'bg-green-200' :
                                        count === 2 ? 'bg-green-400' :
                                        count === 3 ? 'bg-yellow-400' :
                                        count >= 4 ? 'bg-red-400' : 'bg-gray-200';
                          
                          return (
                            <div 
                              key={dayIndex} 
                              className={`flex-1 h-8 border border-gray-200 flex items-center justify-center text-xs font-medium transition-all duration-200 hover:scale-105 ${bgColor}`}
                              title={`${weekDates[dayIndex].toLocaleDateString('ko-KR')} ${hour}:00 - ${count}명 근무`}
                            >
                              {count > 0 && (
                                <span className={`${count >= 4 ? 'text-white' : 'text-gray-800'}`}>
                                  {count}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  
                  {/* 범례 */}
                  <div className="mt-6 flex justify-center space-x-6 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
                      <span className="text-gray-600">0명</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-green-200 rounded"></div>
                      <span className="text-gray-600">1명</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-green-400 rounded"></div>
                      <span className="text-gray-600">2명</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-yellow-400 rounded"></div>
                      <span className="text-gray-600">3명</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-red-400 rounded"></div>
                      <span className="text-gray-600">4명 이상</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 튜토리얼 모달 */}
      {tutorial.isActive && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {tutorial.steps[tutorial.currentStep]?.title}
                </h3>
                <button
                  onClick={skipTutorial}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-gray-600 mb-6">
                {tutorial.steps[tutorial.currentStep]?.description}
              </p>
              
              {/* 미니 스케줄 테이블 */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">체험용 스케줄 테이블</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded border">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-xs font-medium text-gray-500 border-r">직원</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray-500 border-r">월</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray-500 border-r">화</th>
                        <th className="px-3 py-2 text-xs font-medium text-gray-500">수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tutorial.miniTableData.employees.map((employee) => (
                        <tr key={employee.id}>
                          <td className="px-3 py-2 text-xs font-medium text-gray-900 border-r border-b">
                            {employee.name}
                          </td>
                          {['2024-01-01', '2024-01-02', '2024-01-03'].map((date) => {
                            const existingSchedule = getMiniScheduleForDate(employee.id, date);
                            const isEditing = tutorial.miniTableData.editingCell?.employeeId === employee.id && 
                                            tutorial.miniTableData.editingCell?.date === date;
                            const inputKey = `${employee.id}-${date}`;
                            
                            return (
                              <td 
                                key={date}
                                className="px-2 py-1 text-xs border-r border-b min-w-[80px] h-8"
                              >
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={tutorial.miniTableData.inputs[inputKey] || ''}
                                    onChange={(e) => setTutorial(prev => ({
                                      ...prev,
                                      miniTableData: {
                                        ...prev.miniTableData,
                                        inputs: {
                                          ...prev.miniTableData.inputs,
                                          [inputKey]: e.target.value
                                        }
                                      }
                                    }))}
                                    onKeyDown={(e) => handleMiniKeyDown(e, employee.id, date)}
                                    onBlur={() => handleMiniCellSave(employee.id, date)}
                                    className="w-full text-xs px-1 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="10-22(2)"
                                    autoFocus
                                  />
                                ) : (
                                  <div
                                    className={`w-full h-full flex items-center justify-center cursor-pointer hover:bg-blue-50 rounded ${
                                      tutorial.miniTableData.dragState.isDragging && 
                                      tutorial.miniTableData.dragState.sourceCell?.employeeId === employee.id && 
                                      tutorial.miniTableData.dragState.sourceCell?.date === date 
                                        ? 'bg-blue-200 border-2 border-blue-400' : ''
                                    } ${
                                      tutorial.miniTableData.dragState.isDragging && 
                                      tutorial.miniTableData.dragState.targetCell?.employeeId === employee.id && 
                                      tutorial.miniTableData.dragState.targetCell?.date === date 
                                        ? 'bg-yellow-200 border-2 border-yellow-400' : ''
                                    }`}
                                    onClick={() => handleMiniCellClick(employee.id, date)}
                                    onDoubleClick={() => handleMiniDoubleClick(employee.id, date)}
                                    onMouseDown={(e) => handleMiniMouseDown(e, employee.id, date)}
                                    onMouseOver={(e) => handleMiniDragOver(e, employee.id, date)}
                                    onMouseUp={handleMiniMouseUp}
                                    title={existingSchedule ? 
                                      `${existingSchedule.startTime}-${existingSchedule.endTime}(${existingSchedule.breakTime}) - 더블클릭: 삭제, 드래그: 이동` : 
                                      '클릭하여 입력'
                                    }
                                  >
                                    {existingSchedule ? (
                                      <span className="text-xs text-gray-700">
                                        {existingSchedule.startTime}-{existingSchedule.endTime}({existingSchedule.breakTime})
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">클릭</span>
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
                <div className="mt-3 text-xs text-gray-500">
                  💡 팁: 셀을 클릭하여 입력하고, Tab/Enter로 저장하세요. 스케줄이 있는 셀을 더블클릭하면 삭제되고, 드래그하면 이동됩니다. Ctrl+드래그로 복사도 가능합니다.
                </div>
              </div>
              
              {/* 진행률 표시 */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>진행률</span>
                  <span>{tutorial.currentStep + 1} / {tutorial.steps.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((tutorial.currentStep + 1) / tutorial.steps.length) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              {/* 단계별 체크리스트 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">학습 단계</h4>
                <div className="space-y-1">
                  {tutorial.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center space-x-2 text-sm">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        index < tutorial.currentStep ? 'bg-green-500' : 
                        index === tutorial.currentStep ? 'bg-blue-500' : 'bg-gray-300'
                      }`}>
                        {index < tutorial.currentStep ? (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : index === tutorial.currentStep ? (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        ) : null}
                      </div>
                      <span className={`${
                        index <= tutorial.currentStep ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {step.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={skipTutorial}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  건너뛰기
                </button>
                <button
                  onClick={nextTutorialStep}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {tutorial.currentStep === tutorial.steps.length - 1 ? '완료' : '다음'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
