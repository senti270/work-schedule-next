'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// import DateInput from './DateInput'; // 사용하지 않음

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

interface WeeklySummary {
  employeeName: string;
  dailyHours: { [key: string]: number };
  totalHours: number;
}

interface Employee {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
}

interface Branch {
  id: string;
  name: string;
}

interface EditingSchedule {
  id?: string;
  employeeId: string;
  branchId: string;
  date: Date;
  startTime: string;
  endTime: string;
  breakTime: string;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: '월', fullLabel: '월요일' },
  { key: 'tuesday', label: '화', fullLabel: '화요일' },
  { key: 'wednesday', label: '수', fullLabel: '수요일' },
  { key: 'thursday', label: '목', fullLabel: '목요일' },
  { key: 'friday', label: '금', fullLabel: '금요일' },
  { key: 'saturday', label: '토', fullLabel: '토요일' },
  { key: 'sunday', label: '일', fullLabel: '일요일' }
];

interface MultiWeekScheduleViewProps {
  selectedBranchId?: string;
}

export default function MultiWeekScheduleView({ selectedBranchId }: MultiWeekScheduleViewProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // 현재 날짜가 속한 주의 월요일을 기준으로 설정
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일이면 -6, 아니면 1-dayOfWeek
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return monday;
  });
  const numberOfWeeks = 4; // 고정값으로 변경
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState<EditingSchedule | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [dateInputs, setDateInputs] = useState<{[key: string]: string}>({});
  // const [weeklySummary, setWeeklySummary] = useState<WeeklySummary[]>([]); // 사용하지 않음
  const [invalidEmployees, setInvalidEmployees] = useState<{[key: string]: string[]}>({});
  const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isCopyMode, setIsCopyMode] = useState<boolean>(false);

  useEffect(() => {
    // 이번 주 월요일로 설정
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    setCurrentWeekStart(monday);
  }, []);

  useEffect(() => {
    if (currentWeekStart) {
      loadSchedules();
      loadEmployees();
      loadBranches();
    }
  }, [currentWeekStart]);

  const generateWeeklySummary = useCallback((weekStart: Date, currentDateInputs?: {[key: string]: string}) => {
    const weekDates = getWeekDates(weekStart);
    const summaryMap = new Map<string, WeeklySummary>();
    const inputsToUse = currentDateInputs || dateInputs;

    console.log('=== 주간 집계 생성 시작 ===');
    console.log('주간 날짜들:', weekDates.map(d => d.toDateString()));
    console.log('사용할 입력 데이터:', inputsToUse);

    // 주간 스케줄 필터링
    let weekSchedules = schedules.filter(schedule => {
      const scheduleDate = new Date(schedule.date);
      return weekDates.some(weekDate => 
        scheduleDate.toDateString() === weekDate.toDateString()
      );
    });
    
    console.log('기존 스케줄들:', weekSchedules);
    
    // 지점 필터링
    if (selectedBranchId) {
      weekSchedules = weekSchedules.filter(schedule => 
        schedule.branchId === selectedBranchId
      );
      console.log('지점 필터링 후 스케줄들:', weekSchedules);
    }

    // 각 직원별로 요일별 근무시간 계산 (기존 스케줄)
    weekSchedules.forEach(schedule => {
      const employeeName = schedule.employeeName;
      const scheduleDate = new Date(schedule.date);
      const dayOfWeek = DAYS_OF_WEEK[scheduleDate.getDay() === 0 ? 6 : scheduleDate.getDay() - 1];

      if (!summaryMap.has(employeeName)) {
        summaryMap.set(employeeName, {
          employeeName,
          dailyHours: {},
          totalHours: 0
        });
      }

      const summary = summaryMap.get(employeeName)!;
      summary.dailyHours[dayOfWeek.key] = schedule.totalHours;
      summary.totalHours += schedule.totalHours;
    });

    // 입력된 스케줄 추가 (실시간 반영) - 여러 명 모두 처리
    console.log('=== 입력된 스케줄 처리 시작 ===');
    console.log('현재 입력 데이터:', inputsToUse);
    console.log('dateInputs 상태 타입:', typeof inputsToUse);
    console.log('dateInputs 키들:', Object.keys(inputsToUse));
    console.log('직원 목록:', employees);
    
    weekDates.forEach((date, dayIndex) => {
      const dateKey = date.toISOString().split('T')[0];
      const inputText = inputsToUse[dateKey] || '';
      
      console.log(`${dateKey} 입력 텍스트:`, inputText);
      
      if (inputText.trim()) {
        const inputSchedules = parseScheduleInput(inputText);
        console.log(`${dateKey} 입력 파싱 결과:`, inputSchedules);
        
        inputSchedules.forEach(inputSchedule => {
          console.log('입력 스케줄 처리 중:', inputSchedule);
          const employee = employees.find(e => e.name === inputSchedule.employeeName);
          console.log('찾은 직원:', employee);
          
          const employeeName = inputSchedule.employeeName;
          
          // 직원 이름 검증 (상태 업데이트는 함수 외부에서 처리)
          if (employees.length > 0 && !employee) {
            console.log(`잘못된 직원 이름: ${employeeName}`);
            return; // 잘못된 직원은 집계에서 제외
          }
          
          // 지점 필터링 - 선택된 지점의 직원만 집계에 포함
          if (selectedBranchId && employee && employee.branchId !== selectedBranchId) {
            console.log(`다른 지점 직원 제외: ${employeeName} (지점: ${employee.branchId})`);
            return; // 다른 지점 직원은 집계에서 제외
          }
          
          // 유효한 직원만 집계에 포함
          const totalHours = calculateTotalHours(
            inputSchedule.startTime, 
            inputSchedule.endTime, 
            inputSchedule.breakTime
          );
          
          const dayOfWeek = DAYS_OF_WEEK[dayIndex];
          
          if (!summaryMap.has(employeeName)) {
            summaryMap.set(employeeName, {
              employeeName: employeeName,
              dailyHours: {},
              totalHours: 0
            });
            console.log(`새 직원 추가: ${employeeName}`);
          }

          const summary = summaryMap.get(employeeName)!;
          // 기존 시간이 있으면 더하기 (같은 날 여러 번 근무)
          const existingHours = summary.dailyHours[dayOfWeek.key] || 0;
          summary.dailyHours[dayOfWeek.key] = existingHours + totalHours;
          summary.totalHours += totalHours;
          
          console.log(`${employeeName} ${dayOfWeek.label}요일 ${totalHours}시간 추가 (기존: ${existingHours}시간, 총: ${summary.dailyHours[dayOfWeek.key]}시간)`);
        });
      }
    });

    const finalSummary = Array.from(summaryMap.values());
    console.log('=== 최종 집계 결과 ===');
    console.log('집계된 직원들:', finalSummary);
    console.log('=== 주간 집계 생성 완료 ===');
    
    return finalSummary;
  }, [schedules, employees, dateInputs, selectedBranchId]);

  const updateWeeklySummary = useCallback(() => {
    // 모든 주간의 집계를 다시 계산
    const allSummaries: WeeklySummary[] = [];
    
    for (let weekIndex = 0; weekIndex < numberOfWeeks; weekIndex++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() + (weekIndex * 7));
      const weekSummary = generateWeeklySummary(weekStart);
      allSummaries.push(...weekSummary);
    }
    
    console.log('업데이트된 주간집계:', allSummaries);
    // setWeeklySummary(allSummaries); // 주석 처리됨
  }, [currentWeekStart, generateWeeklySummary]);

  // 데이터가 로드되면 주간집계 업데이트
  useEffect(() => {
    console.log('=== useEffect 트리거 ===');
    console.log('employees.length:', employees.length);
    console.log('schedules.length:', schedules.length);
    console.log('dateInputs:', dateInputs);
    console.log('currentWeekStart:', currentWeekStart);
    console.log('numberOfWeeks:', numberOfWeeks);
    
    // 직원 데이터가 있거나 입력 데이터가 있으면 집계 업데이트
    if (employees.length > 0 || Object.keys(dateInputs).length > 0) {
      console.log('updateWeeklySummary 호출');
      updateWeeklySummary();
    } else {
      console.log('직원 데이터와 입력 데이터가 모두 없어서 updateWeeklySummary 호출하지 않음');
    }
  }, [schedules, employees, dateInputs, currentWeekStart, updateWeeklySummary]);

  const loadSchedules = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      console.log('=== 직원 목록 로드 시작 ===');
      const querySnapshot = await getDocs(collection(db, 'employees'));
      console.log('Firebase에서 가져온 문서 수:', querySnapshot.docs.length);
      
      const employeesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log(`직원 문서 ${doc.id}:`, data);
        return {
          id: doc.id,
          name: data.name,
          branchName: data.branchName
        };
      }) as Employee[];
      
      console.log('로드된 직원 목록:', employeesData);
      
      setEmployees(employeesData);
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



  const getWeekDates = (weekStart: Date) => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const getSchedulesForDate = (date: Date) => {
    let filteredSchedules = schedules.filter(schedule => 
      schedule.date.toDateString() === date.toDateString()
    );
    
    // 지점 필터링
    if (selectedBranchId) {
      filteredSchedules = filteredSchedules.filter(schedule => 
        schedule.branchId === selectedBranchId
      );
    }
    
    return filteredSchedules;
  };

  const formatDecimalTime = (decimalTime: string) => {
    const decimal = parseFloat(decimalTime);
    if (decimal === 0) return '';
    
    return `(${decimal})`;
  };

  const formatScheduleDisplay = (schedule: Schedule) => {
    // 시:분 형태를 소수점 형태로 변환 (18:30 -> 18.5)
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
    
    const startTimeDisplay = timeToDecimal(schedule.startTime);
    const endTimeDisplay = timeToDecimal(schedule.endTime);
    const breakTime = schedule.breakTime !== '0' ? formatDecimalTime(schedule.breakTime) : '';
    
    return `${schedule.employeeName} ${startTimeDisplay}-${endTimeDisplay}${breakTime}`;
  };

  const calculateTotalHours = (startTime: string, endTime: string, breakTime: string) => {
    if (!startTime || !endTime) return 0;
    
    try {
      // 시간 문자열에서 시간과 분 추출 (예: "10:00" -> 10, "18:00" -> 18)
      const startHour = parseInt(startTime.split(':')[0]);
      const endHour = parseInt(endTime.split(':')[0]);
      const breakHours = parseFloat(breakTime) || 0;
      
      // 유효성 검사
      if (isNaN(startHour) || isNaN(endHour) || isNaN(breakHours)) {
        console.log('유효하지 않은 시간 값:', { startTime, endTime, breakTime });
        return 0;
      }
      
      // 총 근무시간 = 종료시간 - 시작시간 - 휴식시간
      const totalHours = endHour - startHour - breakHours;
      
      console.log(`시간 계산: ${startHour}시 - ${endHour}시 - ${breakHours}시간 휴식 = ${totalHours}시간`);
      
      return Math.max(0, totalHours);
    } catch (error) {
      console.error('시간 계산 중 오류:', error, { startTime, endTime, breakTime });
      return 0;
    }
  };

  const handleScheduleClick = (schedule: Schedule) => {
    setEditingSchedule({
      id: schedule.id,
      employeeId: schedule.employeeId,
      branchId: schedule.branchId,
      date: new Date(schedule.date),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      breakTime: schedule.breakTime
    });
  };


  const handleSaveSchedule = async () => {
    if (!editingSchedule) return;

    if (!editingSchedule.employeeId || !editingSchedule.branchId || !editingSchedule.startTime || !editingSchedule.endTime) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      const selectedEmployee = employees.find(e => e.id === editingSchedule.employeeId);
      const selectedBranch = branches.find(b => b.id === editingSchedule.branchId);
      
      if (!selectedEmployee || !selectedBranch) {
        alert('직원 또는 지점 정보를 찾을 수 없습니다.');
        return;
      }

      const totalHours = calculateTotalHours(
        editingSchedule.startTime, 
        editingSchedule.endTime, 
        editingSchedule.breakTime
      );

      if (editingSchedule.id) {
        // 수정
        await updateDoc(doc(db, 'schedules', editingSchedule.id), {
          employeeId: editingSchedule.employeeId,
          employeeName: selectedEmployee.name,
          branchId: editingSchedule.branchId,
          branchName: selectedBranch.name,
          date: editingSchedule.date,
          startTime: editingSchedule.startTime,
          endTime: editingSchedule.endTime,
          breakTime: editingSchedule.breakTime,
          totalHours: totalHours,
          updatedAt: new Date()
        });
      } else {
        // 🔥 중복 체크: 같은 직원, 같은 날짜, 같은 지점에 이미 스케줄이 있는지 확인
        const existingSchedule = schedules.find(schedule => 
          schedule.employeeId === editingSchedule.employeeId &&
          schedule.branchId === editingSchedule.branchId &&
          schedule.date.toDateString() === editingSchedule.date.toDateString()
        );
        
        if (existingSchedule) {
          alert('해당 직원의 해당 날짜에 이미 스케줄이 있습니다. 기존 스케줄을 수정하거나 삭제 후 다시 시도해주세요.');
          return;
        }
        
        // 추가
        await addDoc(collection(db, 'schedules'), {
          employeeId: editingSchedule.employeeId,
          employeeName: selectedEmployee.name,
          branchId: editingSchedule.branchId,
          branchName: selectedBranch.name,
          date: editingSchedule.date,
          startTime: editingSchedule.startTime,
          endTime: editingSchedule.endTime,
          breakTime: editingSchedule.breakTime,
          totalHours: totalHours,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      setEditingSchedule(null);
      setShowAddForm(false);
      loadSchedules();
    } catch (error) {
      console.error('스케줄 저장 오류:', error);
      alert('스케줄 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (confirm('정말로 이 스케줄을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'schedules', scheduleId));
        loadSchedules();
      } catch (error) {
        console.error('스케줄 삭제 오류:', error);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingSchedule(null);
    setShowAddForm(false);
  };

  const parseScheduleInput = (text: string) => {
    const lines = text.trim().split('\n');
    const schedules = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      try {
        // "이진영 10-11" 또는 "이진영10-11" 또는 "이진영 18.5-22" 형태의 텍스트를 파싱
        // 정규표현식으로 이름과 시간을 분리 (공백 유무에 관계없이, 소수점 시간 지원)
        const scheduleMatch = trimmedLine.match(/^([가-힣a-zA-Z]+)\s*(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:\((\d+(?:\.\d+)?)\))?$/);
        if (!scheduleMatch) {
          console.log('스케줄 파싱 실패:', trimmedLine);
          continue;
        }
        
        const employeeName = scheduleMatch[1];
        const startTimeStr = scheduleMatch[2];
        const endTimeStr = scheduleMatch[3];
        const breakTime = scheduleMatch[4] || '0';
        
        // 소수점 시간을 시:분 형태로 변환
        const parseTime = (timeStr: string) => {
          const time = parseFloat(timeStr);
          const hours = Math.floor(time);
          const minutes = Math.round((time - hours) * 60);
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        };
        
        const startTime = parseTime(startTimeStr);
        const endTime = parseTime(endTimeStr);
        
        // 유효성 검사
        const startHourNum = parseFloat(startTimeStr);
        const endHourNum = parseFloat(endTimeStr);
        if (isNaN(startHourNum) || isNaN(endHourNum) || startHourNum < 0 || endHourNum < 0 || startHourNum > 23 || endHourNum > 23) {
          console.log('유효하지 않은 시간:', { startHourNum, endHourNum });
          continue;
        }
        
        const schedule = {
          employeeName,
          startTime,
          endTime,
          breakTime
        };
        
        console.log('파싱된 스케줄:', schedule);
        schedules.push(schedule);
      } catch (error) {
        console.error('스케줄 파싱 중 오류:', error, '입력:', trimmedLine);
        continue;
      }
    }
    
    console.log('전체 파싱 결과:', schedules);
    return schedules;
  };

  const handleDateInputChange = (dateKey: string, value: string) => {
    console.log('=== handleDateInputChange 호출 ===');
    console.log('dateKey:', dateKey);
    console.log('value:', value);
    console.log('employees.length:', employees.length);
    
    setDateInputs(prev => {
      const newInputs = {
        ...prev,
        [dateKey]: value
      };
      console.log('dateInputs 업데이트 전:', prev);
      console.log('dateInputs 업데이트 후:', newInputs);
      return newInputs;
    });
    
    // 입력이 변경되면 해당 날짜의 잘못된 직원 이름 초기화
    setInvalidEmployees(prev => {
      const newInvalid = { ...prev };
      delete newInvalid[dateKey];
      return newInvalid;
    });
    
    // 실시간 파싱 및 잘못된 직원 이름 검증
    const schedules = parseScheduleInput(value);
    console.log('파싱된 스케줄:', schedules);
    
    // 잘못된 직원 이름 검증 및 상태 업데이트
    if (employees.length > 0 && schedules.length > 0) {
      const invalidNames: string[] = [];
      schedules.forEach(schedule => {
        const employee = employees.find(e => e.name === schedule.employeeName);
        if (!employee) {
          invalidNames.push(schedule.employeeName);
        }
      });
      
      if (invalidNames.length > 0) {
        setInvalidEmployees(prev => ({
          ...prev,
          [dateKey]: invalidNames
        }));
      }
    }
    
    console.log('=== handleDateInputChange 완료 ===');
  };

  const saveAllSchedules = async () => {
    try {
      // 모든 주간의 입력된 스케줄을 수집
      const allSchedulesToSave: Array<{date: Date, employee: Employee, schedule: {employeeName: string, startTime: string, endTime: string, breakTime: string}}> = [];
      
      for (let weekIndex = 0; weekIndex < numberOfWeeks; weekIndex++) {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(currentWeekStart.getDate() + (weekIndex * 7));
        const weekDates = getWeekDates(weekStart);
        
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const date = weekDates[dayIndex];
          const dateKey = date.toISOString().split('T')[0];
          const inputText = dateInputs[dateKey];
          
          if (inputText && inputText.trim()) {
            const schedules = parseScheduleInput(inputText);
            schedules.forEach(schedule => {
              const employee = employees.find(e => e.name === schedule.employeeName);
              
              if (employee) {
                allSchedulesToSave.push({
                  date,
                  employee,
                  schedule
                });
              }
            });
          }
        }
      }
      
      // 기존 스케줄 삭제 (저장할 날짜들만)
      const datesToDelete = [...new Set(allSchedulesToSave.map(s => s.date.toDateString()))];
      const existingSchedules = schedules.filter(schedule => 
        datesToDelete.includes(schedule.date.toDateString())
      );
      
      for (const schedule of existingSchedules) {
        await deleteDoc(doc(db, 'schedules', schedule.id));
      }
      
      // 새 스케줄 추가
      for (const { date, employee, schedule } of allSchedulesToSave) {
        const totalHours = calculateTotalHours(schedule.startTime, schedule.endTime, schedule.breakTime);
        
        // branchName이 없는 경우 branches에서 찾기
        const currentBranchId = selectedBranchId || employee.branchId;
        const currentBranch = branches.find(b => b.id === currentBranchId);
        const branchName = employee.branchName || currentBranch?.name || '';
        
        await addDoc(collection(db, 'schedules'), {
          employeeId: employee.id,
          employeeName: employee.name,
          branchId: selectedBranchId || employee.branchId,
          branchName: branchName,
          date: date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          breakTime: schedule.breakTime,
          totalHours: totalHours,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // 저장된 날짜들의 입력 필드 초기화
      const savedDateKeys = allSchedulesToSave.map(s => s.date.toISOString().split('T')[0]);
      const newDateInputs = { ...dateInputs };
      savedDateKeys.forEach(dateKey => {
        delete newDateInputs[dateKey];
      });
      setDateInputs(newDateInputs);
      
      loadSchedules();
      alert('모든 스케줄이 저장되었습니다.');
    } catch (error) {
      console.error('스케줄 저장 오류:', error);
      alert('스케줄 저장 중 오류가 발생했습니다.');
    }
  };

  const goToPreviousWeeks = () => {
    const prevWeeks = new Date(currentWeekStart);
    prevWeeks.setDate(prevWeeks.getDate() - (numberOfWeeks * 7));
    setCurrentWeekStart(prevWeeks);
  };

  const goToNextWeeks = () => {
    const nextWeeks = new Date(currentWeekStart);
    nextWeeks.setDate(nextWeeks.getDate() + (numberOfWeeks * 7));
    setCurrentWeekStart(nextWeeks);
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
    setDraggedSchedule(schedule);
    // Ctrl 키가 눌려있으면 복사, 아니면 이동
    if (e.ctrlKey) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', `copy:${schedule.id}`);
      setIsCopyMode(true);
    } else {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', schedule.id);
      setIsCopyMode(false);
    }
  };

  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault();
    // Ctrl 키가 눌려있으면 복사, 아니면 이동
    if (e.ctrlKey) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }
    setDragOverDate(dateKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDateKey: string) => {
    e.preventDefault();
    setDragOverDate(null);
    
    if (!draggedSchedule) return;
    
    const targetDate = new Date(targetDateKey);
    const sourceDate = new Date(draggedSchedule.date);
    const isCopyMode = e.ctrlKey;
    
    // 같은 날짜로 드롭하는 경우 무시
    if (targetDate.toDateString() === sourceDate.toDateString()) {
      setDraggedSchedule(null);
      return;
    }
    
    try {
      // 복사 모드가 아닌 경우에만 기존 스케줄 삭제
      if (!isCopyMode) {
        await deleteDoc(doc(db, 'schedules', draggedSchedule.id));
      }
      
      // 새 날짜로 스케줄 생성
      const newScheduleData = {
        employeeId: draggedSchedule.employeeId,
        employeeName: draggedSchedule.employeeName,
        branchId: draggedSchedule.branchId,
        branchName: draggedSchedule.branchName,
        date: targetDate,
        startTime: draggedSchedule.startTime,
        endTime: draggedSchedule.endTime,
        breakTime: draggedSchedule.breakTime,
        totalHours: draggedSchedule.totalHours,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await addDoc(collection(db, 'schedules'), newScheduleData);
      
      // 스케줄 목록 새로고침
      loadSchedules();
      
      const action = isCopyMode ? '복사' : '이동';
      alert(`${draggedSchedule.employeeName}의 스케줄이 ${targetDate.toLocaleDateString('ko-KR')}로 ${action}되었습니다.`);
    } catch (error) {
      console.error('스케줄 처리 중 오류:', error);
      const action = isCopyMode ? '복사' : '이동';
      alert(`스케줄 ${action} 중 오류가 발생했습니다.`);
    } finally {
      setDraggedSchedule(null);
      setIsCopyMode(false);
    }
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 네비게이션 및 설정 */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreviousWeeks}
              className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-900 font-medium"
            >
              ← 이전 {numberOfWeeks}주
            </button>
            <span className="text-lg font-medium text-gray-900">
              {currentWeekStart.getFullYear()}년 {currentWeekStart.getMonth() + 1}월 {currentWeekStart.getDate()}일부터 {numberOfWeeks}주간
            </span>
            <button
              onClick={goToNextWeeks}
              className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-900 font-medium"
            >
              다음 {numberOfWeeks}주 →
            </button>
          </div>
          <div className="flex justify-center">
            <button
              onClick={saveAllSchedules}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
            >
              모든 스케줄 저장
            </button>
          </div>
        </div>
      </div>

      {/* 여러 주간 스케줄 뷰 */}
      <div className="space-y-6">
        {Array.from({ length: numberOfWeeks }, (_, weekIndex) => {
          const weekStart = new Date(currentWeekStart);
          weekStart.setDate(currentWeekStart.getDate() + (weekIndex * 7));
          const weekDates = getWeekDates(weekStart);
          const weeklySummary = generateWeeklySummary(weekStart);

          return (
            <div key={weekIndex} className="bg-white shadow rounded-lg overflow-hidden">
              {/* 주간 헤더 */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-medium text-gray-900">
                  {weekStart.getFullYear()}년 {weekStart.getMonth() + 1}월 {weekStart.getDate()}일 주간
                </h3>
              </div>


              {/* 사람별 스케줄 테이블 */}
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {weekDates.map((date, dayIndex) => {
                        const dayOfWeek = DAYS_OF_WEEK[dayIndex];
                        return (
                          <th key={dayIndex} className="px-6 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider">
                            <div>{date.getMonth() + 1}/{date.getDate()}</div>
                            <div className="text-xs text-gray-800">{dayOfWeek.label}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {(() => {
                      // 입력된 모든 직원 이름 수집
                      const allInputEmployees = new Set<string>();
                      weekDates.forEach(date => {
                        const dateKey = date.toISOString().split('T')[0];
                        const inputText = dateInputs[dateKey] || '';
                        if (inputText.trim()) {
                          const inputSchedules = parseScheduleInput(inputText);
                          inputSchedules.forEach(schedule => {
                            allInputEmployees.add(schedule.employeeName);
                          });
                        }
                      });
                      
                      // 기존 직원과 입력된 직원 모두 포함
                      const allEmployees = new Set([
                        ...weeklySummary.map(s => s.employeeName),
                        ...Array.from(allInputEmployees)
                      ]);
                      
                      console.log('=== 실시간 표시 디버그 ===');
                      console.log('weeklySummary 직원들:', weeklySummary.map(s => s.employeeName));
                      console.log('입력된 직원들:', Array.from(allInputEmployees));
                      console.log('전체 직원들:', Array.from(allEmployees));
                      
                      return Array.from(allEmployees)
                        .sort((a, b) => a.localeCompare(b, 'ko'))
                        .map((employeeName, index) => {
                          // const summary = weeklySummary.find(s => s.employeeName === employeeName); // 사용하지 않음
                          return (
                            <tr key={index} className="hover:bg-gray-50">
                              {weekDates.map((date, dayIndex) => {
                                const dateKey = date.toISOString().split('T')[0];
                                const daySchedules = getSchedulesForDate(date).filter(
                                  schedule => schedule.employeeName === employeeName
                                );
                                const inputText = dateInputs[dateKey] || '';
                                const parsedInputs = parseScheduleInput(inputText);
                                const inputSchedules = parsedInputs.filter(
                                  input => input.employeeName === employeeName
                                );
                                
                                return (
                                  <td 
                                    key={dayIndex} 
                                    className={`px-2 py-2 text-center ${
                                      dragOverDate === dateKey 
                                        ? (isCopyMode ? 'bg-green-100 border-2 border-green-300' : 'bg-blue-100 border-2 border-blue-300')
                                        : ''
                                    }`}
                                    onDragOver={(e) => handleDragOver(e, dateKey)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, dateKey)}
                                  >
                                    <div className="space-y-1">
                                      {/* 기존 저장된 스케줄 */}
                                      {daySchedules.map((schedule) => (
                                        <div
                                          key={schedule.id}
                                          className="text-xs p-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200 cursor-move hover:bg-yellow-200 relative group"
                                          onClick={() => handleScheduleClick(schedule)}
                                          draggable={true}
                                          onDragStart={(e) => handleDragStart(e, schedule)}
                                          title="드래그해서 다른 날로 이동할 수 있습니다. Ctrl 키를 누르고 드래그하면 복사됩니다."
                                        >
                                          {formatScheduleDisplay(schedule)}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteSchedule(schedule.id);
                                            }}
                                            className="absolute top-0 right-0 text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded-full w-3 h-3 text-xs"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                      
                                      {/* 실시간 입력된 스케줄 (하늘색 배경) */}
                                      {(() => {
                                        console.log(`${employeeName}의 입력 스케줄들:`, inputSchedules);
                                        return inputSchedules;
                                      })().map((inputSchedule, inputIndex) => {
                                        // 시:분 형태를 소수점 형태로 변환 (18:30 -> 18.5)
                                        const timeToDecimal = (timeStr: string) => {
                                          const [hours, minutes] = timeStr.split(':').map(Number);
                                          if (minutes === 0) {
                                            return hours.toString();
                                          } else {
                                            // 분을 소수점으로 변환 (30분 -> 0.5, 15분 -> 0.25)
                                            const decimalMinutes = minutes / 60;
                                            const result = hours + decimalMinutes;
                                            
                                            // 소수점이 .0이면 정수로 표시, 아니면 소수점 표시
                                            if (decimalMinutes === 0.5) {
                                              return `${hours}.5`;
                                            } else if (decimalMinutes === 0.25) {
                                              return `${hours}.25`;
                                            } else if (decimalMinutes === 0.75) {
                                              return `${hours}.75`;
                                            } else {
                                              return result.toString();
                                            }
                                          }
                                        };
                                        
                                        const startTimeDisplay = timeToDecimal(inputSchedule.startTime);
                                        const endTimeDisplay = timeToDecimal(inputSchedule.endTime);
                                        const breakTime = inputSchedule.breakTime !== '0' ? `(${inputSchedule.breakTime})` : '';
                                        
                                        return (
                                          <div
                                            key={`input-${inputIndex}`}
                                            className="text-xs p-1 bg-blue-100 text-blue-800 rounded border border-blue-200"
                                          >
                                            {inputSchedule.employeeName} {startTimeDisplay}-{endTimeDisplay}{breakTime}
                                          </div>
                                        );
                                      })}
                                      
                                      {/* 스케줄이 없으면 공란 */}
                                      {daySchedules.length === 0 && inputSchedules.length === 0 && (
                                        <div className="text-xs text-gray-600">-</div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                    })()}
                    {weeklySummary.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-700">
                          이번 주 스케줄이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* 전체 입력 영역 */}
              <div className="border-t border-gray-200 p-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">스케줄 입력</h4>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                  {weekDates.map((date, dayIndex) => {
                    const dayOfWeek = DAYS_OF_WEEK[dayIndex];
                    return (
                      <div key={dayIndex} className="text-center">
                        <div className="text-xs font-medium text-gray-700 mb-2">
                          {date.getMonth() + 1}/{date.getDate()} {dayOfWeek.label}
                        </div>
                        <textarea
                          value={dateInputs[date.toISOString().split('T')[0]] || ''}
                          onChange={(e) => handleDateInputChange(date.toISOString().split('T')[0], e.target.value)}
                          placeholder={`예:
이진영 10-18(1)
유은서 12-14
권정희 11-20(3.5)`}
                          className="w-full text-xs p-2 border border-gray-300 rounded resize-none"
                          rows={4}
                        />
                        {/* 잘못된 직원 이름 에러 메시지 */}
                        {invalidEmployees[date.toISOString().split('T')[0]] && invalidEmployees[date.toISOString().split('T')[0]].length > 0 && (
                          <div className="mt-1 text-xs text-red-600">
                            <div className="font-medium">⚠️ 이름 확인 필요:</div>
                            {invalidEmployees[date.toISOString().split('T')[0]].map((name, index) => (
                              <div key={index} className="ml-2">
                                • {name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 주간 집계 테이블 */}
              <div className="border-t border-gray-200">
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900">사람별 주간 집계</h4>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          이름
                        </th>
                        {DAYS_OF_WEEK.map((day) => (
                          <th key={day.key} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {day.label}
                          </th>
                        ))}
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          총합
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {weeklySummary.map((summary, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {summary.employeeName}
                          </td>
                          {DAYS_OF_WEEK.map((day) => (
                            <td key={day.key} className="px-6 py-4 text-sm text-gray-900 text-center">
                              {summary.dailyHours[day.key] ? summary.dailyHours[day.key].toFixed(1) : '-'}
                            </td>
                          ))}
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 text-center">
                            {summary.totalHours.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                      {weeklySummary.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                            이번 주 스케줄이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>


      {/* 편집 폼 모달 */}
      {(editingSchedule || showAddForm) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingSchedule?.id ? '스케줄 수정' : '새 스케줄 추가'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">직원</label>
                <select
                  value={editingSchedule?.employeeId || ''}
                  onChange={(e) => setEditingSchedule(prev => prev ? {...prev, employeeId: e.target.value} : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">직원을 선택하세요</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.branchName})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">지점</label>
                <select
                  value={editingSchedule?.branchId || ''}
                  onChange={(e) => setEditingSchedule(prev => prev ? {...prev, branchId: e.target.value} : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">지점을 선택하세요</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">날짜</label>
                <input
                  type="date"
                  value={editingSchedule?.date ? editingSchedule.date.toISOString().split('T')[0] : ''}
                  onChange={(e) => setEditingSchedule(prev => prev ? {...prev, date: new Date(e.target.value)} : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">시작 시간</label>
                  <input
                    type="time"
                    value={editingSchedule?.startTime || ''}
                    onChange={(e) => setEditingSchedule(prev => prev ? {...prev, startTime: e.target.value} : null)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">종료 시간</label>
                  <input
                    type="time"
                    value={editingSchedule?.endTime || ''}
                    onChange={(e) => setEditingSchedule(prev => prev ? {...prev, endTime: e.target.value} : null)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">휴식 시간 (분)</label>
                <input
                  type="number"
                  value={editingSchedule?.breakTime || '0'}
                  onChange={(e) => setEditingSchedule(prev => prev ? {...prev, breakTime: e.target.value} : null)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  required
                />
              </div>
              
              {editingSchedule?.startTime && editingSchedule?.endTime && (
                <div className="p-3 bg-blue-50 rounded-md">
                  <span className="text-sm text-blue-800">
                    총 근무시간: {calculateTotalHours(editingSchedule.startTime, editingSchedule.endTime, editingSchedule.breakTime).toFixed(1)}시간
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveSchedule}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                {editingSchedule?.id ? '수정' : '추가'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
