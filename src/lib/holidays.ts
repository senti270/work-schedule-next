// 대한민국 공휴일 관리
export interface Holiday {
  date: string; // YYYY-MM-DD 형식
  name: string;
  isSubstitute?: boolean; // 대체공휴일 여부
}

// 2024-2026년 대한민국 공휴일 데이터
const holidays: Holiday[] = [
  // 2024년
  { date: '2024-01-01', name: '신정' },
  { date: '2024-02-09', name: '설날 연휴' },
  { date: '2024-02-10', name: '설날' },
  { date: '2024-02-11', name: '설날 연휴' },
  { date: '2024-02-12', name: '설날 대체공휴일', isSubstitute: true },
  { date: '2024-03-01', name: '삼일절' },
  { date: '2024-04-10', name: '국회의원선거일' },
  { date: '2024-05-05', name: '어린이날' },
  { date: '2024-05-06', name: '어린이날 대체공휴일', isSubstitute: true },
  { date: '2024-05-15', name: '부처님오신날' },
  { date: '2024-06-06', name: '현충일' },
  { date: '2024-08-15', name: '광복절' },
  { date: '2024-09-16', name: '추석 연휴' },
  { date: '2024-09-17', name: '추석' },
  { date: '2024-09-18', name: '추석 연휴' },
  { date: '2024-10-03', name: '개천절' },
  { date: '2024-10-09', name: '한글날' },
  { date: '2024-12-25', name: '크리스마스' },

  // 2025년
  { date: '2025-01-01', name: '신정' },
  { date: '2025-01-28', name: '설날 연휴' },
  { date: '2025-01-29', name: '설날' },
  { date: '2025-01-30', name: '설날 연휴' },
  { date: '2025-03-01', name: '삼일절' },
  { date: '2025-03-03', name: '삼일절 대체공휴일', isSubstitute: true },
  { date: '2025-05-05', name: '어린이날' },
  { date: '2025-05-13', name: '부처님오신날' },
  { date: '2025-06-06', name: '현충일' },
  { date: '2025-08-15', name: '광복절' },
  { date: '2025-10-05', name: '추석 연휴' },
  { date: '2025-10-06', name: '추석' },
  { date: '2025-10-07', name: '추석 연휴' },
  { date: '2025-10-08', name: '추석 대체공휴일', isSubstitute: true },
  { date: '2025-10-03', name: '개천절' },
  { date: '2025-10-09', name: '한글날' },
  { date: '2025-12-25', name: '크리스마스' },

  // 2026년
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-02', name: '부처님오신날' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '크리스마스' },
];

// 특정 날짜가 공휴일인지 확인
export const isHoliday = (date: Date): Holiday | null => {
  const dateString = date.toISOString().split('T')[0];
  return holidays.find(holiday => holiday.date === dateString) || null;
};

// 특정 날짜가 주말인지 확인 (토요일=6, 일요일=0)
export const isWeekend = (date: Date): boolean => {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

// 특정 날짜가 빨간색으로 표시되어야 하는지 확인 (주말 또는 공휴일)
export const isRedDay = (date: Date): { isRed: boolean; reason: string; holiday?: Holiday } => {
  const holiday = isHoliday(date);
  const weekend = isWeekend(date);
  
  if (holiday) {
    return { isRed: true, reason: holiday.name, holiday };
  } else if (weekend) {
    const dayName = date.getDay() === 0 ? '일요일' : '토요일';
    return { isRed: true, reason: dayName };
  } else {
    return { isRed: false, reason: '' };
  }
};

// 월별 공휴일 목록 가져오기
export const getMonthHolidays = (year: number, month: number): Holiday[] => {
  return holidays.filter(holiday => {
    const holidayDate = new Date(holiday.date);
    return holidayDate.getFullYear() === year && holidayDate.getMonth() === month;
  });
};

// 연도별 공휴일 목록 가져오기
export const getYearHolidays = (year: number): Holiday[] => {
  return holidays.filter(holiday => {
    const holidayDate = new Date(holiday.date);
    return holidayDate.getFullYear() === year;
  });
};
