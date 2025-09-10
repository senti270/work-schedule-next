'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface WeeklyScheduleViewProps {
  selectedBranchId?: string;
}

export default function WeeklyScheduleView({ selectedBranchId }: WeeklyScheduleViewProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date());
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 이번 주 월요일로 설정
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    setCurrentWeekStart(monday);
  }, []);

  const loadSchedules = useCallback(async () => {
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
      generateWeeklySummary(schedulesData);
    } catch (error) {
      console.error('스케줄 목록을 불러올 수 없습니다:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart, selectedBranchId]);

  useEffect(() => {
    if (currentWeekStart) {
      loadSchedules();
    }
  }, [currentWeekStart, loadSchedules]);

  const generateWeeklySummary = (schedulesData: Schedule[]) => {
    const weekDates = getWeekDates(currentWeekStart);
    const summaryMap = new Map<string, WeeklySummary>();

    // 주간 스케줄 필터링
    const weekSchedules = schedulesData.filter(schedule => {
      const scheduleDate = new Date(schedule.date);
      return weekDates.some(weekDate => 
        scheduleDate.toDateString() === weekDate.toDateString()
      );
    });

    // 각 직원별로 요일별 근무시간 계산
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
    const startHour = schedule.startTime.split(':')[0];
    const endHour = schedule.endTime.split(':')[0];
    const breakTime = schedule.breakTime !== '0' ? formatDecimalTime(schedule.breakTime) : '';
    
    return `${schedule.employeeName} ${startHour}-${endHour}${breakTime}`;
  };

  const goToPreviousWeek = () => {
    const prevWeek = new Date(currentWeekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    setCurrentWeekStart(prevWeek);
  };

  const goToNextWeek = () => {
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setCurrentWeekStart(nextWeek);
  };

  const handleShare = async () => {
    const weekString = currentWeekStart.toISOString().split('T')[0];
    const shareUrl = `${window.location.origin}/public/schedule/${selectedBranchId || 'all'}/${weekString}`;
    
    // Web Share API 지원 확인
    if (navigator.share) {
      try {
        await navigator.share({
          title: '주간 스케줄 공유',
          text: '주간 스케줄을 확인해보세요!',
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
    
    // Web Share API를 지원하지 않거나 실패한 경우 클립보드 복사
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('공유 링크가 클립보드에 복사되었습니다!');
    } catch (error) {
      // 클립보드 복사 실패 시 대체 방법
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('공유 링크가 클립보드에 복사되었습니다!');
    }
  };

  const weekDates = getWeekDates(currentWeekStart);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 주간 네비게이션 */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreviousWeek}
              className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-900 font-medium"
            >
              ← 이전주
            </button>
            <span className="text-lg font-medium text-gray-900">
              {currentWeekStart.getFullYear()}년 {currentWeekStart.getMonth() + 1}월 {currentWeekStart.getDate()}일 주간
            </span>
            <button
              onClick={goToNextWeek}
              className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-900 font-medium"
            >
              다음주 →
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleShare}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              <span>공유</span>
            </button>
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
                    <th key={index} className="px-6 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider">
                      <div>{date.getMonth() + 1}/{date.getDate()}</div>
                      <div className="text-xs text-gray-800">{dayOfWeek.label}</div>
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
                          {daySchedules.map((schedule) => (
                            <div
                              key={schedule.id}
                              className="text-xs p-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-200"
                            >
                              {formatScheduleDisplay(schedule)}
                            </div>
                          ))}
                          {daySchedules.length === 0 && (
                            <div className="text-xs text-gray-800">-</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {weeklySummaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-800">
                    이번 주 스케줄이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 사람별 주간 집계 테이블 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">사람별 주간 집계</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                  이름
                </th>
                {weekDates.map((date, index) => {
                  const dayOfWeek = DAYS_OF_WEEK[index];
                  return (
                    <th key={index} className="px-6 py-3 text-left text-xs font-medium text-gray-800 uppercase tracking-wider">
                      {date.getMonth() + 1}/{date.getDate()} ({dayOfWeek.label})
                    </th>
                  );
                })}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                  총합
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {weeklySummaries.map((summary, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {summary.employeeName}
                  </td>
                  {DAYS_OF_WEEK.map((day) => (
                    <td key={day.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {summary.dailyHours[day.key] ? summary.dailyHours[day.key].toFixed(1) : '-'}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {summary.totalHours.toFixed(1)}
                  </td>
                </tr>
              ))}
              {weeklySummaries.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
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
}
