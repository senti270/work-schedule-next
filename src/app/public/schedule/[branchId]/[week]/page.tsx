'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isRedDay } from '@/lib/holidays';

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
  timeSlots?: Array<{startTime: string; endTime: string; breakTime: number}>;
  originalInput?: string; // 원본 입력 형식 저장 (예: "10-13, 19-23(0.5)")
  createdAt: Date;
  updatedAt: Date;
}

interface WeeklySummary {
  employeeName: string;
  dailyHours: { [key: string]: number };
  totalHours: number;
}

interface WeeklyNote {
  id: string;
  branchId: string;
  branchName: string;
  weekStart: Date;
  weekEnd: Date;
  note: string;
  createdAt: Date;
  updatedAt: Date;
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

interface PublicSchedulePageProps {
  params: Promise<{
    branchId: string;
    week: string;
  }>;
}

export default function PublicSchedulePage({ params }: PublicSchedulePageProps) {
  const resolvedParams = use(params);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [weeklyNote, setWeeklyNote] = useState<WeeklyNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [branchName, setBranchName] = useState<string>('');
  const [otherBranchSchedules, setOtherBranchSchedules] = useState<{[key: string]: {branchName: string, schedule: string}[]}>({});

  // 지점명을 약칭으로 변환하는 함수
  const getBranchShortName = (branchName: string): string => {
    const shortNames: {[key: string]: string} = {
      '청담장어마켓 송파점': '장어송파',
      '청담장어마켓 동탄점': '장어동탄',
      '카페드로잉 석촌호수점': '카페송파',
      '카페드로잉 분당점': '카페분당',
      '카페드로잉 동탄점': '카페동탄'
    };
    return shortNames[branchName] || branchName;
  };

  const loadBranchInfo = useCallback(async () => {
    if (resolvedParams.branchId === 'all') {
      setBranchName('전체 지점');
      return;
    }
    
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branch = querySnapshot.docs.find(doc => doc.id === resolvedParams.branchId);
      if (branch) {
        setBranchName(branch.data().name);
      } else {
        setBranchName('알 수 없는 지점');
      }
    } catch (error) {
      console.error('지점 정보를 불러올 수 없습니다:', error);
      setBranchName('알 수 없는 지점');
    }
  }, [resolvedParams.branchId]);

