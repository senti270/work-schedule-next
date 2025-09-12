'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
  status: 'time_match' | 'review_required' | 'review_completed';
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
  const [employeeReviewStatus, setEmployeeReviewStatus] = useState<{employeeId: string, status: '검토전' | '검토중' | '검토완료'}[]>([]);
  
  // 전월 이월 연장근무시간 입력 팝업 상태
  const [showOvertimePopup, setShowOvertimePopup] = useState(false);
  const [overtimeInput, setOvertimeInput] = useState('');
  const [pendingOvertimeCalculation, setPendingOvertimeCalculation] = useState<{
    employeeId: string;
    currentWeekStart: Date;
    actualWorkHours: number;
  } | null>(null);

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

  // 직원이 변경될 때 실제근무데이터 초기화 및 기존 데이터 로드
  useEffect(() => {
    if (selectedEmployeeId) {
      // 직원이 변경되면 실제근무데이터 초기화
      setActualWorkData('');
      
      // 먼저 비교 결과 초기화 (다른 직원 데이터가 보이지 않도록)
      setComparisonResults([]);
      
      // 기존 비교 데이터가 있는지 확인하고 로드
      loadExistingComparisonData();
    } else {
      // 직원이 선택되지 않았으면 비교 결과 초기화
      setComparisonResults([]);
    }
  }, [selectedEmployeeId, selectedMonth]);

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
      
      // 직원 검토 상태 초기화
      const initialReviewStatus = employeesData.map(emp => ({
        employeeId: emp.id,
        status: '검토전' as '검토전' | '검토중' | '검토완료'
      }));
      setEmployeeReviewStatus(initialReviewStatus);
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

  const compareWorkTimes = async () => {
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
      // 실제근무 데이터가 없으면 기존 데이터가 있는지 확인
      // 기존 데이터가 없으면 비교 결과 초기화
      if (comparisonResults.length === 0) {
        setComparisonResults([]);
      }
      return;
    }

    // 이미 비교결과가 있고 수정된 내용이 있는 경우 경고
    if (comparisonResults.length > 0) {
      const hasModifiedResults = comparisonResults.some(result => result.isModified);
      if (hasModifiedResults) {
        const confirmed = confirm('이미 수정한 근무시간 데이터가 있습니다.\n다시 비교하면 모든 수정내용이 초기화됩니다.\n계속하시겠습니까?');
        if (!confirmed) {
          return;
        }
      }
    }

    const actualRecords = parseActualWorkData(actualWorkData);
    console.log('파싱된 실제근무 데이터:', actualRecords);

    const comparisons: WorkTimeComparison[] = [];
    const processedDates = new Set<string>();

    // 1. 스케줄이 있는 경우: 스케줄과 실제근무 데이터 비교 (선택된 직원만)
    schedules
      .filter(schedule => schedule.employeeId === selectedEmployeeId)
      .forEach(schedule => {
        const scheduleDate = schedule.date.toISOString().split('T')[0];
        const actualRecord = actualRecords.find(record => record.date === scheduleDate);

      console.log(`스케줄: ${schedule.employeeName} ${scheduleDate}`, schedule);
      console.log(`실제근무 데이터 찾기:`, actualRecord);

      if (actualRecord) {
        const difference = actualRecord.totalHours - schedule.totalHours;
        let status: 'time_match' | 'review_required' | 'review_completed' = 'time_match';
        
        // 10분(0.17시간) 이상 차이나면 확인필요, 이내면 시간일치
        if (Math.abs(difference) >= 0.17) {
          status = 'review_required';
        } else {
          status = 'time_match';
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
          status: 'review_required',
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
    
    // 연장근무시간 계산 (정직원인 경우만)
    if (selectedEmployeeId) {
      try {
        // 직원 정보 확인
        const employeeQuery = query(
          collection(db, 'employees'),
          where('__name__', '==', selectedEmployeeId)
        );
        const employeeSnapshot = await getDocs(employeeQuery);
        
        if (!employeeSnapshot.empty) {
          const employeeData = employeeSnapshot.docs[0].data();
          
          // 정직원인 경우에만 연장근무시간 계산
          if (employeeData.type === '정규직') {
            // 이번주 총 실제 근무시간 계산
            const totalActualHours = comparisons.reduce((sum, comp) => sum + comp.actualHours, 0);
            
            // 이번주 시작일 계산 (월요일)
            const currentDate = new Date(selectedMonth);
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const firstMonday = new Date(firstDay);
            const dayOfWeek = firstDay.getDay();
            const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
            firstMonday.setDate(firstDay.getDate() + daysToMonday);
            
            // 연장근무시간 계산
            const accumulatedOvertime = await calculateOvertimeHours(selectedEmployeeId, firstMonday, totalActualHours);
            console.log('계산된 누적 연장근무시간:', accumulatedOvertime);
          }
        }
      } catch (error) {
        console.error('연장근무시간 계산 중 오류:', error);
      }
    }
    
    // 모든 비교 결과를 DB에 저장
    await saveAllComparisonResults(comparisons);
    
    // 비교결과 데이터가 한건이라도 있으면 검토중으로 상태 변경
    if (comparisons.length > 0) {
      setEmployeeReviewStatus(prev => 
        prev.map(status => 
          status.employeeId === selectedEmployeeId 
            ? { ...status, status: '검토중' }
            : status
        )
      );
    }
    
    // 모든 데이터가 확인완료 또는 시간일치인 경우 직원 검토 상태를 검토완료로 변경
    const allCompleted = comparisons.every(comp => 
      comp.status === 'review_completed' || comp.status === 'time_match'
    );
    
    if (allCompleted && comparisons.length > 0) {
      setEmployeeReviewStatus(prev => 
        prev.map(status => 
          status.employeeId === selectedEmployeeId 
            ? { ...status, status: '검토완료' }
            : status
        )
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'time_match': return 'text-green-600 bg-green-50';
      case 'review_required': return 'text-orange-600 bg-orange-50';
      case 'review_completed': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'time_match': return '시간일치';
      case 'review_required': return '확인필요';
      case 'review_completed': return '확인완료';
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

  // 연장근무시간 계산 함수
  const calculateOvertimeHours = async (employeeId: string, currentWeekStart: Date, actualWorkHours: number) => {
    try {
      // 직원 정보에서 주간 근무시간 가져오기
      const employeeQuery = query(
        collection(db, 'employees'),
        where('__name__', '==', employeeId)
      );
      const employeeSnapshot = await getDocs(employeeQuery);
      
      if (employeeSnapshot.empty) {
        console.log('직원 정보를 찾을 수 없습니다:', employeeId);
        return 0;
      }
      
      const employeeData = employeeSnapshot.docs[0].data();
      const weeklyWorkHours = employeeData.weeklyWorkHours || 40; // 기본값 40시간
      
      console.log('직원 주간 근무시간:', weeklyWorkHours, '실제 근무시간:', actualWorkHours);
      
      // 전주 누적 연장근무시간 가져오기
      const previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      
      const overtimeQuery = query(
        collection(db, 'overtimeRecords'),
        where('employeeId', '==', employeeId),
        where('weekStart', '==', previousWeekStart)
      );
      
      const overtimeSnapshot = await getDocs(overtimeQuery);
      let previousOvertime = 0;
      
      if (!overtimeSnapshot.empty) {
        previousOvertime = overtimeSnapshot.docs[0].data().accumulatedOvertime || 0;
      }
      
      // 연장근무시간 계산: 전주 누적 + max(0, 실근무시간 - 주간근무시간)
      const currentWeekOvertime = Math.max(0, actualWorkHours - weeklyWorkHours);
      const newAccumulatedOvertime = previousOvertime + currentWeekOvertime;
      
      console.log('전주 누적 연장근무:', previousOvertime, '이번주 연장근무:', currentWeekOvertime, '새 누적:', newAccumulatedOvertime);
      
      // 이번주 연장근무시간 기록 저장
      const overtimeRecord = {
        employeeId: employeeId,
        weekStart: currentWeekStart,
        actualWorkHours: actualWorkHours,
        weeklyWorkHours: weeklyWorkHours,
        currentWeekOvertime: currentWeekOvertime,
        accumulatedOvertime: newAccumulatedOvertime,
        createdAt: new Date()
      };
      
      // 기존 기록이 있으면 업데이트, 없으면 새로 생성
      if (!overtimeSnapshot.empty) {
        await updateDoc(overtimeSnapshot.docs[0].ref, overtimeRecord);
      } else {
        await addDoc(collection(db, 'overtimeRecords'), overtimeRecord);
      }
      
      return newAccumulatedOvertime;
    } catch (error) {
      console.error('연장근무시간 계산 실패:', error);
      return 0;
    }
  };

  // 기존 비교 데이터를 불러오는 함수
  const loadExistingComparisonData = async () => {
    if (!selectedEmployeeId || !selectedMonth) {
      setComparisonResults([]);
      return;
    }
    
    try {
      console.log('기존 비교 데이터 로드 시작:', selectedEmployeeId, selectedMonth);
      
      const querySnapshot = await getDocs(
        query(
          collection(db, 'actualWorkRecords'),
          where('employeeId', '==', selectedEmployeeId),
          where('month', '==', selectedMonth)
        )
      );
      
      console.log('DB 쿼리 결과:', querySnapshot.docs.length, '건');
      
      if (!querySnapshot.empty) {
        const existingData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            employeeName: data.employeeName,
            date: data.date,
            scheduledHours: data.scheduledHours || 0,
            actualHours: data.actualHours,
            difference: data.difference,
            status: data.status,
            scheduledTimeRange: data.scheduledTimeRange || '-',
            actualTimeRange: data.actualTimeRange || '-',
            isModified: data.isModified || false
          };
        });
        
        // 날짜순으로 정렬
        existingData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setComparisonResults(existingData);
        console.log('기존 비교 데이터 로드됨:', existingData);
      } else {
        // 기존 데이터가 없으면 비교 결과 초기화
        setComparisonResults([]);
        console.log('기존 비교 데이터 없음, 초기화됨');
      }
    } catch (error) {
      console.error('기존 비교 데이터 로드 실패:', error);
      setComparisonResults([]);
    }
  };

  // 모든 비교 결과를 DB에 저장하는 함수
  const saveAllComparisonResults = async (results: WorkTimeComparison[]) => {
    if (!selectedEmployeeId || !selectedMonth) {
      console.log('저장 실패: 직원ID 또는 월이 없음');
      return;
    }
    
    try {
      console.log('DB 저장 시작:', selectedEmployeeId, selectedMonth, results.length, '건');
      
      // 기존 데이터 삭제
      const existingQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      
      const existingSnapshot = await getDocs(existingQuery);
      console.log('기존 데이터 삭제:', existingSnapshot.docs.length, '건');
      
      const deletePromises = existingSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // 새로운 데이터 저장
      const savePromises = results.map(result => {
        const actualWorkRecord = {
          employeeId: selectedEmployeeId,
          employeeName: result.employeeName,
          date: result.date,
          month: selectedMonth,
          scheduledHours: result.scheduledHours,
          actualHours: result.actualHours,
          difference: result.difference,
          status: result.status,
          scheduledTimeRange: result.scheduledTimeRange,
          actualTimeRange: result.actualTimeRange,
          isModified: result.isModified,
          createdAt: new Date()
        };
        
        return addDoc(collection(db, 'actualWorkRecords'), actualWorkRecord);
      });
      
      await Promise.all(savePromises);
      console.log('모든 비교 결과가 DB에 저장되었습니다:', results.length, '건');
    } catch (error) {
      console.error('비교 결과 저장 실패:', error);
    }
  };

  // 수정된 데이터를 DB에 저장
  const saveModifiedData = async (result: WorkTimeComparison) => {
    try {
      const actualWorkRecord = {
        employeeId: selectedEmployeeId,
        employeeName: result.employeeName,
        date: result.date,
        actualHours: result.actualHours,
        scheduledHours: result.scheduledHours,
        difference: result.difference,
        status: result.status,
        isModified: true,
        modifiedAt: new Date(),
        branchId: selectedBranchId,
        month: selectedMonth
      };

      // 기존 데이터가 있는지 확인
      const existingQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('date', '==', result.date),
        where('month', '==', selectedMonth)
      );
      
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'actualWorkRecords'), actualWorkRecord);
        console.log('새로운 실제근무 데이터 저장됨:', actualWorkRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'actualWorkRecords', docId), actualWorkRecord);
        console.log('기존 실제근무 데이터 업데이트됨:', actualWorkRecord);
      }
      
      alert('수정된 데이터가 저장되었습니다.');
    } catch (error) {
      console.error('데이터 저장 실패:', error);
      alert('데이터 저장에 실패했습니다.');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">근무시간 비교</h1>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 mb-2">메뉴 설명</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• 매월 초 한번씩 전달의 스케쥴과 실제근무 시간을 비교합니다</p>
                <p>• 비교할 월을 선택하고 실제근무 데이터를 복사붙여넣기합니다</p>
                <p>• 차이가 있는 경우 초과/부족 시간을 확인하고, 수정할 수 있습니다</p>
              </div>
              
              <h3 className="text-sm font-medium text-blue-800 mt-4 mb-2">사용 방법</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>1. 지점, 비교할 월 선택 후, 직원 선택</p>
                <p>2. POS에서 실제 근무 데이터 붙여넣기</p>
                <p>3. 근무시간 비교 버튼 클릭해서 차이나는 시간을 조정</p>
                <p>4. 모든 스케쥴 수정/확인 완료 시 검토완료 상태로 변경</p>
                <p>5. 모든 직원 검토완료 상태 시 본사에 전송하면 끝!</p>
              </div>
            </div>
          </div>
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
      {selectedBranchId && selectedMonth && employees.length > 0 ? (
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
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {(() => {
                          const empStatus = employeeReviewStatus.find(status => status.employeeId === employee.id)?.status || '검토전';
                          const getStatusColor = (status: string) => {
                            switch (status) {
                              case '검토전': return 'text-gray-600 bg-gray-50';
                              case '검토중': return 'text-orange-600 bg-orange-50';
                              case '검토완료': return 'text-green-600 bg-green-50';
                              default: return 'text-gray-600 bg-gray-50';
                            }
                          };
                          return (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(empStatus)}`}>
                              {empStatus}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* 본사전송 버튼 */}
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="text-gray-500">💡 </span>
              모든 직원이 검토완료 후에 전송 가능합니다
            </div>
            <button
              onClick={() => {
                alert('본사전송 기능은 향후 구현될 예정입니다.');
              }}
              disabled={!employees.every(emp => {
                const empStatus = employeeReviewStatus.find(status => status.employeeId === emp.id);
                return empStatus?.status === '검토완료';
              })}
              className={`px-6 py-2 rounded-md font-medium ${
                employees.every(emp => {
                  const empStatus = employeeReviewStatus.find(status => status.employeeId === emp.id);
                  return empStatus?.status === '검토완료';
                })
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              본사전송
            </button>
          </div>
        </div>
      ) : null}

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
                          <div class="bg-white p-4 rounded-lg max-w-6xl max-h-[90vh] overflow-auto">
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
                              <div class="bg-white border rounded p-3">
                                <img 
                                  src="/images/pos-asp-example.png" 
                                  alt="POS ASP 시스템 화면 예시" 
                                  class="w-full h-auto border rounded"
                                  onerror="console.log('이미지 로드 실패:', this); this.style.display='none';"
                                />
                              </div>
                              <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                                <p class="font-medium text-yellow-800 mb-2">💡 복사 방법:</p>
                                <ul class="text-yellow-700 space-y-1">
                                  <li>• 위 표에서 해당 직원의 데이터 행들을 마우스로 드래그하여 선택한 후 Ctrl+C로 복사하세요.</li>
                                  <li>• 헤더는 제외하고 데이터 행만 복사</li>
                                  <li>• 여러 날의 데이터가 있는 경우 모든 행을 포함</li>
                                </ul>
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
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            비교 결과 {comparisonResults.length > 0 ? `(${comparisonResults.length}건)` : ''}
          </h3>
        </div>
        
        {comparisonResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full">
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
                    연장근무시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {comparisonResults.map((result, index) => {
                  const rowBgColor = (result.status === 'review_completed' || result.status === 'time_match') 
                    ? 'bg-white' 
                    : 'bg-yellow-50';
                  
                  return (
                    <tr key={index} className={`hover:bg-gray-50 ${rowBgColor} border-t border-gray-200`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {result.employeeName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {result.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{(() => {
                          const hours = Math.floor(result.scheduledHours);
                          const minutes = Math.round((result.scheduledHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}</div>
                        <div className="text-xs text-gray-500">{result.scheduledTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{(() => {
                          const hours = Math.floor(result.actualHours);
                          const minutes = Math.round((result.actualHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}</div>
                        <div className="text-xs text-gray-500">{result.actualTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {(() => {
                          const absDifference = Math.abs(result.difference);
                          const hours = Math.floor(absDifference);
                          const minutes = Math.round((absDifference - hours) * 60);
                          const sign = result.difference > 0 ? '+' : result.difference < 0 ? '-' : '';
                          return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.status)}`}>
                          {getStatusText(result.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {/* 연장근무시간은 정직원만 표시 */}
                        {(() => {
                          // 정직원인지 확인 (실제로는 직원 정보를 확인해야 함)
                          const isRegularEmployee = true; // 임시로 true, 실제로는 직원 타입 확인
                          if (!isRegularEmployee) return '-';
                          
                          // 연장근무시간 계산 (실제 근무시간 - 주간 근무시간)
                          const weeklyWorkHours = 40; // 기본값, 실제로는 직원 정보에서 가져와야 함
                          const overtimeHours = Math.max(0, result.actualHours - weeklyWorkHours);
                          
                          if (overtimeHours === 0) return '0:00';
                          
                          const hours = Math.floor(overtimeHours);
                          const minutes = Math.round((overtimeHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {(result.status === 'review_required' || result.status === 'review_completed') && (
                          <button
                            onClick={() => {
                              const currentHours = Math.floor(result.actualHours);
                              const currentMinutes = Math.round((result.actualHours - currentHours) * 60);
                              const currentTimeStr = `${currentHours}:${currentMinutes.toString().padStart(2, '0')}`;
                              
                              const newTimeStr = prompt('수정할 실제 근무시간을 입력하세요 (시간:분 형식, 예: 3:11):', currentTimeStr);
                              
                              if (newTimeStr) {
                                let newHours = 0;
                                if (newTimeStr.includes(':')) {
                                  const parts = newTimeStr.split(':');
                                  const hours = parseInt(parts[0]);
                                  const minutes = parseInt(parts[1]);
                                  if (!isNaN(hours) && !isNaN(minutes)) {
                                    newHours = hours + (minutes / 60);
                                  }
                                } else {
                                  const numericValue = parseFloat(newTimeStr);
                                  if (!isNaN(numericValue)) {
                                    newHours = numericValue;
                                  }
                                }
                                
                                if (newHours > 0) {
                                  const updatedResults = [...comparisonResults];
                                  updatedResults[index] = {
                                    ...result,
                                    actualHours: newHours,
                                    difference: newHours - result.scheduledHours,
                                    status: 'review_completed',
                                    isModified: true
                                  };
                                  setComparisonResults(updatedResults);
                                  
                                  setEmployeeReviewStatus(prev => 
                                    prev.map(status => 
                                      status.employeeId === selectedEmployeeId 
                                        ? { ...status, status: '검토중' }
                                        : status
                                    )
                                  );
                                  
                                  // DB에 저장
                                  saveModifiedData(updatedResults[index]);
                                }
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
        )}

        {comparisonResults.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-500 text-lg mb-2">📊</div>
            <div className="text-gray-500 text-lg mb-2">비교결과 데이터 없음</div>
            <div className="text-gray-400 text-sm">
              지점, 월, 직원을 선택하고 실제근무 데이터를 입력한 후<br />
              &quot;근무시간 비교&quot; 버튼을 클릭해주세요.
            </div>
          </div>
        )}
      </div>

      {/* 요약 통계 */}
      {comparisonResults.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {comparisonResults.filter(r => r.status === 'time_match').length}
            </div>
            <div className="text-sm text-green-600">시간일치</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {comparisonResults.filter(r => r.status === 'review_required').length}
            </div>
            <div className="text-sm text-orange-600">확인필요</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {comparisonResults.filter(r => r.status === 'review_completed').length}
            </div>
            <div className="text-sm text-purple-600">확인완료</div>
          </div>
        </div>
      )}
    </div>
  );
}
