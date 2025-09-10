'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import WeeklyScheduleView from './WeeklyScheduleView';
import MultiWeekScheduleView from './MultiWeekScheduleView';

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
  branchName: string;
}

interface Branch {
  id: string;
  name: string;
}

interface ScheduleManagementProps {
  userBranch?: Branch | null;
  isManager?: boolean;
}

export default function ScheduleManagement({ }: ScheduleManagementProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'weekly-view' | 'multi-week' | 'calendar'>('weekly-view');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [formData, setFormData] = useState({
    employeeId: '',
    branchId: '',
    date: '',
    startTime: '',
    endTime: '',
    breakTime: '0'
  });

  useEffect(() => {
    console.log('ScheduleManagement 컴포넌트가 마운트되었습니다.');
    loadSchedules();
    loadEmployees();
    loadBranches();
  }, []);

  // 선택된 월이 변경될 때마다 스케줄 다시 로드
  useEffect(() => {
    if (selectedMonth) {
      loadSchedules();
    }
  }, [selectedMonth]);

  const loadSchedules = async () => {
    console.log('스케줄 목록을 불러오는 중...');
    try {
      const querySnapshot = await getDocs(collection(db, 'schedules'));
      console.log('Firestore에서 받은 스케줄 데이터:', querySnapshot.docs);
      const schedulesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        date: doc.data().date?.toDate() || new Date()
      })) as Schedule[];
      console.log('처리된 스케줄 데이터:', schedulesData);
      setSchedules(schedulesData);
    } catch (error) {
      console.error('스케줄 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const employeesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        branchName: doc.data().branchName
      })) as Employee[];
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

  // 년월 옵션 생성 (현재 달부터 다음 달까지)
  const generateMonthOptions = () => {
    const options: Array<{value: string, label: string}> = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // 현재 달
    options.push({
      value: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      label: `${currentYear}년 ${currentMonth + 1}월`
    });
    
    // 다음 달
    const nextMonth = currentMonth + 1;
    const nextYear = nextMonth >= 12 ? currentYear + 1 : currentYear;
    const adjustedNextMonth = nextMonth >= 12 ? 0 : nextMonth;
    
    options.push({
      value: `${nextYear}-${String(adjustedNextMonth + 1).padStart(2, '0')}`,
      label: `${nextYear}년 ${adjustedNextMonth + 1}월`
    });
    
    return options;
  };

  // 달력 그리드 생성
  const generateCalendarGrid = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const grid = [];
    const currentDate = new Date(startDate);
    
    for (let week = 0; week < 6; week++) {
      const weekDays = [];
      for (let day = 0; day < 7; day++) {
        const isCurrentMonth = currentDate.getMonth() === month;
        const isToday = currentDate.toDateString() === new Date().toDateString();
        
        weekDays.push({
          date: new Date(currentDate),
          isCurrentMonth,
          isToday,
          dayNumber: currentDate.getDate()
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      grid.push(weekDays);
    }
    
    return grid;
  };

  // 해당 날짜의 스케줄 가져오기
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

  const calculateTotalHours = (startTime: string, endTime: string, breakTime: string) => {
    if (!startTime || !endTime) return 0;
    
    // 시간 문자열에서 시간과 분 추출 (예: "10:00" -> 10, "18:00" -> 18)
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    const breakHours = parseFloat(breakTime) || 0;
    
    // 총 근무시간 = 종료시간 - 시작시간 - 휴식시간
    const totalHours = endHour - startHour - breakHours;
    
    return Math.max(0, totalHours);
  };

  // 해당월 근무내역 요약 생성
  const generateMonthlySummary = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    
    // 해당월의 모든 스케줄 필터링
    const monthlySchedules = schedules.filter(schedule => {
      const scheduleDate = new Date(schedule.date);
      return scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month;
    });

    // 직원별 근무시간 집계
    const summaryMap = new Map<string, { totalHours: number, workDays: number }>();
    
    monthlySchedules.forEach(schedule => {
      const employeeName = schedule.employeeName;
      if (!summaryMap.has(employeeName)) {
        summaryMap.set(employeeName, { totalHours: 0, workDays: 0 });
      }
      
      const summary = summaryMap.get(employeeName)!;
      summary.totalHours += schedule.totalHours;
      summary.workDays += 1;
    });

    return Array.from(summaryMap.entries()).map(([employeeName, data]) => ({
      employeeName,
      totalHours: data.totalHours,
      workDays: data.workDays
    })).sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('스케줄 폼 제출됨:', formData);
    
    if (!formData.employeeId || !formData.branchId) {
      alert('직원과 지점을 선택해주세요.');
      return;
    }

    try {
      const selectedEmployee = employees.find(e => e.id === formData.employeeId);
      const selectedBranch = branches.find(b => b.id === formData.branchId);
      
      if (!selectedEmployee || !selectedBranch) {
        alert('직원 또는 지점 정보를 찾을 수 없습니다.');
        return;
      }

      const totalHours = calculateTotalHours(formData.startTime, formData.endTime, formData.breakTime);

      if (editingSchedule) {
        console.log('스케줄 수정 중:', editingSchedule.id);
        await updateDoc(doc(db, 'schedules', editingSchedule.id), {
          ...formData,
          employeeName: selectedEmployee.name,
          branchName: selectedBranch.name,
          totalHours,
          updatedAt: new Date()
        });
        setEditingSchedule(null);
      } else {
        console.log('새 스케줄 추가 중...');
        const docRef = await addDoc(collection(db, 'schedules'), {
          ...formData,
          employeeName: selectedEmployee.name,
          branchName: selectedBranch.name,
          totalHours,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log('스케줄이 추가되었습니다. ID:', docRef.id);
      }

      setFormData({ employeeId: '', branchId: '', date: '', startTime: '', endTime: '', breakTime: '0' });
      setShowForm(false);
      loadSchedules();
    } catch (error) {
      console.error('스케줄 저장 오류:', error);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    console.log('스케줄 수정 모드:', schedule);
    setEditingSchedule(schedule);
    setFormData({
      employeeId: schedule.employeeId,
      branchId: schedule.branchId,
      date: schedule.date.toISOString().split('T')[0],
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      breakTime: schedule.breakTime
    });
    setShowForm(true);
  };


  const handleCancel = () => {
    console.log('스케줄 폼 취소됨');
    setShowForm(false);
    setEditingSchedule(null);
    setFormData({ employeeId: '', branchId: '', date: '', startTime: '', endTime: '', breakTime: '0' });
  };

  const handleAddClick = () => {
    console.log('스케줄 추가 버튼 클릭됨');
    setShowForm(true);
  };

  // 월 변경 핸들러
  const handleMonthChange = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    setSelectedMonth(new Date(year, month - 1, 1));
  };

  // 다음 달로 이동
  const goToNextMonth = () => {
    const nextMonth = new Date(selectedMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setSelectedMonth(nextMonth);
  };

  // 이전 달로 이동
  const goToPreviousMonth = () => {
    const prevMonth = new Date(selectedMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    setSelectedMonth(prevMonth);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          스케줄 관리
        </h3>
        {activeTab === 'calendar' && (
          <button
            onClick={handleAddClick}
            className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
          >
            스케줄 추가
          </button>
        )}
      </div>

      {/* 지점 선택 */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">지점 선택:</label>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">전체 지점</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {selectedBranchId && (
            <span className="text-sm text-gray-800 font-medium">
              {branches.find(b => b.id === selectedBranchId)?.name} 지점 필터링 중
            </span>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('weekly-view')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'weekly-view'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            주간 보기
          </button>
          <button
            onClick={() => setActiveTab('multi-week')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'multi-week'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            스케줄 입력
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'calendar'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            달력 보기
          </button>
        </nav>
      </div>

      {/* 탭 내용 */}
      {activeTab === 'calendar' && (
        <>
          {/* 년월 선택 및 네비게이션 */}
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">년월 선택:</label>
                <select
                  value={`${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {generateMonthOptions().map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={goToPreviousMonth}
                  className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← 이전달
                </button>
                <span className="text-lg font-medium">
                  {selectedMonth.getFullYear()}년 {selectedMonth.getMonth() + 1}월
                </span>
                <button
                  onClick={goToNextMonth}
                  className="p-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  다음달 →
                </button>
              </div>
            </div>
          </div>

          {/* 달력 그리드 - 요일 헤더 없이 날짜만 표시 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 gap-px bg-gray-200">
              {/* 달력 날짜들 - 요일 표시 없이 날짜만 */}
              {generateCalendarGrid().map((week, weekIndex) => (
                week.map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className={`min-h-[120px] p-2 ${
                      day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                    } ${day.isToday ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    {/* 날짜만 표시 - 요일 없음 */}
                    <div className={`text-sm font-medium ${
                      day.isCurrentMonth ? 'text-gray-900' : 'text-gray-600'
                    } ${day.isToday ? 'text-blue-600' : ''}`}>
                      {day.dayNumber}
                    </div>
                    
                    {/* 해당 날짜의 스케줄 표시 */}
                    <div className="mt-1 space-y-1">
                      {getSchedulesForDate(day.date).map((schedule) => (
                        <div
                          key={schedule.id}
                          className="text-xs p-1 bg-blue-100 text-blue-800 rounded truncate cursor-pointer hover:bg-blue-200"
                          onClick={() => handleEdit(schedule)}
                          title={`${schedule.employeeName}: ${schedule.startTime}-${schedule.endTime}`}
                        >
                          {schedule.employeeName} {schedule.startTime.split(':')[0]}-{schedule.endTime.split(':')[0]}
                          {schedule.breakTime !== '0' && `(${schedule.breakTime})`}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ))}
            </div>
          </div>

          {/* 해당월 근무내역 요약 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {selectedMonth.getFullYear()}년 {selectedMonth.getMonth() + 1}월 근무내역
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
                  {generateMonthlySummary().map((summary, index) => (
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
                        {summary.workDays > 0 ? (summary.totalHours / summary.workDays).toFixed(1) : '0.0'}시간
                      </td>
                    </tr>
                  ))}
                  {generateMonthlySummary().length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        해당월에 등록된 스케줄이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}


      {activeTab === 'weekly-view' && (
        <WeeklyScheduleView selectedBranchId={selectedBranchId} />
      )}

      {activeTab === 'multi-week' && (
        <MultiWeekScheduleView selectedBranchId={selectedBranchId} />
      )}

      {showForm && activeTab === 'calendar' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-medium text-gray-900 mb-4">
            {editingSchedule ? '스케줄 수정' : '스케줄 추가'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">직원</label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
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
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
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
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">시작 시간</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">종료 시간</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">휴식 시간 (분)</label>
                <input
                  type="number"
                  value={formData.breakTime}
                  onChange={(e) => setFormData({ ...formData, breakTime: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  required
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
              >
                {editingSchedule ? '수정' : '추가'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}