  const loadWeeklyNote = useCallback(async () => {
    if (resolvedParams.branchId === 'all') {
      setWeeklyNote(null);
      return;
    }
    
    try {
      const weekStart = new Date(resolvedParams.week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const querySnapshot = await getDocs(collection(db, 'weeklyNotes'));
      const existingNote = querySnapshot.docs.find(doc => {
        const data = doc.data();
        const noteWeekStart = data.weekStart?.toDate();
        const noteWeekEnd = data.weekEnd?.toDate();
        
        return data.branchId === resolvedParams.branchId &&
               noteWeekStart?.toDateString() === weekStart.toDateString() &&
               noteWeekEnd?.toDateString() === weekEnd.toDateString();
      });
      
      if (existingNote) {
        const noteData = {
          id: existingNote.id,
          ...existingNote.data(),
          weekStart: existingNote.data().weekStart?.toDate() || new Date(),
          weekEnd: existingNote.data().weekEnd?.toDate() || new Date(),
          createdAt: existingNote.data().createdAt?.toDate() || new Date(),
          updatedAt: existingNote.data().updatedAt?.toDate() || new Date()
        } as WeeklyNote;
        
        setWeeklyNote(noteData);
      } else {
        setWeeklyNote(null);
      }
    } catch (error) {
      console.error('주간 비고를 불러올 수 없습니다:', error);
      setWeeklyNote(null);
    }
  }, [resolvedParams.week, resolvedParams.branchId]);

  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const weekStart = new Date(resolvedParams.week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999); // 일요일 23:59:59까지 포함

      // 모든 스케줄을 가져온 후 클라이언트에서 필터링
      const querySnapshot = await getDocs(collection(db, 'schedules'));
      console.log('공유 페이지 - 전체 쿼리 결과:', querySnapshot.docs.length, '개 문서');
      
      const allSchedulesData = querySnapshot.docs.map(doc => {
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
          timeSlots: data.timeSlots,
          originalInput: data.originalInput,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });

      // 클라이언트에서 필터링
      console.log('필터링 범위:', { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() });
      let filteredSchedules = allSchedulesData.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        const isInRange = scheduleDate >= weekStart && scheduleDate <= weekEnd;
        if (scheduleDate.getDay() === 0) { // 일요일 스케줄 디버그
          console.log(`일요일 스케줄 확인: ${schedule.employeeName}, 날짜: ${scheduleDate.toISOString()}, 범위 내: ${isInRange}`);
        }
        return isInRange;
      });

      // 특정 지점이 선택된 경우
      if (resolvedParams.branchId !== 'all') {
        filteredSchedules = filteredSchedules.filter(schedule => 
          schedule.branchId === resolvedParams.branchId
        );
      }

      console.log('공유 페이지 - 필터링된 스케줄 데이터:', filteredSchedules);
      setSchedules(filteredSchedules);
      generateWeeklySummary(filteredSchedules);
    } catch (error) {
      console.error('스케줄 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.week, resolvedParams.branchId]);

  // 다른 지점 스케줄 조회 함수
  const loadOtherBranchSchedules = useCallback(async () => {
    try {
      if (resolvedParams.branchId === 'all') {
        setOtherBranchSchedules({});
        return;
      }
      
      const weekStart = new Date(resolvedParams.week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      // 모든 스케줄 조회
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const allSchedules = schedulesSnapshot.docs.map(doc => {
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
          timeSlots: data.timeSlots,
          originalInput: data.originalInput,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });
      
      // 현재 주간의 다른 지점 스케줄 필터링 (날짜별로 그룹화)
      const otherBranchSchedulesMap: {[key: string]: {branchName: string, schedule: string}[]} = {};
      
      allSchedules.forEach(schedule => {
        // 현재 지점이 아니고, 현재 주간에 해당하는 스케줄
        const scheduleDate = schedule.date.toISOString().split('T')[0];
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        
        if (schedule.branchId !== resolvedParams.branchId && 
            scheduleDate >= weekStartStr && 
            scheduleDate <= weekEndStr) {
          
          const dateString = schedule.date.toISOString().split('T')[0];
          const key = `${schedule.employeeId}-${dateString}`;
          
          if (!otherBranchSchedulesMap[key]) {
            otherBranchSchedulesMap[key] = [];
          }
          
          // 스케줄 포맷팅 (시간 형식을 간단하게)
          const formatTime = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':');
            if (minutes === '00') {
              return hours;
            } else if (minutes === '30') {
              return `${hours}.5`;
            } else {
              return timeStr;
            }
          };
          
          // originalInput이 있으면 우선 사용, 없으면 timeSlots 또는 기본 형식 사용
          let scheduleText = '';
          
          if (schedule.originalInput) {
            scheduleText = schedule.originalInput;
          } else if (schedule.timeSlots && schedule.timeSlots.length > 0) {
            const timeToDecimal = (timeStr: string) => {
              const [hours, minutes] = timeStr.split(':').map(Number);
              if (minutes === 0) return hours.toString();
              const decimalMinutes = minutes / 60;
              if (decimalMinutes === 0.5) return `${hours}.5`;
              if (decimalMinutes === 0.25) return `${hours}.25`;
              if (decimalMinutes === 0.75) return `${hours}.75`;
              return (hours + decimalMinutes).toString();
            };
            
            scheduleText = schedule.timeSlots.map((slot: {startTime: string; endTime: string; breakTime: number}) => {
              const start = timeToDecimal(slot.startTime);
              const end = timeToDecimal(slot.endTime);
              return `${start}-${end}${slot.breakTime > 0 ? `(${slot.breakTime})` : ''}`;
            }).join(', ');
          } else {
            scheduleText = `${formatTime(schedule.startTime)}-${formatTime(schedule.endTime)}${schedule.breakTime !== '0' ? `(${schedule.breakTime})` : ''}`;
          }
          
          otherBranchSchedulesMap[key].push({
            branchName: getBranchShortName(schedule.branchName),
            schedule: scheduleText
          });
        }
      });
      
      setOtherBranchSchedules(otherBranchSchedulesMap);
    } catch (error) {
      console.error('다른 지점 스케줄 조회 중 오류:', error);
    }
  }, [resolvedParams.branchId, resolvedParams.week]);

  useEffect(() => {
    // URL에서 주차 정보 파싱
    const weekDate = new Date(resolvedParams.week);
    setCurrentWeekStart(weekDate);
    loadBranchInfo();
    loadSchedules();
    loadWeeklyNote();
    loadOtherBranchSchedules();
  }, [resolvedParams.week, resolvedParams.branchId, loadBranchInfo, loadSchedules, loadWeeklyNote, loadOtherBranchSchedules]);

  const generateWeeklySummary = (schedulesData: Schedule[]) => {
    const summaryMap = new Map<string, WeeklySummary>();

    schedulesData.forEach(schedule => {
      const employeeName = schedule.employeeName;
      // JavaScript Date.getDay(): 0=일요일, 1=월요일, ..., 6=토요일
      // DAYS_OF_WEEK 배열: 0=월요일, 1=화요일, ..., 6=일요일
      const dayIndex = schedule.date.getDay() === 0 ? 6 : schedule.date.getDay() - 1;
      const dayOfWeek = DAYS_OF_WEEK[dayIndex];

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

    setWeeklySummaries(Array.from(summaryMap.values()));
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
    // 🔥 타임존 이슈 해결: 날짜만 비교 (시간 무시)
    const targetDateString = date.toISOString().split('T')[0];
    return schedules.filter(schedule => {
      const scheduleDateString = schedule.date.toISOString().split('T')[0];
      return scheduleDateString === targetDateString;
    });
  };

  const goToPreviousWeek = () => {
    const prevWeek = new Date(currentWeekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const weekString = prevWeek.toISOString().split('T')[0];
    window.location.href = `/public/schedule/${resolvedParams.branchId}/${weekString}`;
  };

  const goToNextWeek = () => {
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const weekString = nextWeek.toISOString().split('T')[0];
    window.location.href = `/public/schedule/${resolvedParams.branchId}/${weekString}`;
  };

  const formatDecimalTime = (decimalTime: string) => {
    const decimal = parseFloat(decimalTime);
    if (decimal === 0) return '';
    
    return `(${decimal})`;
  };

  const formatScheduleDisplay = (schedule: Schedule) => {
    // originalInput이 있으면 우선 사용
    if (schedule.originalInput) {
      return {
        name: schedule.employeeName,
        time: schedule.originalInput
      };
    }
    
    // timeSlots가 있으면 여러 시간대 표시
    if (schedule.timeSlots && schedule.timeSlots.length > 0) {
      const timeToDecimal = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (minutes === 0) return hours.toString();
        const decimalMinutes = minutes / 60;
        if (decimalMinutes === 0.5) return `${hours}.5`;
        if (decimalMinutes === 0.25) return `${hours}.25`;
        if (decimalMinutes === 0.75) return `${hours}.75`;
        return (hours + decimalMinutes).toString();
      };
      
      const timeSlotsText = schedule.timeSlots.map((slot: {startTime: string; endTime: string; breakTime: number}) => {
        const start = timeToDecimal(slot.startTime);
        const end = timeToDecimal(slot.endTime);
        return `${start}-${end}${slot.breakTime > 0 ? `(${slot.breakTime})` : ''}`;
      }).join(', ');
      
      return {
        name: schedule.employeeName,
        time: timeSlotsText
      };
    }
    
    // 기본 단일 시간대 표시
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
    
    return {
      name: schedule.employeeName,
      time: `${startTimeDisplay}-${endTimeDisplay}${breakTime}`
    };
  };

  const weekDates = getWeekDates(currentWeekStart);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 지점명 표시 */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            {branchName} 주간 스케줄
          </h1>
        </div>
        
        {/* 주간 네비게이션 */}
        <div className="bg-white p-4 rounded-lg shadow border mb-6">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0">
            <div className="flex items-center space-x-2 md:space-x-4">
              <button
                onClick={goToPreviousWeek}
                disabled={(() => {
                  // 🔥 2025년 9월 1일 이전으로는 이동 불가
                  const prevWeek = new Date(currentWeekStart);
                  prevWeek.setDate(prevWeek.getDate() - 7);
                  const minDate = new Date('2025-09-01');
                  return prevWeek < minDate;
                })()}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm md:text-base font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                ← 이전주
              </button>
              <span className="text-base md:text-lg font-semibold text-gray-900 text-center">
                {currentWeekStart.getFullYear()}년 {currentWeekStart.getMonth() + 1}월 {currentWeekStart.getDate()}일 주간
              </span>
              <button
                onClick={goToNextWeek}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm md:text-base font-medium text-gray-700"
              >
                다음주 →
              </button>
            </div>
            <div className="text-xs md:text-sm text-gray-600 font-medium">
              읽기 전용
            </div>
          </div>
        </div>

        {/* 사람별 스케줄 테이블 */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {weekDates.map((date, index) => {
                    const dayOfWeek = DAYS_OF_WEEK[index];
                    const redDayInfo = isRedDay(date);
                    return (
                      <th key={index} className={`px-6 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                        redDayInfo.isRed ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        <div>{date.getMonth() + 1}/{date.getDate()}</div>
                        <div className="text-xs">{dayOfWeek.label}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {weeklySummaries
                  .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'))
                  .map((summary, index) => (
                  <tr key={index} className={`hover:bg-gray-50 ${index < weeklySummaries.length - 1 ? 'border-b border-gray-200' : ''}`}>
                    {weekDates.map((date, dayIndex) => {
                      const daySchedules = getSchedulesForDate(date).filter(
                        schedule => schedule.employeeName === summary.employeeName
                      );
                      
                      return (
                        <td key={dayIndex} className="px-2 py-2 text-center align-top">
                          <div className="space-y-1">
                            {daySchedules.map((schedule) => {
                              const scheduleInfo = formatScheduleDisplay(schedule);
                              const dateString = date.toISOString().split('T')[0];
                              const otherBranchKey = `${schedule.employeeId}-${dateString}`;
                              const otherBranchSchedule = otherBranchSchedules[otherBranchKey];
                              
                              return (
                                <div key={schedule.id} className="flex flex-col items-center">
                                  <div className="text-xs p-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200 whitespace-nowrap w-full">
                                    <span className="font-medium">{scheduleInfo.name}</span> {scheduleInfo.time}
                                  </div>
                                  
                                  {/* 다른 지점 스케줄 정보 */}
                                  {otherBranchSchedule && otherBranchSchedule.length > 0 && (
                                    <div className="text-xs text-gray-600 space-y-0.5 mt-1 w-full">
                                      {otherBranchSchedule.map((item, idx) => (
                                        <div key={idx} className="truncate" title={`${item.branchName}: ${item.schedule}`}>
                                          <span className="font-medium">{item.branchName}:</span> {item.schedule}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {daySchedules.length === 0 && (
                              <div className="text-xs text-gray-400">-</div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {weeklySummaries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                      이번 주 스케줄이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 주간 비고 */}
        {weeklyNote && weeklyNote.note && (
          <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">주간 비고</h3>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{weeklyNote.note}</p>
                <div className="mt-3 text-xs text-gray-500">
                  마지막 수정: {weeklyNote.updatedAt.toLocaleString('ko-KR')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 사람별 주간 집계 */}
        {weeklySummaries.length > 0 && (
          <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">사람별 주간 집계</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      이름
                    </th>
                    {DAYS_OF_WEEK.map((day, index) => {
                      const date = weekDates[index];
                      const redDayInfo = isRedDay(date);
                      return (
                        <th key={day.key} className={`px-2 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                          redDayInfo.isRed ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {day.label}
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      총계
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {weeklySummaries.map((summary, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                        {summary.employeeName}
                      </td>
                      {DAYS_OF_WEEK.map((day, dayIndex) => {
                        const hours = summary.dailyHours[day.key] || 0;
                        return (
                          <td key={dayIndex} className="px-2 py-3 text-center text-sm text-gray-900">
                            {hours > 0 ? hours.toFixed(1) : '-'}
                          </td>
                        );
                      })}
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
                    {DAYS_OF_WEEK.map((day, dayIndex) => {
                      const dayTotal = weeklySummaries.reduce((sum, summary) => sum + (summary.dailyHours[day.key] || 0), 0);
                      return (
                        <td key={dayIndex} className="px-2 py-3 text-center text-sm font-bold text-gray-900">
                          {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">
                      {weeklySummaries.reduce((sum, summary) => sum + summary.totalHours, 0).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 시간대별 근무 인원 현황 */}
        {weeklySummaries.length > 0 && (
          <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">시간대별 근무 인원 현황</h3>
              <p className="text-sm text-gray-600 mt-1">특정 시간대에 몇 명이 근무하는지 확인할 수 있습니다</p>
            </div>
            <div className="p-6">
              {(() => {
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
                
                return (
                  <div className="space-y-4">
                    {/* 요일 헤더 */}
                    <div className="flex">
                      <div className="w-16 text-sm font-medium text-gray-700 text-center">시간</div>
                      {weekDates.map((date, index) => {
                        const redDayInfo = isRedDay(date);
                        return (
                          <div key={index} className="flex-1 text-center">
                            <div className={`text-sm font-medium ${redDayInfo.isRed ? 'text-red-600' : 'text-gray-700'}`}>
                              {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className={`text-xs ${redDayInfo.isRed ? 'text-red-500' : 'text-gray-500'}`}>
                              {['월', '화', '수', '목', '금', '토', '일'][index]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* 시간대별 히트맵 */}
                    <div className="space-y-1">
                      {hourlyData.map(({ hour, dayData }) => (
                        <div key={hour} className="flex items-center">
                          <div className="w-16 text-sm font-medium text-gray-700 text-center">
                            {hour}:00
                          </div>
                          {dayData.map((count, dayIndex) => {
                            const bgColor = count === 0 ? 'bg-gray-100' :
                                          count === 1 ? 'bg-green-200' :
                                          count === 2 ? 'bg-green-400' :
                                          count === 3 ? 'bg-yellow-400' :
                                          count >= 4 ? 'bg-red-400' : 'bg-gray-200';
                            
                            return (
                              <div 
                                key={dayIndex} 
                                className={`flex-1 h-8 border border-gray-200 flex items-center justify-center text-xs font-medium transition-all duration-200 ${bgColor}`}
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

        {/* 푸터 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>이 페이지는 읽기 전용입니다. 스케줄 수정은 관리자에게 문의하세요.</p>
        </div>
      </div>
    </div>
  );
}
