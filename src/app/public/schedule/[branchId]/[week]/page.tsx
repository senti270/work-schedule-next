'use client';

import { useState, useEffect, use, useCallback } from 'react';
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

interface WeeklySummary {
  employeeName: string;
  dailyHours: { [key: string]: number };
  totalHours: number;
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
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [branchName, setBranchName] = useState<string>('');

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

  useEffect(() => {
    // URL에서 주차 정보 파싱
    const weekDate = new Date(resolvedParams.week);
    setCurrentWeekStart(weekDate);
    loadBranchInfo();
    loadSchedules();
  }, [resolvedParams.week, resolvedParams.branchId, loadBranchInfo, loadSchedules]);

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
    return schedules.filter(schedule => 
      schedule.date.toDateString() === date.toDateString()
    );
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
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm md:text-base font-medium text-gray-700"
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
                    return (
                      <th key={index} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div>{date.getMonth() + 1}/{date.getDate()}</div>
                        <div className="text-xs text-gray-400">{dayOfWeek.label}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {weeklySummaries
                  .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'))
                  .map((summary, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {weekDates.map((date, dayIndex) => {
                      const daySchedules = getSchedulesForDate(date).filter(
                        schedule => schedule.employeeName === summary.employeeName
                      );
                      
                      return (
                        <td key={dayIndex} className="px-2 py-2 text-center">
                          <div className="space-y-1">
                            {daySchedules.map((schedule) => {
                              const scheduleInfo = formatScheduleDisplay(schedule);
                              return (
                                <div
                                  key={schedule.id}
                                  className="text-xs p-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200 whitespace-nowrap"
                                >
                                  <span className="font-medium">{scheduleInfo.name}</span> {scheduleInfo.time}
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

        {/* 푸터 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>이 페이지는 읽기 전용입니다. 스케줄 수정은 관리자에게 문의하세요.</p>
        </div>
      </div>
    </div>
  );
}
