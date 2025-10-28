'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toLocalDate, toLocalDateString } from '@/utils/dateUtils';

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
  originalInput?: string;
  timeSlots?: Array<{startTime: string; endTime: string; breakTime: number}>;
  createdAt: Date;
  updatedAt: Date;
}

interface DuplicateSchedule {
  employeeId: string;
  employeeName: string;
  branchName: string;
  date: string;
  schedules: Schedule[];
}

export default function DuplicateSchedulesPage() {
  const [duplicates, setDuplicates] = useState<DuplicateSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  // key: `${employeeId}-${date}` -> value: scheduleId to keep
  const [selectedToKeep, setSelectedToKeep] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDuplicateSchedules();
  }, []);

  const loadDuplicateSchedules = async () => {
    try {
      setLoading(true);
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const allSchedules = schedulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toLocalDate(doc.data().createdAt),
        updatedAt: toLocalDate(doc.data().updatedAt),
        date: toLocalDate(doc.data().date)
      })) as Schedule[];

      // 날짜별로 그룹화 (로컬 날짜 기준)
      const dateGroups = allSchedules.reduce((acc, schedule) => {
        const date = schedule.date;
        const dateKey = toLocalDateString(date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(schedule);
        return acc;
      }, {} as {[key: string]: Schedule[]});

      // 중복 스케줄 찾기
      const duplicateGroups: DuplicateSchedule[] = [];
      
      Object.entries(dateGroups).forEach(([date, schedules]) => {
        // 직원별로 그룹화
        const employeeGroups = schedules.reduce((acc, schedule) => {
          const key = `${schedule.employeeId}-${schedule.branchId}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(schedule);
          return acc;
        }, {} as {[key: string]: Schedule[]});

        // 중복이 있는 직원 찾기
        Object.entries(employeeGroups).forEach(([key, employeeSchedules]) => {
          if (employeeSchedules.length > 1) {
            const firstSchedule = employeeSchedules[0];
            duplicateGroups.push({
              employeeId: firstSchedule.employeeId,
              employeeName: firstSchedule.employeeName,
              branchName: firstSchedule.branchName,
              date: date,
              schedules: employeeSchedules.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            });
          }
        });
      });

      setDuplicates(duplicateGroups);
      // 기본 선택값 설정: 각 그룹의 첫 스케줄을 유지 대상으로 설정
      const initialSelected: Record<string, string> = {};
      for (const group of duplicateGroups) {
        const key = `${group.employeeId}-${group.date}`;
        initialSelected[key] = group.schedules[0]?.id || '';
      }
      setSelectedToKeep(initialSelected);
    } catch (error) {
      console.error('중복 스케줄 로드 중 오류:', error);
      alert('중복 스케줄을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDuplicates = async (duplicate: DuplicateSchedule) => {
    const key = `${duplicate.employeeId}-${duplicate.date}`;
    const keepId = selectedToKeep[key] || duplicate.schedules[0]?.id;
    if (!keepId) return;
    if (!confirm(`정말로 ${duplicate.employeeName}님의 ${duplicate.date} 중복 스케줄을 정리하시겠습니까?\n\n선택하신 스케줄만 남기고 나머지를 삭제합니다.`)) {
      return;
    }

    try {
      setDeleting(duplicate.employeeId + duplicate.date);
      
      // 선택된 스케줄을 제외하고 모두 삭제
      const schedulesToDelete = duplicate.schedules.filter(s => s.id !== keepId);
      
      for (const schedule of schedulesToDelete) {
        await deleteDoc(doc(db, 'schedules', schedule.id));
      }
      
      alert(`${schedulesToDelete.length}개의 중복 스케줄이 삭제되었습니다.`);
      await loadDuplicateSchedules();
    } catch (error) {
      console.error('중복 스케줄 삭제 중 오류:', error);
      alert('중복 스케줄 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  const formatScheduleDisplay = (schedule: Schedule) => {
    if (schedule.originalInput) {
      return schedule.originalInput;
    } else if (schedule.timeSlots && schedule.timeSlots.length > 0) {
      return schedule.timeSlots.map(slot => 
        `${slot.startTime}-${slot.endTime}${slot.breakTime > 0 ? `(${slot.breakTime})` : ''}`
      ).join(', ');
    } else {
      return `${schedule.startTime}-${schedule.endTime}${schedule.breakTime !== '0' ? `(${schedule.breakTime})` : ''}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">로딩중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">중복 스케줄 오류</h1>
            <p className="mt-1 text-sm text-gray-600">
              같은 직원의 같은 날짜에 여러 스케줄이 있는 경우를 표시합니다.
            </p>
          </div>
          
          <div className="p-6">
            {duplicates.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-green-600 text-lg font-medium">중복 스케줄이 없습니다!</div>
                <p className="text-gray-500 mt-2">모든 스케줄이 정상적으로 관리되고 있습니다.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {duplicates.map((duplicate, index) => (
                  <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {duplicate.employeeName} ({duplicate.branchName})
                        </h3>
                        <p className="text-sm text-gray-600">
                          {duplicate.date} - {duplicate.schedules.length}개의 중복 스케줄
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteDuplicates(duplicate)}
                        disabled={deleting === duplicate.employeeId + duplicate.date}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting === duplicate.employeeId + duplicate.date ? '삭제중...' : '중복 삭제'}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {duplicate.schedules.map((schedule, scheduleIndex) => (
                        <div 
                          key={schedule.id} 
                          className={`p-3 rounded border ${
                            scheduleIndex === 0 
                              ? 'bg-green-100 border-green-300' 
                              : 'bg-red-100 border-red-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                            <label className="flex items-center space-x-2 cursor-pointer select-none">
                              <input
                                type="radio"
                                name={`${duplicate.employeeId}-${duplicate.date}`}
                                className="h-4 w-4 text-red-600 focus:ring-red-500"
                                checked={(selectedToKeep[`${duplicate.employeeId}-${duplicate.date}`] || duplicate.schedules[0]?.id) === schedule.id}
                                onChange={() => {
                                  const key = `${duplicate.employeeId}-${duplicate.date}`;
                                  setSelectedToKeep(prev => ({ ...prev, [key]: schedule.id }));
                                }}
                              />
                              <span className={`text-sm font-medium ${
                                (selectedToKeep[`${duplicate.employeeId}-${duplicate.date}`] || duplicate.schedules[0]?.id) === schedule.id ? 'text-green-800' : 'text-red-800'
                              }`}>
                                {(selectedToKeep[`${duplicate.employeeId}-${duplicate.date}`] || duplicate.schedules[0]?.id) === schedule.id ? '유지(선택됨)' : '삭제 대상'}
                              </span>
                            </label>
                              <div className="text-sm text-gray-700 mt-1">
                                {formatScheduleDisplay(schedule)}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              생성: {schedule.createdAt.toLocaleString('ko-KR')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
